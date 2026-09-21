import { apiErrorResponseSchema } from '@portfolio/contracts';

export interface ResponseSchema<T> {
  safeParse(
    value: unknown,
  ):
    | { readonly success: true; readonly data: T }
    | { readonly success: false; readonly error: unknown };
}

export class PortfolioApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'PortfolioApiError';
    this.status = status;
    this.code = code;
  }
}

export interface PortfolioApi {
  get<T>(path: string, schema: ResponseSchema<T>): Promise<T>;
}

export interface PortfolioApiOptions {
  readonly baseUrl: string;
  readonly getAccessToken: () => string | null;
  readonly fetchImpl?: typeof fetch;
}

function joinPath(baseUrl: string, path: string): string {
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export function createPortfolioApi(options: PortfolioApiOptions): PortfolioApi {
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    async get<T>(path: string, schema: ResponseSchema<T>): Promise<T> {
      const accessToken = options.getAccessToken();
      if (!accessToken) {
        throw new PortfolioApiError(
          401,
          'AUTH_SESSION_REQUIRED',
          'An authenticated session is required.',
        );
      }

      const response = await fetchImpl(joinPath(options.baseUrl, path), {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
      });
      const payload = await readJson(response);

      if (!response.ok) {
        const parsedError = apiErrorResponseSchema.safeParse(payload);
        if (parsedError.success) {
          throw new PortfolioApiError(
            response.status,
            parsedError.data.error.code,
            parsedError.data.error.message,
          );
        }
        throw new PortfolioApiError(
          response.status,
          'API_ERROR',
          `Portfolio API request failed with status ${response.status}.`,
        );
      }

      if (typeof payload !== 'object' || payload === null || !('data' in payload)) {
        throw new PortfolioApiError(
          502,
          'API_RESPONSE_INVALID',
          'Portfolio API returned an invalid response envelope.',
        );
      }

      const parsed = schema.safeParse((payload as { readonly data: unknown }).data);
      if (!parsed.success) {
        throw new PortfolioApiError(
          502,
          'API_RESPONSE_INVALID',
          'Portfolio API returned data that does not match its contract.',
        );
      }

      return parsed.data;
    },
  };
}
