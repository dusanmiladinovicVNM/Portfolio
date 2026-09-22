import { ApplicationError } from '@portfolio/application';

export interface BoundedBinaryBodyPolicy {
  readonly maxBytes: number;
}

function uploadLimitExceeded(maxBytes: number): ApplicationError {
  return new ApplicationError(
    'DOCUMENT_BINARY_UPLOAD_LIMIT_EXCEEDED',
    `Binary upload supports files up to ${maxBytes} bytes.`,
  );
}

function parseAnnouncedLength(
  request: Request,
  maxBytes: number,
): number | null {
  const header = request.headers.get('content-length');
  if (header === null) return null;

  if (!/^\d+$/.test(header.trim())) {
    throw new ApplicationError(
      'INVALID_REQUEST',
      'Content-Length must be a non-negative integer when supplied.',
    );
  }

  const value = Number(header);
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new ApplicationError(
      'INVALID_REQUEST',
      'Content-Length is outside the supported integer range.',
    );
  }

  if (value > maxBytes) {
    throw uploadLimitExceeded(maxBytes);
  }

  return value;
}

function concatBytes(
  chunks: readonly Uint8Array[],
  total: number,
): Uint8Array {
  const content = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    content.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return content;
}

export async function readBoundedBinaryBody(
  request: Request,
  policy: BoundedBinaryBodyPolicy,
): Promise<Uint8Array> {
  if (
    !Number.isSafeInteger(policy.maxBytes) ||
    policy.maxBytes <= 0
  ) {
    throw new Error('Bounded binary body policy requires a positive maxBytes.');
  }

  let announcedLength: number | null;
  try {
    announcedLength = parseAnnouncedLength(request, policy.maxBytes);
  } catch (error) {
    if (request.body) {
      try {
        await request.body.cancel('binary upload rejected by request metadata');
      } catch {}
    }
    throw error;
  }

  if (!request.body) {
    if (announcedLength !== null && announcedLength !== 0) {
      throw new ApplicationError(
        'INVALID_REQUEST',
        'Request body length does not match Content-Length.',
      );
    }
    return new Uint8Array();
  }

  const reader = request.body.getReader();
  const exactBuffer =
    announcedLength === null ? null : new Uint8Array(announcedLength);
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value || value.byteLength === 0) continue;

      const nextTotal = total + value.byteLength;
      if (nextTotal > policy.maxBytes) {
        try {
          await reader.cancel('binary upload limit exceeded');
        } catch {}
        throw uploadLimitExceeded(policy.maxBytes);
      }

      if (
        announcedLength !== null &&
        nextTotal > announcedLength
      ) {
        try {
          await reader.cancel('content-length mismatch');
        } catch {}
        throw new ApplicationError(
          'INVALID_REQUEST',
          'Request body length does not match Content-Length.',
        );
      }

      if (exactBuffer) {
        exactBuffer.set(value, total);
      } else {
        const chunk = new Uint8Array(value.byteLength);
        chunk.set(value);
        chunks.push(chunk);
      }
      total = nextTotal;
    }
  } finally {
    reader.releaseLock();
  }

  if (announcedLength !== null && total !== announcedLength) {
    throw new ApplicationError(
      'INVALID_REQUEST',
      'Request body length does not match Content-Length.',
    );
  }

  return exactBuffer ?? concatBytes(chunks, total);
}
