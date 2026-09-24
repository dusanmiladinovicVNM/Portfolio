import { describe, expect, it } from 'vitest';
import { ApplicationError } from '@portfolio/application';
import {
  MAX_JSON_REQUEST_BODY_BYTES,
  requestJson,
} from '../src/http-utils.js';

async function expectCode(promise: Promise<unknown>, code: string) {
  try {
    await promise;
    throw new Error('Expected requestJson to reject.');
  } catch (error) {
    expect(error).toBeInstanceOf(ApplicationError);
    expect((error as ApplicationError).code).toBe(code);
  }
}

describe('requestJson resource limit', () => {
  it('parses normal JSON bodies', async () => {
    const request = new Request('https://example.test', {
      method: 'POST',
      body: JSON.stringify({ ok: true }),
    });

    await expect(requestJson(request)).resolves.toEqual({ ok: true });
  });

  it('rejects an announced body above the JSON ceiling', async () => {
    const request = new Request('https://example.test', {
      method: 'POST',
      headers: {
        'content-length': String(MAX_JSON_REQUEST_BODY_BYTES + 1),
      },
      body: '{}',
    });

    await expectCode(requestJson(request), 'REQUEST_BODY_TOO_LARGE');
  });

  it('rejects a body above the JSON ceiling without Content-Length', async () => {
    const request = new Request('https://example.test', {
      method: 'POST',
      body: JSON.stringify({
        value: 'x'.repeat(MAX_JSON_REQUEST_BODY_BYTES),
      }),
    });

    await expectCode(requestJson(request), 'REQUEST_BODY_TOO_LARGE');
  });
});
