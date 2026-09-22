import { describe, expect, it, vi } from 'vitest';
import {
  createPortfolioApi,
  isAmbiguousWriteFailure,
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
      expect.objectContaining({ method: 'GET', credentials: 'omit' }),
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

  it('fetches binary content with the same bearer-auth boundary', async () => {
    const payload = new Uint8Array([1, 2, 3, 4]);
    const fetchImpl = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        expect(init?.headers).toEqual({
          Accept: 'application/octet-stream',
          Authorization: 'Bearer token-123',
        });
        return new Response(payload, {
          status: 200,
          headers: { 'Content-Type': 'application/pdf' },
        });
      },
    );

    const api = createPortfolioApi({
      baseUrl: '/api',
      getAccessToken: () => 'token-123',
      fetchImpl: fetchImpl as typeof fetch,
    });

    const blob = await api.getBinary(
      '/document-versions/11111111-1111-4111-8111-111111111111/content',
    );
    expect(blob.type).toBe('application/pdf');
    expect([...new Uint8Array(await blob.arrayBuffer())]).toEqual([
      1, 2, 3, 4,
    ]);
  });

  it('maps binary API errors through the shared PortfolioApiError contract', async () => {
    const api = createPortfolioApi({
      baseUrl: '/api',
      getAccessToken: () => 'token',
      fetchImpl: (async () =>
        new Response(
          JSON.stringify({
            error: {
              code: 'DOCUMENT_BINARY_MISSING',
              message: 'Document binary is missing from storage.',
            },
          }),
          {
            status: 404,
            headers: { 'Content-Type': 'application/json' },
          },
        )) as typeof fetch,
    });

    await expect(
      api.getBinary(
        '/document-versions/11111111-1111-4111-8111-111111111111/content',
      ),
    ).rejects.toEqual(
      expect.objectContaining<Partial<PortfolioApiError>>({
        status: 404,
        code: 'DOCUMENT_BINARY_MISSING',
      }),
    );
  });

  it('does not attempt a binary transport without an auth session', async () => {
    const fetchImpl = vi.fn();
    const api = createPortfolioApi({
      baseUrl: '/api',
      getAccessToken: () => null,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await expect(
      api.getBinary(
        '/document-versions/11111111-1111-4111-8111-111111111111/content',
      ),
    ).rejects.toMatchObject({
      status: 401,
      code: 'AUTH_SESSION_REQUIRED',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });


  it('uploads authenticated binary content without JSON encoding', async () => {
    const requests: Request[] = [];
    const fetchImpl = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = new Request(input, init);
        requests.push(request);
        return new Response(
          JSON.stringify({ data: 'stored' }),
          {
            status: 201,
            headers: { 'Content-Type': 'application/json' },
          },
        );
      },
    );

    const api = createPortfolioApi({
      baseUrl: 'https://portfolio.test/api',
      getAccessToken: () => 'token-123',
      fetchImpl: fetchImpl as typeof fetch,
    });

    const blob = new Blob([new Uint8Array([1, 2, 3])], {
      type: 'application/pdf',
    });

    await expect(
      api.postBinary(
        '/documents/doc/versions?fileName=lease.pdf&expectedDocumentRevision=1',
        blob,
        stringSchema,
      ),
    ).resolves.toBe('stored');

    expect(requests).toHaveLength(1);
    const request = requests[0]!;
    expect(request.method).toBe('POST');
    expect(request.credentials).toBe('omit');
    expect(request.headers.get('authorization')).toBe('Bearer token-123');
    expect(request.headers.get('content-type')).toBe('application/pdf');
    expect([...new Uint8Array(await request.arrayBuffer())]).toEqual([1, 2, 3]);
  });

  it('reconciles only genuinely ambiguous write failures', () => {
    expect(
      isAmbiguousWriteFailure(
        new PortfolioApiError(503, 'ACK_LOST', 'Acknowledgement lost.'),
      ),
    ).toBe(true);
    expect(
      isAmbiguousWriteFailure(
        new PortfolioApiError(502, 'API_RESPONSE_INVALID', 'Invalid response.'),
      ),
    ).toBe(true);
    expect(isAmbiguousWriteFailure(new TypeError('network failed'))).toBe(true);

    expect(
      isAmbiguousWriteFailure(
        new PortfolioApiError(409, 'VERSION_CONFLICT', 'Version conflict.'),
      ),
    ).toBe(false);
    expect(
      isAmbiguousWriteFailure(
        new PortfolioApiError(422, 'VALIDATION_FAILED', 'Rejected.'),
      ),
    ).toBe(false);
    expect(
      isAmbiguousWriteFailure(
        new PortfolioApiError(403, 'FORBIDDEN', 'Forbidden.'),
      ),
    ).toBe(false);
  });

  it('sends authenticated JSON POST and PATCH requests through the same error boundary', async () => {
    const requests: Request[] = [];
    const fetchImpl = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = new Request(input, init);
        requests.push(request);
        return new Response(
          JSON.stringify({ data: { id: 'ok' } }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        );
      },
    );

    const schema = {
      safeParse(value: unknown) {
        return typeof value === 'object' && value !== null && 'id' in value
          ? { success: true as const, data: value as { id: string } }
          : { success: false as const, error: 'invalid' };
      },
    };

    const api = createPortfolioApi({
      baseUrl: 'https://portfolio.test/api',
      getAccessToken: () => 'token-123',
      fetchImpl: fetchImpl as typeof fetch,
    });

    await api.post('/inspections/one/start', { expectedVersion: 1 }, schema);
    await api.patch(
      '/inspections/one/sections/two',
      { expectedRevision: 0, set: [], clear: ['x'] },
      schema,
    );

    expect(requests.map((request) => request.method)).toEqual([
      'POST',
      'PATCH',
    ]);
    for (const request of requests) {
      expect(request.credentials).toBe('omit');
      expect(request.headers.get('authorization')).toBe('Bearer token-123');
      expect(request.headers.get('content-type')).toBe('application/json');
    }
    expect(await requests[0]!.json()).toEqual({ expectedVersion: 1 });
    expect(await requests[1]!.json()).toEqual({
      expectedRevision: 0,
      set: [],
      clear: ['x'],
    });
  });

});
