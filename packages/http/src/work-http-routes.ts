import {
  listOperationalWorkQuery,
  type Actor,
  type WorkRepository,
} from '@portfolio/application';
import { reportingAsOfQuerySchema } from '@portfolio/contracts';
import { json, validationFailure } from './http-utils.js';

export interface WorkRoutesDependencies {
  readonly workRepository: WorkRepository;
}

export async function handleWorkHttp(
  deps: WorkRoutesDependencies,
  actor: Actor,
  request: Request,
  path: string,
): Promise<Response | null> {
  if (request.method.toUpperCase() !== 'GET' || path !== '/work') {
    return null;
  }

  const url = new URL(request.url);
  const parsed = reportingAsOfQuerySchema.safeParse({
    asOf: url.searchParams.get('asOf') ?? undefined,
  });
  if (!parsed.success) return validationFailure();

  const queue = await listOperationalWorkQuery(
    deps.workRepository,
    actor,
    parsed.data.asOf,
  );

  return json({ data: queue });
}
