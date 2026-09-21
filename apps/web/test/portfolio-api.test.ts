import { describe, expect, it, vi } from 'vitest';
import {
  createPortfolioApi,
  PortfolioApiError,
  type ResponseSchema,
} from '../src/api/portfolio-api.js';

const stringSchema: ResponseSchema<string> = {
  safeParse(value) {
    return typeof value === 'string'
      ? { success: true, data: value }
      : { success: false, error: new Error('not a string') };
  },
};

describe('Portfolio API client', () => {
  it('sends the bearer token and returns contract-validated data', async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.headers).toEqual({
        Accept: 'application/json',
        Authorization: 'Bearer token-123',
      });
      return new Response(JSON.stringify({ data: 'ok' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const api = createPortfolioApi({
      baseUrl: '/functions/v1/api/',
      getAccessToken: () => 'token-123',
      fetchImpl: fetchImpl as typeof fetch,
    });

    await expect(api.get('/reporting/dashboard', stringSchema)).resolves.toBe('ok');
    expect(fetchImpl).toHaveBeenCalledWith(
      '/functions/v1/api/reporting/dashboard',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('fails closed before transport when no auth session exists', async () => {
    const fetchImpl = vi.fn();
    const api = createPortfolioApi({
      baseUrl: '/api',
      getAccessToken: () => null,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await expect(api.get('/properties', stringSchema)).rejects.toMatchObject({
      status: 401,
      code: 'AUTH_SESSION_REQUIRED',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects a successful response that violates the supplied contract', async () => {
    const api = createPortfolioApi({
      baseUrl: '/api',
      getAccessToken: () => 'token',
      fetchImpl: (async () =>
        new Response(JSON.stringify({ data: 42 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })) as typeof fetch,
    });

    await expect(api.get('/properties', stringSchema)).rejects.toEqual(
      expect.objectContaining<Partial<PortfolioApiError>>({
        status: 502,
        code: 'API_RESPONSE_INVALID',
      }),
    );
  });
});
