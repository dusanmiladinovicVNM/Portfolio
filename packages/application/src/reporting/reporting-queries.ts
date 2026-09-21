import {
  asDateOnly,
  DomainError,
  type PortfolioDashboard,
  type UnitId,
  type UnitReportingOverview,
} from '@portfolio/domain';
import type { PortfolioRepository } from '../portfolio/portfolio-repository.js';
import { requireCapability, type Actor } from '../security/access.js';
import type { ReportingRepository } from './reporting-repository.js';

export async function getUnitReportingOverviewQuery(
  deps: {
    readonly reportingRepository: ReportingRepository;
    readonly portfolioRepository: PortfolioRepository;
  },
  actor: Actor,
  unitId: UnitId,
  asOfValue: string,
): Promise<UnitReportingOverview> {
  requireCapability(actor, 'portfolio:read');
  const asOf = asDateOnly(asOfValue);

  if (!(await deps.portfolioRepository.getUnitById(unitId))) {
    throw new DomainError('UNIT_NOT_FOUND', 'Unit not found.');
  }

  const overview = await deps.reportingRepository.getUnitOverview(unitId, asOf);
  if (!overview) {
    throw new DomainError(
      'REPORTING_UNIT_NOT_FOUND',
      'Unit reporting projection not found.',
    );
  }

  return overview;
}

export async function getPortfolioDashboardQuery(
  repository: ReportingRepository,
  actor: Actor,
  asOfValue: string,
): Promise<PortfolioDashboard> {
  requireCapability(actor, 'portfolio:read');
  return repository.getPortfolioDashboard(asDateOnly(asOfValue));
}
