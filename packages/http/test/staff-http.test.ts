import { describe, expect, it } from 'vitest';
import { asUserId, type UserId } from '@portfolio/domain';
import {
  type Actor,
  type StaffAccount,
  type StaffAdministrationRepository,
  type StaffRole,
  type StaffStatus,
} from '@portfolio/application';
import { handleStaffHttp } from '../src/staff-http-routes.js';

class StaffRepo implements StaffAdministrationRepository {
  readonly rows = new Map<string, StaffAccount>();

  async listStaff() {
    return [...this.rows.values()];
  }
  async getStaffById(userId: UserId) {
    return this.rows.get(userId) ?? null;
  }
  async insertStaff(staff: StaffAccount) {
    this.rows.set(staff.userId, staff);
  }
  async updateStaffRole(userId: UserId, role: StaffRole, expectedRevision: number) {
    const current = this.rows.get(userId);
    if (!current || current.revision !== expectedRevision) return false;
    this.rows.set(userId, { ...current, role, revision: current.revision + 1 });
    return true;
  }
  async updateStaffStatus(userId: UserId, status: StaffStatus, expectedRevision: number) {
    const current = this.rows.get(userId);
    if (!current || current.revision !== expectedRevision) return false;
    this.rows.set(userId, { ...current, status, revision: current.revision + 1 });
    return true;
  }
  async linkSupabaseIdentityAndActivate(userId: UserId, subject: string, expectedRevision: number) {
    const current = this.rows.get(userId);
    if (!current || current.revision !== expectedRevision) return false;
    this.rows.set(userId, {
      ...current,
      status: 'active',
      revision: current.revision + 1,
      identities: [...current.identities, { provider: 'supabase', subject }],
    });
    return true;
  }
}

const adminId = asUserId('71000000-0000-4000-8000-000000000001');
const managerId = asUserId('71000000-0000-4000-8000-000000000002');
const newId = asUserId('71000000-0000-4000-8000-000000000003');

function account(userId: UserId, role: StaffRole): StaffAccount {
  return {
    userId,
    displayName: role,
    email: role + '@example.test',
    role,
    status: 'active',
    revision: 1,
    identities: [{ provider: 'supabase', subject: role + '-subject' }],
  };
}

function request(path: string, method = 'GET', body?: unknown) {
  return new Request('https://example.test' + path, {
    method,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

describe('Staff HTTP routes', () => {
  it('exposes /me to any resolved actor but keeps /staff admin-only', async () => {
    const repo = new StaffRepo();
    repo.rows.set(managerId, account(managerId, 'manager'));
    const manager: Actor = { userId: managerId, role: 'manager' };
    const deps = {
      staffRepository: repo,
      authAdmin: {
        ensureInvitedUser: async (email: string) => ({ subject: 'unused', email }),
        sendAccessEmail: async () => {},
      },
      idGenerator: { next: () => newId },
    };

    const me = await handleStaffHttp(deps, manager, request('/me'), '/me');
    expect(me?.status).toBe(200);
    expect(await me?.json()).toMatchObject({
      data: { userId: managerId, role: 'manager' },
    });

    await expect(
      handleStaffHttp(deps, manager, request('/staff'), '/staff'),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('creates inactive staff and invites the exact canonical user through the server auth port', async () => {
    const repo = new StaffRepo();
    repo.rows.set(adminId, account(adminId, 'admin'));
    const admin: Actor = { userId: adminId, role: 'admin' };
    const deps = {
      staffRepository: repo,
      authAdmin: {
        ensureInvitedUser: async (email: string) => ({
          subject: 'supabase-new',
          email,
        }),
        sendAccessEmail: async () => {},
      },
      idGenerator: { next: () => newId },
    };

    const create = await handleStaffHttp(
      deps,
      admin,
      request('/staff', 'POST', {
        displayName: 'Inspector',
        email: 'Inspector@Example.Test',
        role: 'inspector',
      }),
      '/staff',
    );
    expect(create?.status).toBe(201);
    expect(await create?.json()).toMatchObject({
      data: {
        userId: newId,
        email: 'inspector@example.test',
        status: 'inactive',
        revision: 1,
        identityProviders: [],
      },
    });

    const invite = await handleStaffHttp(
      deps,
      admin,
      request('/staff/' + newId + '/invite', 'POST', {
        expectedRevision: 1,
      }),
      '/staff/' + newId + '/invite',
    );
    expect(invite?.status).toBe(200);
    expect(await invite?.json()).toMatchObject({
      data: {
        userId: newId,
        status: 'active',
        revision: 2,
        identityProviders: ['supabase'],
      },
    });
  });

  it('sends an access-recovery email for linked active staff without changing canonical status or revision', async () => {
    const repo = new StaffRepo();
    repo.rows.set(adminId, account(adminId, 'admin'));
    repo.rows.set(newId, {
      ...account(newId, 'inspector'),
      email: 'inspector@example.test',
      revision: 4,
    });
    const admin: Actor = { userId: adminId, role: 'admin' };
    let accessEmailCalls = 0;
    const deps = {
      staffRepository: repo,
      authAdmin: {
        ensureInvitedUser: async () => {
          throw new Error('linked staff must not use initial invite provisioning');
        },
        sendAccessEmail: async (email: string, expectedSubject: string) => {
          accessEmailCalls += 1;
          expect(email).toBe('inspector@example.test');
          expect(expectedSubject).toBe('inspector-subject');
        },
      },
      idGenerator: { next: () => newId },
    };

    const response = await handleStaffHttp(
      deps,
      admin,
      request('/staff/' + newId + '/invite', 'POST', {
        expectedRevision: 4,
      }),
      '/staff/' + newId + '/invite',
    );

    expect(response?.status).toBe(200);
    expect(accessEmailCalls).toBe(1);
    expect(await response?.json()).toMatchObject({
      data: {
        userId: newId,
        status: 'active',
        revision: 4,
        identityProviders: ['supabase'],
      },
    });
    expect(repo.rows.get(newId)).toMatchObject({
      status: 'active',
      revision: 4,
    });
  });
});
