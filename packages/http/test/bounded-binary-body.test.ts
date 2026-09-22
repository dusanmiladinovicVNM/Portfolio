import { describe, expect, it } from 'vitest';
import { ApplicationError } from '@portfolio/application';
import { readBoundedBinaryBody } from '../src/bounded-binary-body.js';

function streamRequest(
  chunks: readonly Uint8Array[],
  options: {
    readonly contentLength?: string;
    readonly onPull?: () => void;
    readonly onCancel?: () => void;
  } = {},
): Request {
  let index = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      options.onPull?.();
      const chunk = chunks[index++];
      if (!chunk) {
        controller.close();
        return;
      }
      controller.enqueue(chunk);
    },
    cancel() {
      options.onCancel?.();
    },
  });

  const headers = new Headers();
  if (options.contentLength !== undefined) {
    headers.set('content-length', options.contentLength);
  }

  return new Request('https://portfolio.test/upload', {
    method: 'POST',
    headers,
    body,
    // Node's fetch implementation requires duplex for streamed request bodies.
    duplex: 'half',
  } as RequestInit & { duplex: 'half' });
}

describe('bounded binary HTTP ingestion', () => {
  it('rejects an announced oversized upload and cancels its body without consuming it', async () => {
    let cancelled = 0;
    const request = streamRequest(
      [new Uint8Array([1, 2, 3])],
      {
        contentLength: '17',
        onCancel: () => {
          cancelled += 1;
        },
      },
    );

    await expect(
      readBoundedBinaryBody(request, { maxBytes: 16 }),
    ).rejects.toMatchObject<Partial<ApplicationError>>({
      code: 'DOCUMENT_BINARY_UPLOAD_LIMIT_EXCEEDED',
    });

    expect(cancelled).toBe(1);
  });

  it('cancels a chunked body as soon as the actual bytes cross the limit', async () => {
    let cancelled = 0;
    const request = streamRequest(
      [
        new Uint8Array([1, 2, 3, 4]),
        new Uint8Array([5, 6, 7, 8]),
        new Uint8Array([9]),
        new Uint8Array([10, 11, 12]),
      ],
      {
        onCancel: () => {
          cancelled += 1;
        },
      },
    );

    await expect(
      readBoundedBinaryBody(request, { maxBytes: 8 }),
    ).rejects.toMatchObject<Partial<ApplicationError>>({
      code: 'INVALID_REQUEST',
    });

    expect(cancelled).toBe(1);
  });

  it('rejects a body as soon as it exceeds the announced Content-Length', async () => {
    const request = streamRequest(
      [
        new Uint8Array([1, 2, 3, 4]),
        new Uint8Array([5, 6, 7, 8]),
        new Uint8Array([9]),
      ],
      { contentLength: '4' },
    );

    await expect(
      readBoundedBinaryBody(request, { maxBytes: 8 }),
    ).rejects.toMatchObject<Partial<ApplicationError>>({
      code: 'DOCUMENT_BINARY_UPLOAD_LIMIT_EXCEEDED',
    });
  });

  it('rejects malformed Content-Length instead of guessing', async () => {
    const request = streamRequest(
      [new Uint8Array([1, 2, 3])],
      { contentLength: '3.5' },
    );

    await expect(
      readBoundedBinaryBody(request, { maxBytes: 8 }),
    ).rejects.toMatchObject<Partial<ApplicationError>>({
      code: 'INVALID_REQUEST',
    });
  });

  it('rejects a completed body that does not match an announced smaller length', async () => {
    const request = streamRequest(
      [new Uint8Array([1, 2]), new Uint8Array([3])],
      { contentLength: '2' },
    );

    await expect(
      readBoundedBinaryBody(request, { maxBytes: 8 }),
    ).rejects.toMatchObject<Partial<ApplicationError>>({
      code: 'INVALID_REQUEST',
    });
  });

  it('accepts an exact-limit body and preserves byte order', async () => {
    const request = streamRequest(
      [
        new Uint8Array([1, 2, 3]),
        new Uint8Array([4, 5]),
        new Uint8Array([6, 7, 8]),
      ],
      { contentLength: '8' },
    );

    const content = await readBoundedBinaryBody(request, { maxBytes: 8 });

    expect([...content]).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('accepts a chunked body below the limit without requiring Content-Length', async () => {
    const request = streamRequest([
      new Uint8Array([10, 20]),
      new Uint8Array([30, 40]),
    ]);

    const content = await readBoundedBinaryBody(request, { maxBytes: 8 });

    expect([...content]).toEqual([10, 20, 30, 40]);
  });
});
