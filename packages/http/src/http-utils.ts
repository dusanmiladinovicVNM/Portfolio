import { ApplicationError } from '@portfolio/application';

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
};

export const MAX_JSON_REQUEST_BODY_BYTES = 256 * 1024;

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: JSON_HEADERS,
  });
}

export function errorResponse(
  code: string,
  message: string,
  status: number,
): Response {
  return json({ error: { code, message } }, status);
}

function requestBodyTooLarge(): ApplicationError {
  return new ApplicationError(
    'REQUEST_BODY_TOO_LARGE',
    `JSON request body supports up to ${MAX_JSON_REQUEST_BODY_BYTES} bytes.`,
  );
}

function parseContentLength(request: Request): number | null {
  const value = request.headers.get('content-length');
  if (value === null) return null;

  if (!/^\d+$/.test(value.trim())) {
    throw new ApplicationError(
      'INVALID_REQUEST',
      'Content-Length must be a non-negative integer when supplied.',
    );
  }

  const length = Number(value);
  if (!Number.isSafeInteger(length) || length < 0) {
    throw new ApplicationError(
      'INVALID_REQUEST',
      'Content-Length is outside the supported integer range.',
    );
  }

  if (length > MAX_JSON_REQUEST_BODY_BYTES) {
    throw requestBodyTooLarge();
  }

  return length;
}

async function readBoundedJsonText(request: Request): Promise<string> {
  let announcedLength: number | null;
  try {
    announcedLength = parseContentLength(request);
  } catch (error) {
    if (request.body) {
      try {
        await request.body.cancel('JSON request rejected by request metadata');
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
    return '';
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value || value.byteLength === 0) continue;

      const nextTotal = total + value.byteLength;
      if (nextTotal > MAX_JSON_REQUEST_BODY_BYTES) {
        try {
          await reader.cancel('JSON request body limit exceeded');
        } catch {}
        throw requestBodyTooLarge();
      }

      if (announcedLength !== null && nextTotal > announcedLength) {
        try {
          await reader.cancel('content-length mismatch');
        } catch {}
        throw new ApplicationError(
          'INVALID_REQUEST',
          'Request body length does not match Content-Length.',
        );
      }

      const chunk = new Uint8Array(value.byteLength);
      chunk.set(value);
      chunks.push(chunk);
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

  const content = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    content.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new TextDecoder().decode(content);
}

export async function requestJson(request: Request): Promise<unknown> {
  const text = await readBoundedJsonText(request);
  try {
    return JSON.parse(text);
  } catch {
    throw new ApplicationError(
      'INVALID_REQUEST',
      'Request body must be valid JSON.',
    );
  }
}

export function validationFailure(): Response {
  return errorResponse(
    'INVALID_REQUEST',
    'Request payload is invalid.',
    400,
  );
}
