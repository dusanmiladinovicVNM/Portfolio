import { ApplicationError } from '@portfolio/application';

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
};

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

export async function requestJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
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
