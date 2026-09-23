import { errorResponse, json } from './http-utils.js';

export interface HealthDependencies {
  readonly readinessCheck: () => Promise<void>;
}

export interface HealthOptions {
  readonly service?: string;
  readonly version?: string;
  readonly readinessTimeoutMs?: number;
}

const DEFAULT_READINESS_TIMEOUT_MS = 1_000;

function boundedReadiness(
  readinessCheck: () => Promise<void>,
  timeoutMs: number,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Readiness dependency check timed out.'));
    }, timeoutMs);

    void readinessCheck().then(
      () => {
        clearTimeout(timer);
        resolve();
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export function createHealthHttpHandler(
  deps: HealthDependencies,
  options: HealthOptions = {},
): (request: Request, path: string) => Promise<Response | null> {
  const service = options.service ?? 'portfolio-api';
  const version = options.version ?? 'unknown';
  const readinessTimeoutMs =
    options.readinessTimeoutMs ?? DEFAULT_READINESS_TIMEOUT_MS;

  if (!Number.isFinite(readinessTimeoutMs) || readinessTimeoutMs <= 0) {
    throw new Error('readinessTimeoutMs must be a positive finite number.');
  }

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
        await boundedReadiness(deps.readinessCheck, readinessTimeoutMs);
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
