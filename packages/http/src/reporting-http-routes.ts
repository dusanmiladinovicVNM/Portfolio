import {
  getPortfolioDashboardQuery,
  getUnitReportingOverviewQuery,
  type Actor,
  type PortfolioRepository,
  type ReportingRepository,
} from '@portfolio/application';
import {
  entityIdSchema,
  reportingAsOfQuerySchema,
} from '@portfolio/contracts';
import { asUnitId } from '@portfolio/domain';
import { json, validationFailure } from './http-utils.js';

export interface ReportingRoutesDependencies {
  readonly reportingRepository: ReportingRepository;
  readonly portfolioRepository: PortfolioRepository;
}

function parseAsOf(request: Request) {
  const url = new URL(request.url);
  return reportingAsOfQuerySchema.safeParse({
    asOf: url.searchParams.get('asOf') ?? undefined,
  });
}

export async function handleReportingHttp(
  deps: ReportingRoutesDependencies,
  actor: Actor,
  request: Request,
  path: string,
): Promise<Response | null> {
  if (request.method.toUpperCase() !== 'GET') return null;

  if (path === '/reporting/dashboard') {
    const parsed = parseAsOf(request);
    if (!parsed.success) return validationFailure();

    const dashboard = await getPortfolioDashboardQuery(
      deps.reportingRepository,
      actor,
      parsed.data.asOf,
    );

    return json({ data: dashboard });
  }

  const unitMatch = /^\/units\/([^/]+)\/overview$/.exec(path);
  if (!unitMatch) return null;

  const parsedId = entityIdSchema.safeParse(unitMatch[1]);
  const parsed = parseAsOf(request);
  if (!parsedId.success || !parsed.success) return validationFailure();

  const overview = await getUnitReportingOverviewQuery(
    deps,
    actor,
    asUnitId(parsedId.data),
    parsed.data.asOf,
  );

  return json({ data: overview });
}
