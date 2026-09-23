import { errorResponse, json } from './http-utils.js';

export interface HealthDependencies {
  readonly readinessCheck: () => Promise<void>;
}

export interface HealthOptions {
  readonly service?: string;
  readonly version?: string;
}

export function createHealthHttpHandler(
  deps: HealthDependencies,
  options: HealthOptions = {},
): (request: Request, path: string) => Promise<Response | null> {
  const service = options.service ?? 'portfolio-api';
  const version = options.version ?? 'unknown';

  return async (request, path) => {
    if (request.method !== 'GET') return null;

    if (path === '/health/live') {
      return json({
        status: 'ok',
        service,
        version,
      });
    }

    if (path === '/health/ready') {
      try {
        await deps.readinessCheck();
        return json({
          status: 'ready',
          service,
          version,
        });
      } catch {
        return errorResponse(
          'SERVICE_NOT_READY',
          'Required service dependencies are unavailable.',
          503,
        );
      }
    }

    return null;
  };
}
