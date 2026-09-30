import {
  inspectionListResponseSchema,
  maintenanceIssueListResponseSchema,
  type InspectionResponseDto,
  type MaintenanceIssueResponse,
  type UnitReportingOverviewResponse,
} from '@portfolio/contracts';
import { isActiveInspectionStatus } from '@portfolio/domain';
import { useEffect, useMemo, useState } from 'react';
import {
  unitInspectionsPath,
  unitMaintenanceIssuesPath,
} from '../api/paths.js';
import type { PortfolioApi } from '../api/portfolio-api.js';
import { WorkspaceLink } from '../navigation/WorkspaceLink.js';
import { unitRoute } from '../navigation/workspace-route.js';
import type { NavigateWorkspace } from '../navigation/use-workspace-navigation.js';
import {
  formatDetailKey,
  formatSwissDate,
  formatSwissDateTime,
} from '../presentation/format.js';
import { assertUnitInspectionListOwner } from './inspection-orchestration-owner.js';
import { assertUnitMaintenanceIssuesOwner } from './maintenance-owner.js';

interface UnitOverviewCommandCenterProps {
  readonly api: PortfolioApi;
  readonly propertyId: string;
  readonly unitId: string;
  readonly asOf: string;
  readonly overview: UnitReportingOverviewResponse;
  readonly navigate: NavigateWorkspace;
}

const maintenancePriorityRank: Readonly<
  Record<MaintenanceIssueResponse['priority'], number>
> = {
  urgent: 0,
  high: 1,
  normal: 2,
  low: 3,
};

function inspectionActionLabel(inspection: InspectionResponseDto): string {
  if (inspection.status === 'draft') return 'Prepare Inspection';
  if (inspection.status === 'in_progress') return 'Continue Inspection';
  return 'Continue signatures';
}

export function UnitOverviewCommandCenter({
  api,
  propertyId,
  unitId,
  asOf,
  overview,
  navigate,
}: UnitOverviewCommandCenterProps) {
  const [inspections, setInspections] =
    useState<readonly InspectionResponseDto[] | null>(null);
  const [maintenanceIssues, setMaintenanceIssues] =
    useState<readonly MaintenanceIssueResponse[] | null>(null);
  const [inspectionError, setInspectionError] = useState<string | null>(null);
  const [maintenanceError, setMaintenanceError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setInspections(null);
    setInspectionError(null);
    void api
      .get(unitInspectionsPath(unitId), inspectionListResponseSchema, {
        signal: controller.signal,
      })
      .then((response) => {
        if (controller.signal.aborted) return;
        assertUnitInspectionListOwner(unitId, response.items);
        setInspections(response.items);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setInspectionError(
          cause instanceof Error
            ? cause.message
            : 'Inspection work could not be loaded.',
        );
      });

    return () => controller.abort();
  }, [api, unitId]);

  useEffect(() => {
    const controller = new AbortController();
    setMaintenanceIssues(null);
    setMaintenanceError(null);
    void api
      .get(
        unitMaintenanceIssuesPath(unitId),
        maintenanceIssueListResponseSchema,
        { signal: controller.signal },
      )
      .then((response) => {
        if (controller.signal.aborted) return;
        assertUnitMaintenanceIssuesOwner(unitId, response.items);
        setMaintenanceIssues(response.items);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setMaintenanceError(
          cause instanceof Error
            ? cause.message
            : 'Maintenance work could not be loaded.',
        );
      });

    return () => controller.abort();
  }, [api, unitId]);

  const activeInspections = useMemo(
    () =>
      [...(inspections ?? [])]
        .filter((inspection) => isActiveInspectionStatus(inspection.status))
        .sort((left, right) => {
          const leftDate = left.scheduledFor ?? '9999-12-31';
          const rightDate = right.scheduledFor ?? '9999-12-31';
          return (
            leftDate.localeCompare(rightDate) ||
            left.code.localeCompare(right.code)
          );
        }),
    [inspections],
  );

  const openIssues = useMemo(
    () =>
      [...(maintenanceIssues ?? [])]
        .filter((issue) => issue.status === 'open')
        .sort(
          (left, right) =>
            maintenancePriorityRank[left.priority] -
              maintenancePriorityRank[right.priority] ||
            left.reportedAt.localeCompare(right.reportedAt) ||
            left.code.localeCompare(right.code),
        ),
    [maintenanceIssues],
  );

  const occupancyAction =
    overview.tenancy === null
      ? {
          title: 'No tenancy at selected date',
          detail:
            'Review occupancy lifecycle and create or plan a tenancy if needed.',
          label: 'Open Tenancies',
          route: unitRoute(propertyId, unitId, asOf, 'tenancies'),
        }
      : overview.contract.coverageStatus === 'missing'
        ? {
            title: 'Contract coverage missing',
            detail:
              `Tenancy ${overview.tenancy.code} has no effective or future-signed agreement for this date.`,
            label: 'Open Contracts',
            route: unitRoute(propertyId, unitId, asOf, 'contracts', {
              tenancyId: overview.tenancy.id,
            }),
          }
        : overview.contract.currentDraftAgreementCount > 0
          ? {
              title:
                `${overview.contract.currentDraftAgreementCount} draft agreement${overview.contract.currentDraftAgreementCount === 1 ? '' : 's'}`,
              detail:
                'Review drafts without changing the selected historical reporting projection.',
              label: 'Review Contracts',
              route: unitRoute(propertyId, unitId, asOf, 'contracts', {
                tenancyId: overview.tenancy.id,
              }),
            }
          : null;

  const visibleInspections = activeInspections.slice(0, 3);
  const visibleIssues = openIssues.slice(0, 3);
  const currentActionCount =
    activeInspections.length +
    openIssues.length +
    (occupancyAction === null ? 0 : 1);
  const currentWorkComplete =
    inspections !== null && maintenanceIssues !== null;
  const currentWorkFailed =
    inspectionError !== null || maintenanceError !== null;
  const loadingCurrentWork =
    !currentWorkComplete && !currentWorkFailed;

  return (
    <section
      className="unit-command-center"
      data-unit-command-center
      aria-labelledby="unit-command-center-title"
    >
      <div className="section-heading">
        <div>
          <p className="eyebrow">Command center</p>
          <h2 id="unit-command-center-title">What needs attention</h2>
          <p className="muted">
            Current Inspection and Maintenance work is live. Occupancy and
            contract attention follows the selected reporting date.
          </p>
        </div>
        <div className="unit-command-center-count">
          <strong>{currentWorkComplete ? currentActionCount : '—'}</strong>
          <span>
            {currentWorkComplete
              ? `action${currentActionCount === 1 ? '' : 's'}`
              : currentWorkFailed
                ? 'current work unavailable'
                : 'loading current work'}
          </span>
        </div>
      </div>

      {loadingCurrentWork ? (
        <p className="muted" aria-live="polite">
          Loading current Unit work…
        </p>
      ) : null}

      {inspectionError || maintenanceError ? (
        <div className="unit-command-center-read-errors">
          {inspectionError ? (
            <p className="form-error">Inspection work: {inspectionError}</p>
          ) : null}
          {maintenanceError ? (
            <p className="form-error">Maintenance work: {maintenanceError}</p>
          ) : null}
        </div>
      ) : null}

      <div className="unit-command-center-actions">
        {occupancyAction ? (
          <article className="unit-action-card unit-action-card-occupancy">
            <div>
              <span className="unit-action-kind">Occupancy</span>
              <h3>{occupancyAction.title}</h3>
              <p>{occupancyAction.detail}</p>
            </div>
            <WorkspaceLink
              className="button-secondary"
              navigate={navigate}
              route={occupancyAction.route}
            >
              {occupancyAction.label}
            </WorkspaceLink>
          </article>
        ) : null}

        {visibleInspections.map((inspection) => (
          <article
            className="unit-action-card"
            data-unit-action-inspection={inspection.id}
            key={inspection.id}
          >
            <div>
              <span className="unit-action-kind">
                Inspection · {formatDetailKey(inspection.status)}
              </span>
              <h3>{inspection.code}</h3>
              <p>
                {formatDetailKey(inspection.inspectionType)}
                {' · '}
                {inspection.scheduledFor
                  ? `scheduled ${formatSwissDate(inspection.scheduledFor)}`
                  : 'unscheduled'}
              </p>
            </div>
            <WorkspaceLink
              className="button-secondary"
              navigate={navigate}
              route={unitRoute(propertyId, unitId, asOf, 'inspections', {
                inspectionId: inspection.id,
              })}
            >
              {inspectionActionLabel(inspection)}
            </WorkspaceLink>
          </article>
        ))}

        {visibleIssues.map((issue) => (
          <article
            className={`unit-action-card unit-action-card-${issue.priority}`}
            data-unit-action-maintenance={issue.id}
            key={issue.id}
          >
            <div>
              <span className="unit-action-kind">
                Maintenance · {formatDetailKey(issue.priority)}
              </span>
              <h3>{issue.code} · {issue.title}</h3>
              <p>Reported {formatSwissDateTime(issue.reportedAt)}</p>
            </div>
            <WorkspaceLink
              className="button-secondary"
              navigate={navigate}
              route={unitRoute(propertyId, unitId, asOf, 'maintenance', {
                maintenanceIssueId: issue.id,
              })}
            >
              Open Issue
            </WorkspaceLink>
          </article>
        ))}

        {!loadingCurrentWork &&
        currentActionCount === 0 &&
        !inspectionError &&
        !maintenanceError ? (
          <div className="unit-command-center-clear">
            <strong>No immediate Unit actions.</strong>
            <span>
              No active Inspection, open Maintenance issue or occupancy/contract
              gap is visible from the canonical read models.
            </span>
          </div>
        ) : null}
      </div>

      {activeInspections.length > visibleInspections.length ||
      openIssues.length > visibleIssues.length ? (
        <div className="unit-command-center-more">
          {activeInspections.length > visibleInspections.length ? (
            <WorkspaceLink
              className="table-link"
              navigate={navigate}
              route={unitRoute(propertyId, unitId, asOf, 'inspections')}
            >
              View all {activeInspections.length} active Inspections
            </WorkspaceLink>
          ) : null}
          {openIssues.length > visibleIssues.length ? (
            <WorkspaceLink
              className="table-link"
              navigate={navigate}
              route={unitRoute(propertyId, unitId, asOf, 'maintenance')}
            >
              View all {openIssues.length} open Maintenance issues
            </WorkspaceLink>
          ) : null}
        </div>
      ) : null}

      <div className="unit-command-center-shortcuts">
        <WorkspaceLink
          className="unit-command-center-shortcut"
          navigate={navigate}
          route={unitRoute(propertyId, unitId, asOf, 'maintenance')}
        >
          <span>Maintenance</span>
          <strong>
            {overview.currentOperations.openMaintenanceIssueCount} open ·{' '}
            {overview.currentOperations.urgentMaintenanceIssueCount} urgent
          </strong>
        </WorkspaceLink>
        <WorkspaceLink
          className="unit-command-center-shortcut"
          navigate={navigate}
          route={unitRoute(propertyId, unitId, asOf, 'assets')}
        >
          <span>Assets</span>
          <strong>
            {overview.currentOperations.locatedAssetCount} located ·{' '}
            {overview.currentOperations.activeServicePlanCount} service plans
          </strong>
        </WorkspaceLink>
        <WorkspaceLink
          className="unit-command-center-shortcut"
          navigate={navigate}
          route={unitRoute(propertyId, unitId, asOf, 'meters')}
        >
          <span>Meters</span>
          <strong>{overview.currentOperations.activeMeterCount} active</strong>
        </WorkspaceLink>
        <WorkspaceLink
          className="unit-command-center-shortcut"
          navigate={navigate}
          route={unitRoute(propertyId, unitId, asOf, 'documents')}
        >
          <span>Records</span>
          <strong>Open Unit documents</strong>
        </WorkspaceLink>
      </div>
    </section>
  );
}
