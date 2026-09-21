import type { ReportingRepository } from '@portfolio/application';
import type {
  DateOnly,
  PortfolioDashboard,
  UnitId,
  UnitReportingOverview,
} from '@portfolio/domain';

export class InMemoryReportingRepository implements ReportingRepository {
  readonly unitOverviews = new Map<UnitId, UnitReportingOverview>();

  dashboard: PortfolioDashboard = {
    asOf: '2026-09-21' as DateOnly,
    propertyCount: 0,
    unitCount: 0,
    occupiedUnitCount: 0,
    plannedUnitCount: 0,
    vacantUnitCount: 0,
    currentOperations: {
      openMaintenanceIssueCount: 0,
      urgentMaintenanceIssueCount: 0,
      openMaintenanceWorkOrderCount: 0,
      locatedAssetCount: 0,
      activeAssetCount: 0,
      inactiveAssetCount: 0,
      activeServicePlanCount: 0,
      openWarrantyClaimCount: 0,
      activeMeterCount: 0,
    },
    portfolioCostsByCurrency: [],
    properties: [],
  };

  async getUnitOverview(
    unitId: UnitId,
    _asOf: DateOnly,
  ): Promise<UnitReportingOverview | null> {
    return this.unitOverviews.get(unitId) ?? null;
  }

  async getPortfolioDashboard(
    _asOf: DateOnly,
  ): Promise<PortfolioDashboard> {
    return this.dashboard;
  }
}
