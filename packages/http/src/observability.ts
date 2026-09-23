export type OperationalLogLevel = 'info' | 'warn' | 'error';

export interface OperationalLogEvent {
  readonly level: OperationalLogLevel;
  readonly event: 'http.request.completed' | 'http.request.failed';
  readonly requestId: string;
  readonly method: string;
  readonly path: string;
  readonly status: number;
  readonly durationMs: number;
  readonly errorCode?: string;
}

export interface OperationalLogger {
  log(event: OperationalLogEvent): void;
}

export interface ObservedHttpOptions {
  readonly requestIdFactory?: () => string;
  readonly now?: () => number;
}

type HttpHandler = (request: Request) => Promise<Response>;

const REQUEST_ID_HEADER = 'x-request-id';
const MAX_REQUEST_ID_LENGTH = 128;
const SAFE_REQUEST_ID = /^[A-Za-z0-9._:-]+$/;

function requestIdFrom(request: Request, factory: () => string): string {
  const supplied = request.headers.get(REQUEST_ID_HEADER)?.trim();
  if (
    supplied &&
    supplied.length <= MAX_REQUEST_ID_LENGTH &&
    SAFE_REQUEST_ID.test(supplied)
  ) {
    return supplied;
  }
  return factory();
}

async function responseErrorCode(response: Response): Promise<string | undefined> {
  if (response.status < 400) return undefined;
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) return undefined;

  try {
    const body = (await response.clone().json()) as {
      error?: { code?: unknown };
    };
    return typeof body.error?.code === 'string' ? body.error.code : undefined;
  } catch {
    return undefined;
  }
}

function levelFor(status: number): OperationalLogLevel {
  if (status >= 500) return 'error';
  if (status >= 400) return 'warn';
  return 'info';
}

export function createObservedHttpHandler(
  handler: HttpHandler,
  logger: OperationalLogger,
  options: ObservedHttpOptions = {},
): HttpHandler {
  const requestIdFactory = options.requestIdFactory ?? (() => crypto.randomUUID());
  const now = options.now ?? (() => Date.now());

  return async (request) => {
    const startedAt = now();
    const requestId = requestIdFrom(request, requestIdFactory);
    const url = new URL(request.url);

    try {
      const response = await handler(request);
      const headers = new Headers(response.headers);
      headers.set(REQUEST_ID_HEADER, requestId);
      const observedResponse = new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
      const errorCode = await responseErrorCode(observedResponse);

      logger.log({
        level: levelFor(observedResponse.status),
        event:
          observedResponse.status >= 500
            ? 'http.request.failed'
            : 'http.request.completed',
        requestId,
        method: request.method,
        path: url.pathname,
        status: observedResponse.status,
        durationMs: Math.max(0, now() - startedAt),
        ...(errorCode ? { errorCode } : {}),
      });

      return observedResponse;
    } catch (error) {
      logger.log({
        level: 'error',
        event: 'http.request.failed',
        requestId,
        method: request.method,
        path: url.pathname,
        status: 500,
        durationMs: Math.max(0, now() - startedAt),
        errorCode: 'UNHANDLED_HTTP_FAILURE',
      });
      throw error;
    }
  };
}
