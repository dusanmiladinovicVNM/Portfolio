import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHealthHttpHandler } from '../src/index.js';

describe('health HTTP routes', () => {
  afterEach(() => {
    vi.useRealTimers();
  });
  it('serves liveness without invoking dependencies', async () => {
    let readinessCalls = 0;
    const handler = createHealthHttpHandler(
      {
        readinessCheck: async () => {
          readinessCalls += 1;
        },
      },
      { version: 'abc123' },
    );

    const response = await handler(
      new Request('https://portfolio.test/health/live'),
      '/health/live',
    );

    expect(response?.status).toBe(200);
    expect(readinessCalls).toBe(0);
    await expect(response?.json()).resolves.toEqual({
      status: 'ok',
      service: 'portfolio-api',
      version: 'abc123',
    });
  });

  it('bounds a readiness check that never resolves', async () => {
    vi.useFakeTimers();
    const handler = createHealthHttpHandler(
      {
        readinessCheck: () => new Promise<void>(() => undefined),
      },
      { readinessTimeoutMs: 25 },
    );

    const responsePromise = handler(
      new Request('https://portfolio.test/health/ready'),
      '/health/ready',
    );

    await vi.advanceTimersByTimeAsync(25);
    const response = await responsePromise;

    expect(response?.status).toBe(503);
    await expect(response?.json()).resolves.toEqual({
      error: {
        code: 'SERVICE_NOT_READY',
        message: 'Required service dependencies are unavailable.',
      },
    });
  });

  it('reports readiness only when the database probe succeeds', async () => {
    const ready = createHealthHttpHandler({
      readinessCheck: async () => undefined,
    });
    const unavailable = createHealthHttpHandler({
      readinessCheck: async () => {
        throw new Error('database unavailable');
      },
    });

    const readyResponse = await ready(
      new Request('https://portfolio.test/health/ready'),
      '/health/ready',
    );
    const unavailableResponse = await unavailable(
      new Request('https://portfolio.test/health/ready'),
      '/health/ready',
    );

    expect(readyResponse?.status).toBe(200);
    expect(unavailableResponse?.status).toBe(503);
    await expect(unavailableResponse?.json()).resolves.toEqual({
      error: {
        code: 'SERVICE_NOT_READY',
        message: 'Required service dependencies are unavailable.',
      },
    });
  });
});
