import {
  listOperationalWorkQuery,
  type Actor,
  type ClockPort,
  type WorkRepository,
} from '@portfolio/application';
import { reportingAsOfQuerySchema } from '@portfolio/contracts';
import { json, validationFailure } from './http-utils.js';

export interface WorkRoutesDependencies {
  readonly workRepository: WorkRepository;
  readonly clock: ClockPort;
}

const SWISS_TIME_ZONE = 'Europe/Zurich';

function swissOperationalDate(clock: ClockPort): string {
  const instant = new Date(clock.now());
  if (Number.isNaN(instant.getTime())) {
    throw new Error('Clock returned an invalid instant.');
  }
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: SWISS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((entry) => entry.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
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
    swissOperationalDate(deps.clock),
  );

  return json({ data: queue });
}
