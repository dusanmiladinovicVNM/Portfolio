import { describe, expect, it, vi } from 'vitest';
import { SupabaseStaffAuthAdmin } from '../src/supabase-staff-auth-admin.js';

function client(fetchImpl: typeof fetch) {
  return new SupabaseStaffAuthAdmin({
    supabaseUrl: 'https://project.supabase.co',
    serviceRoleKey: 'server-secret',
    webOrigin: 'https://portfolio.example.com',
    fetchImpl,
  });
}

describe('SupabaseStaffAuthAdmin', () => {
  it('reuses an existing exact-email Auth identity without another invite', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      expect(request.headers.get('apikey')).toBe('server-secret');
      expect(request.headers.get('authorization')).toBe('Bearer server-secret');
      return Response.json({
        users: [{
          id: 'auth-existing',
          email: 'staff@example.test',
          email_confirmed_at: '2026-09-25T06:00:00.000Z',
        }],
      });
    }) as unknown as typeof fetch;

    await expect(client(fetchImpl).ensureInvitedUser('Staff@Example.Test')).resolves.toEqual({
      subject: 'auth-existing',
      email: 'staff@example.test',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('resends an invite for an existing unconfirmed exact-email user and preserves its subject', async () => {
    const requests: Request[] = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      requests.push(request);
      if (request.method === 'GET') {
        return Response.json({
          users: [{
            id: 'auth-unconfirmed',
            email: 'staff@example.test',
            email_confirmed_at: null,
          }],
        });
      }
      return Response.json({
        id: 'auth-unconfirmed',
        email: 'staff@example.test',
        email_confirmed_at: null,
      });
    }) as unknown as typeof fetch;

    await expect(client(fetchImpl).ensureInvitedUser('staff@example.test')).resolves.toEqual({
      subject: 'auth-unconfirmed',
      email: 'staff@example.test',
    });
    expect(requests).toHaveLength(2);
    expect(requests[1]!.method).toBe('POST');
    expect(requests[1]!.url).toContain('/auth/v1/invite');
    expect(await requests[1]!.json()).toEqual({ email: 'staff@example.test' });
  });


  it('sends password recovery for an existing confirmed linked user', async () => {
    const requests: Request[] = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      requests.push(request);
      if (request.method === 'GET') {
        return Response.json({
          users: [{
            id: 'auth-confirmed',
            email: 'staff@example.test',
            email_confirmed_at: '2026-09-25T06:00:00.000Z',
          }],
        });
      }
      expect(request.url).toContain('/auth/v1/recover');
      expect(request.url).toContain('redirect_to=https%3A%2F%2Fportfolio.example.com');
      expect(await request.json()).toEqual({ email: 'staff@example.test' });
      return Response.json({});
    }) as unknown as typeof fetch;

    await expect(
      client(fetchImpl).sendAccessEmail('staff@example.test', 'auth-confirmed'),
    ).resolves.toBeUndefined();

    expect(requests).toHaveLength(2);
    expect(requests[1]!.method).toBe('POST');
  });

  it('resends the invite for an existing unconfirmed linked user', async () => {
    const requests: Request[] = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      requests.push(request);
      if (request.method === 'GET') {
        return Response.json({
          users: [{
            id: 'auth-unconfirmed',
            email: 'staff@example.test',
            email_confirmed_at: null,
          }],
        });
      }
      return Response.json({
        id: 'auth-unconfirmed',
        email: 'staff@example.test',
        email_confirmed_at: null,
      });
    }) as unknown as typeof fetch;

    await expect(
      client(fetchImpl).sendAccessEmail('staff@example.test', 'auth-unconfirmed'),
    ).resolves.toBeUndefined();

    expect(requests.some((request) => request.url.includes('/auth/v1/invite'))).toBe(true);
    expect(requests.some((request) => request.url.includes('/auth/v1/recover'))).toBe(false);
  });

  it('refuses access recovery when the linked subject no longer matches Supabase Auth', async () => {
    const fetchImpl = vi.fn(async () => Response.json({
      users: [{
        id: 'different-subject',
        email: 'staff@example.test',
        email_confirmed_at: '2026-09-25T06:00:00.000Z',
      }],
    })) as unknown as typeof fetch;

    await expect(
      client(fetchImpl).sendAccessEmail('staff@example.test', 'expected-subject'),
    ).rejects.toMatchObject({ code: 'STAFF_AUTH_IDENTITY_MISMATCH' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('invites a missing user and returns the exact external subject', async () => {
    const requests: Request[] = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      requests.push(request);
      if (request.method === 'GET') return Response.json({ users: [] });
      return Response.json({ id: 'auth-new', email: 'staff@example.test' });
    }) as unknown as typeof fetch;

    await expect(client(fetchImpl).ensureInvitedUser('staff@example.test')).resolves.toEqual({
      subject: 'auth-new',
      email: 'staff@example.test',
    });
    expect(requests).toHaveLength(2);
    expect(requests[1]!.url).toContain('/auth/v1/invite');
    expect(requests[1]!.url).toContain('redirect_to=');
    expect(await requests[1]!.json()).toEqual({ email: 'staff@example.test' });
  });

  it('reconciles an ambiguous invite acknowledgement before returning failure', async () => {
    let lookup = 0;
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      if (request.method === 'GET') {
        lookup += 1;
        return Response.json({
          users:
            lookup === 1
              ? []
              : [{ id: 'auth-reconciled', email: 'staff@example.test' }],
        });
      }
      throw new TypeError('connection reset after send');
    }) as unknown as typeof fetch;

    await expect(client(fetchImpl).ensureInvitedUser('staff@example.test')).resolves.toEqual({
      subject: 'auth-reconciled',
      email: 'staff@example.test',
    });
  });
});
