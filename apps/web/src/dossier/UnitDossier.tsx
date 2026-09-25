import {
  unitResponseSchema,
  type UnitResponse,
} from '@portfolio/contracts';
import { useEffect, useState } from 'react';
import { unitPath } from '../api/paths.js';
import type { PortfolioApi } from '../api/portfolio-api.js';
import { WorkspaceLink } from '../navigation/WorkspaceLink.js';
import {
  propertyRoute,
  unitRoute,
  type DossierTab,
} from '../navigation/workspace-route.js';
import type {
  NavigateWorkspace,
  SetNavigationBlocker,
} from '../navigation/use-workspace-navigation.js';
import { UnitAssets } from './UnitAssets.js';
import { UnitDocuments } from './UnitDocuments.js';
import { UnitInspections } from './UnitInspections.js';
import { UnitMeters } from './UnitMeters.js';
import { UnitMaintenance } from './UnitMaintenance.js';
import { UnitOverview } from './UnitOverview.js';
import { UnitSpaces } from './UnitSpaces.js';
import { UnitTenancies } from './UnitTenancies.js';
import { UnitContracts } from './UnitContracts.js';
import { UnitTimeline } from './UnitTimeline.js';
import { assertUnitRouteOwner } from './route-owner.js';

interface UnitDossierProps {
  readonly api: PortfolioApi;
  readonly propertyId: string;
  readonly unitId: string;
  readonly tab: DossierTab;
  readonly asOf: string;
  readonly tenancyId?: string | undefined;
  readonly agreementId?: string | undefined;
  readonly amendmentId?: string | undefined;
  readonly inspectionId?: string | undefined;
  readonly inspectionSectionInstanceId?: string | undefined;
  readonly assetId?: string | undefined;
  readonly meterId?: string | undefined;
  readonly maintenanceIssueId?: string | undefined;
  readonly maintenanceWorkOrderId?: string | undefined;
  readonly navigate: NavigateWorkspace;
  readonly setNavigationBlocker: SetNavigationBlocker;
}

export function UnitDossier({
  api,
  propertyId,
  unitId,
  tab,
  asOf,
  tenancyId,
  agreementId,
  amendmentId,
  inspectionId,
  inspectionSectionInstanceId,
  assetId,
  meterId,
  maintenanceIssueId,
  maintenanceWorkOrderId,
  navigate,
  setNavigationBlocker,
}: UnitDossierProps) {
  const [unit, setUnit] = useState<UnitResponse | null>(null);
  const [identityError, setIdentityError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setUnit(null);
    setIdentityError(null);

    void api
      .get(unitPath(unitId), unitResponseSchema, {
        signal: controller.signal,
      })
      .then((result) => {
        assertUnitRouteOwner(propertyId, unitId, result);
        setUnit(result);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setIdentityError(
          cause instanceof Error
            ? cause.message
            : 'Unit identity could not be restored.',
        );
      });

    return () => controller.abort();
  }, [api, propertyId, unitId]);

  return (
    <>
      <header className="workspace-header">
        <div>
          <WorkspaceLink
            className="back-link"
            navigate={navigate}
            route={propertyRoute(propertyId, asOf)}
          >
            ← Property Units
          </WorkspaceLink>
          <p className="eyebrow">
            Unit dossier{unit ? ` · ${unit.code}` : ''}
          </p>
          <h1>{unit ? `Unit ${unit.unitNumber}` : 'Unit dossier'}</h1>
          {unit ? (
            <p className="header-note">
              {unit.unitType} · floor {unit.floor ?? '—'} · current lifecycle
              status {unit.status}
            </p>
          ) : null}
        </div>
      </header>

      {identityError ? (
        <section className="panel state-panel" role="alert">
          <p className="eyebrow">Route identity failed</p>
          <h2>Unit unavailable</h2>
          <p>{identityError}</p>
        </section>
      ) : null}

      {!identityError && unit === null ? (
        <section className="panel state-panel" aria-live="polite">
          <p className="eyebrow">Canonical Unit</p>
          <h2>Restoring dossier from URL…</h2>
        </section>
      ) : null}

      {unit ? (
        <>
          <nav className="dossier-tabs" aria-label="Unit dossier sections">
            <WorkspaceLink
              ariaCurrent={tab === 'overview' ? 'page' : undefined}
              className={`dossier-tab ${tab === 'overview' ? 'dossier-tab-active' : ''}`}
              navigate={navigate}
              route={unitRoute(propertyId, unitId, asOf, 'overview')}
            >
              Overview
            </WorkspaceLink>
            <WorkspaceLink
              ariaCurrent={tab === 'spaces' ? 'page' : undefined}
              className={'dossier-tab ' + (tab === 'spaces' ? 'dossier-tab-active' : '')}
              navigate={navigate}
              route={unitRoute(propertyId, unitId, asOf, 'spaces')}
            >
              Spaces
            </WorkspaceLink>
            <WorkspaceLink
              ariaCurrent={tab === 'tenancies' ? 'page' : undefined}
              className={`dossier-tab ${tab === 'tenancies' ? 'dossier-tab-active' : ''}`}
              navigate={navigate}
              route={unitRoute(propertyId, unitId, asOf, 'tenancies')}
            >
              Tenancies
            </WorkspaceLink>
            <WorkspaceLink
              ariaCurrent={tab === 'contracts' ? 'page' : undefined}
              className={`dossier-tab ${tab === 'contracts' ? 'dossier-tab-active' : ''}`}
              navigate={navigate}
              route={unitRoute(propertyId, unitId, asOf, 'contracts', {
                ...(tenancyId ? { tenancyId } : {}),
                ...(agreementId ? { agreementId } : {}),
                ...(amendmentId ? { amendmentId } : {}),
              })}
            >
              Contracts
            </WorkspaceLink>
            <WorkspaceLink
              ariaCurrent={tab === 'inspections' ? 'page' : undefined}
              className={`dossier-tab ${tab === 'inspections' ? 'dossier-tab-active' : ''}`}
              navigate={navigate}
              route={unitRoute(propertyId, unitId, asOf, 'inspections', {
                ...(inspectionId ? { inspectionId } : {}),
                ...(inspectionSectionInstanceId
                  ? { inspectionSectionInstanceId }
                  : {}),
              })}
            >
              Inspections
            </WorkspaceLink>
            <WorkspaceLink
              ariaCurrent={tab === 'timeline' ? 'page' : undefined}
              className={`dossier-tab ${tab === 'timeline' ? 'dossier-tab-active' : ''}`}
              navigate={navigate}
              route={unitRoute(propertyId, unitId, asOf, 'timeline')}
            >
              Timeline
            </WorkspaceLink>
            <WorkspaceLink
              ariaCurrent={tab === 'documents' ? 'page' : undefined}
              className={`dossier-tab ${tab === 'documents' ? 'dossier-tab-active' : ''}`}
              navigate={navigate}
              route={unitRoute(propertyId, unitId, asOf, 'documents')}
            >
              Documents
            </WorkspaceLink>
            <WorkspaceLink
              ariaCurrent={tab === 'assets' ? 'page' : undefined}
              className={`dossier-tab ${tab === 'assets' ? 'dossier-tab-active' : ''}`}
              navigate={navigate}
              route={unitRoute(propertyId, unitId, asOf, 'assets', {
                ...(assetId ? { assetId } : {}),
              })}
            >
              Assets
            </WorkspaceLink>
            <WorkspaceLink
              ariaCurrent={tab === 'meters' ? 'page' : undefined}
              className={`dossier-tab ${tab === 'meters' ? 'dossier-tab-active' : ''}`}
              navigate={navigate}
              route={unitRoute(propertyId, unitId, asOf, 'meters', {
                ...(meterId ? { meterId } : {}),
              })}
            >
              Meters
            </WorkspaceLink>
            <WorkspaceLink
              ariaCurrent={tab === 'maintenance' ? 'page' : undefined}
              className={`dossier-tab ${tab === 'maintenance' ? 'dossier-tab-active' : ''}`}
              navigate={navigate}
              route={unitRoute(propertyId, unitId, asOf, 'maintenance', {
                ...(maintenanceIssueId
                  ? { maintenanceIssueId }
                  : {}),
                ...(maintenanceWorkOrderId
                  ? { maintenanceWorkOrderId }
                  : {}),
              })}
            >
              Maintenance
            </WorkspaceLink>
          </nav>

          {tab === 'overview' ? (
            <UnitOverview
              api={api}
              asOf={asOf}
              onAsOfChange={(nextAsOf) =>
                navigate(
                  unitRoute(propertyId, unitId, nextAsOf, 'overview'),
                  { replace: true },
                )
              }
              unitId={unitId}
            />
          ) : null}
          {tab === 'spaces' ? (
            <UnitSpaces api={api} unitId={unitId} />
          ) : null}
          {tab === 'tenancies' ? (
            <UnitTenancies
              api={api}
              propertyId={propertyId}
              unitId={unitId}
              asOf={asOf}
              navigate={navigate}
            />
          ) : null}
          {tab === 'contracts' ? (
            <UnitContracts
              api={api}
              propertyId={propertyId}
              unitId={unitId}
              asOf={asOf}
              tenancyId={tenancyId}
              agreementId={agreementId}
              amendmentId={amendmentId}
              navigate={navigate}
            />
          ) : null}
          {tab === 'inspections' ? (
            <UnitInspections
              api={api}
              asOf={asOf}
              inspectionId={inspectionId}
              inspectionSectionInstanceId={inspectionSectionInstanceId}
              navigate={navigate}
              propertyId={propertyId}
              setNavigationBlocker={setNavigationBlocker}
              unitId={unitId}
            />
          ) : null}
          {tab === 'timeline' ? <UnitTimeline api={api} unitId={unitId} /> : null}
          {tab === 'documents' ? <UnitDocuments api={api} unitId={unitId} /> : null}
          {tab === 'assets' ? (
            <UnitAssets
              api={api}
              asOf={asOf}
              assetId={assetId}
              navigate={navigate}
              propertyId={propertyId}
              setNavigationBlocker={setNavigationBlocker}
              unitId={unitId}
            />
          ) : null}
          {tab === 'meters' ? (
            <UnitMeters
              api={api}
              asOf={asOf}
              meterId={meterId}
              navigate={navigate}
              propertyId={propertyId}
              setNavigationBlocker={setNavigationBlocker}
              unitId={unitId}
            />
          ) : null}
          {tab === 'maintenance' ? (
            <UnitMaintenance
              api={api}
              asOf={asOf}
              issueId={maintenanceIssueId}
              navigate={navigate}
              propertyId={propertyId}
              setNavigationBlocker={setNavigationBlocker}
              unitId={unitId}
              workOrderId={maintenanceWorkOrderId}
            />
          ) : null}
        </>
      ) : null}
    </>
  );
}
