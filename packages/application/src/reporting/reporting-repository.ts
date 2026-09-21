import type {
  DateOnly,
  PortfolioDashboard,
  UnitId,
  UnitReportingOverview,
} from '@portfolio/domain';

export interface ReportingRepository {
  getUnitOverview(
    unitId: UnitId,
    asOf: DateOnly,
  ): Promise<UnitReportingOverview | null>;

  getPortfolioDashboard(asOf: DateOnly): Promise<PortfolioDashboard>;
}
