const ALLOWED_METHODS = 'GET,POST,PATCH,OPTIONS';
const ALLOWED_HEADERS = 'authorization,content-type,x-request-id';

function corsHeaders(origin: string): Headers {
  return new Headers({
    'access-control-allow-origin': origin,
    'access-control-allow-methods': ALLOWED_METHODS,
    'access-control-allow-headers': ALLOWED_HEADERS,
    'access-control-max-age': '600',
    'vary': 'Origin',
  });
}

function withCors(response: Response, origin: string): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of corsHeaders(origin)) headers.set(name, value);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function createCorsHandler(
  allowedOrigin: string,
  handler: (request: Request) => Promise<Response>,
): (request: Request) => Promise<Response> {
  return async (request) => {
    const origin = request.headers.get('origin');

    if (origin && origin !== allowedOrigin) {
      return Response.json(
        {
          error: {
            code: 'ORIGIN_NOT_ALLOWED',
            message: 'Request origin is not allowed.',
          },
        },
        { status: 403 },
      );
    }

    if (request.method === 'OPTIONS') {
      if (!origin) return new Response(null, { status: 204 });
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    const response = await handler(request);
    return origin ? withCors(response, origin) : response;
  };
}
