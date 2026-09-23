import { describe, expect, it } from 'vitest';
import {
  createObservedHttpHandler,
  type OperationalLogEvent,
} from '../src/index.js';

describe('HTTP observability', () => {
  it('propagates a valid request id through the request, response and completion log', async () => {
    const events: OperationalLogEvent[] = [];
    let innerRequestId: string | null = null;
    let nowIndex = 0;
    const nowValues = [100, 107];

    const handler = createObservedHttpHandler(
      async (request) => {
        innerRequestId = request.headers.get('x-request-id');
        return Response.json({ ok: true });
      },
      { log: (event) => events.push(event) },
      {
        requestIdFactory: () => 'generated-id',
        now: () => nowValues[nowIndex++] ?? 107,
      },
    );

    const response = await handler(
      new Request('https://portfolio.test/properties', {
        headers: { 'x-request-id': 'client-request-42' },
      }),
    );

    expect(innerRequestId).toBe('client-request-42');
    expect(response.headers.get('x-request-id')).toBe('client-request-42');
    expect(events).toEqual([
      {
        level: 'info',
        event: 'http.request.completed',
        requestId: 'client-request-42',
        method: 'GET',
        path: '/properties',
        status: 200,
        durationMs: 7,
      },
    ]);
  });

  it('replaces unsafe request ids instead of reflecting them into logs', async () => {
    const events: OperationalLogEvent[] = [];

    const handler = createObservedHttpHandler(
      async () => new Response(null, { status: 204 }),
      { log: (event) => events.push(event) },
      {
        requestIdFactory: () => 'server-generated-id',
        now: () => 1,
      },
    );

    const response = await handler(
      new Request('https://portfolio.test/properties', {
        headers: { 'x-request-id': 'unsafe request id\nforged' },
      }),
    );

    expect(response.headers.get('x-request-id')).toBe('server-generated-id');
    expect(events[0]?.requestId).toBe('server-generated-id');
  });

  it('surfaces operational error codes for failed requests', async () => {
    const events: OperationalLogEvent[] = [];

    const handler = createObservedHttpHandler(
      async () =>
        Response.json(
          {
            error: {
              code: 'DOCUMENT_STORAGE_RECONCILIATION_REQUIRED',
              message: 'Storage reconciliation is required.',
            },
          },
          { status: 503 },
        ),
      { log: (event) => events.push(event) },
      {
        requestIdFactory: () => 'request-503',
        now: () => 10,
      },
    );

    const response = await handler(
      new Request('https://portfolio.test/documents/1/versions'),
    );

    expect(response.status).toBe(503);
    expect(events[0]).toMatchObject({
      level: 'error',
      event: 'http.request.failed',
      requestId: 'request-503',
      status: 503,
      errorCode: 'DOCUMENT_STORAGE_RECONCILIATION_REQUIRED',
    });
  });

  it('does not inspect successful binary response bodies', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const handler = createObservedHttpHandler(
      async () =>
        new Response(bytes, {
          status: 200,
          headers: { 'content-type': 'application/octet-stream' },
        }),
      { log: () => undefined },
      {
        requestIdFactory: () => 'binary-request',
        now: () => 10,
      },
    );

    const response = await handler(
      new Request('https://portfolio.test/documents/1/content'),
    );

    expect(Array.from(new Uint8Array(await response.arrayBuffer()))).toEqual([
      1, 2, 3, 4,
    ]);
  });
});
