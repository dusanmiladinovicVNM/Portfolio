import {
  listUnitTimelineQuery,
  type Actor,
  type PortfolioRepository,
  type UnitTimelineRepository,
} from '@portfolio/application';
import {
  entityIdSchema,
  unitTimelineQuerySchema,
} from '@portfolio/contracts';
import {
  asDateOnly,
  asUnitId,
  type UnitTimelineCategory,
} from '@portfolio/domain';
import { json, validationFailure } from './http-utils.js';

export interface UnitTimelineRoutesDependencies {
  readonly portfolioRepository: PortfolioRepository;
  readonly unitTimelineRepository: UnitTimelineRepository;
}

export async function handleUnitTimelineHttp(
  deps: UnitTimelineRoutesDependencies,
  actor: Actor,
  request: Request,
  path: string,
): Promise<Response | null> {
  if (request.method.toUpperCase() !== 'GET') return null;

  const match = /^\/units\/([^/]+)\/timeline$/.exec(path);
  if (!match) return null;

  const parsedId = entityIdSchema.safeParse(match[1]);
  if (!parsedId.success) return validationFailure();

  const url = new URL(request.url);
  const parsed = unitTimelineQuerySchema.safeParse({
    categories: url.searchParams.getAll('category'),
    ...(url.searchParams.has('from')
      ? { from: url.searchParams.get('from') ?? undefined }
      : {}),
    ...(url.searchParams.has('to')
      ? { to: url.searchParams.get('to') ?? undefined }
      : {}),
    ...(url.searchParams.has('limit')
      ? { limit: url.searchParams.get('limit') ?? undefined }
      : {}),
    ...(url.searchParams.has('offset')
      ? { offset: url.searchParams.get('offset') ?? undefined }
      : {}),
  });
  if (!parsed.success) return validationFailure();

  const items = await listUnitTimelineQuery(
    deps,
    actor,
    asUnitId(parsedId.data),
    {
      ...(parsed.data.categories.length > 0
        ? {
            categories:
              parsed.data.categories as readonly UnitTimelineCategory[],
          }
        : {}),
      ...(parsed.data.from !== undefined
        ? { from: asDateOnly(parsed.data.from) }
        : {}),
      ...(parsed.data.to !== undefined
        ? { to: asDateOnly(parsed.data.to) }
        : {}),
      limit: parsed.data.limit,
      offset: parsed.data.offset,
    },
  );

  return json({
    data: {
      items,
      limit: parsed.data.limit,
      offset: parsed.data.offset,
    },
  });
}
