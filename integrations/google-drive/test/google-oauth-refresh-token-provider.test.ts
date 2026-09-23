import { describe, expect, it } from 'vitest';
import { GoogleOAuthRefreshTokenProvider } from '../src/index.js';

describe('GoogleOAuthRefreshTokenProvider', () => {
  it('exchanges refresh credentials and reuses an unexpired access token', async () => {
    const requests: URLSearchParams[] = [];
    let now = 1_000_000;
    const provider = new GoogleOAuthRefreshTokenProvider({
      clientId: 'client-id',
      clientSecret: 'client-secret',
      refreshToken: 'refresh-token',
      now: () => now,
      fetchImpl: (async (_input, init) => {
        requests.push(new URLSearchParams(String(init?.body ?? '')));
        return Response.json({
          access_token: 'access-1',
          expires_in: 3600,
        });
      }) as typeof fetch,
    });

    await expect(provider.getAccessToken()).resolves.toBe('access-1');
    now += 60_000;
    await expect(provider.getAccessToken()).resolves.toBe('access-1');

    expect(requests).toHaveLength(1);
    expect(requests[0]?.get('client_id')).toBe('client-id');
    expect(requests[0]?.get('client_secret')).toBe('client-secret');
    expect(requests[0]?.get('refresh_token')).toBe('refresh-token');
    expect(requests[0]?.get('grant_type')).toBe('refresh_token');
  });

  it('refreshes before expiry and does not expose provider response bodies on failure', async () => {
    let now = 1_000_000;
    let call = 0;
    const provider = new GoogleOAuthRefreshTokenProvider({
      clientId: 'client-id',
      clientSecret: 'client-secret',
      refreshToken: 'refresh-token',
      now: () => now,
      fetchImpl: (async () => {
        call += 1;
        if (call === 1) {
          return Response.json({ access_token: 'access-1', expires_in: 120 });
        }
        return new Response('sensitive-provider-detail', { status: 401 });
      }) as typeof fetch,
    });

    await expect(provider.getAccessToken()).resolves.toBe('access-1');
    now += 61_000;

    await expect(provider.getAccessToken()).rejects.toThrow(
      'Google OAuth token request failed with HTTP 401.',
    );
  });
});
