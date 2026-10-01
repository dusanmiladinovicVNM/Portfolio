import {
  propertyResponseSchema,
  unitListResponseSchema,
  type PropertyResponse,
  type UnitResponse,
} from '@portfolio/contracts';
import { useEffect, useState } from 'react';
import {
  propertyPath,
  propertyUnitsPath,
} from '../api/paths.js';
import type { PortfolioApi } from '../api/portfolio-api.js';
import { WorkspaceLink } from '../navigation/WorkspaceLink.js';
import { CreateUnitForm } from './CreateUnitForm.js';
import { PropertyAssets } from './PropertyAssets.js';
import { PropertyCommandCenter } from './PropertyCommandCenter.js';
import { assertPropertyUnitsOwner } from './route-owner.js';
import {
  dashboardRoute,
  unitRoute,
} from '../navigation/workspace-route.js';
import type {
  NavigateWorkspace,
  SetNavigationBlocker,
} from '../navigation/use-workspace-navigation.js';
import { formatSwissDate } from '../presentation/format.js';
import { PropertyMaintenanceIssue } from './UnitMaintenance.js';

interface PropertyUnitsProps {
  readonly api: PortfolioApi;
  readonly propertyId: string;
  readonly asOf: string;
  readonly assetId?: string | undefined;
  readonly maintenanceIssueId?: string | undefined;
  readonly maintenanceWorkOrderId?: string | undefined;
  readonly navigate: NavigateWorkspace;
  readonly setNavigationBlocker: SetNavigationBlocker;
}

interface PropertyUnitsData {
  readonly property: PropertyResponse;
  readonly units: readonly UnitResponse[];
}

export function PropertyUnits({
  api,
  propertyId,
  asOf,
  assetId,
  maintenanceIssueId,
  maintenanceWorkOrderId,
  navigate,
  setNavigationBlocker,
}: PropertyUnitsProps) {
  const [data, setData] = useState<PropertyUnitsData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setError(null);

    void Promise.all([
      api.get(propertyPath(propertyId), propertyResponseSchema, {
        signal: controller.signal,
      }),
      api.get(propertyUnitsPath(propertyId), unitListResponseSchema, {
        signal: controller.signal,
      }),
    ])
      .then(([property, response]) => {
        assertPropertyUnitsOwner(propertyId, property, response.items);
        setData({ property, units: response.items });
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(
          cause instanceof Error
            ? cause.message
            : 'Property Units could not be loaded.',
        );
      });

    return () => controller.abort();
  }, [api, propertyId]);

  return (
    <>
      <header className="workspace-header">
        <div>
          <WorkspaceLink
            className="back-link"
            navigate={navigate}
            route={dashboardRoute(asOf)}
          >
            ← Portfolio
          </WorkspaceLink>
          <p className="eyebrow">
            Property{data ? ' · ' + data.property.code : ''}
          </p>
          <h1>{data?.property.name ?? 'Property'}</h1>
          <p className="header-note">
            Daily operations use current Swiss business date. Reporting and Unit
            navigation context remains {formatSwissDate(asOf)}.
          </p>
        </div>
      </header>

      {maintenanceIssueId ? (
        <PropertyMaintenanceIssue
          api={api}
          asOf={asOf}
          issueId={maintenanceIssueId}
          navigate={navigate}
          propertyId={propertyId}
          setNavigationBlocker={setNavigationBlocker}
          workOrderId={maintenanceWorkOrderId}
        />
      ) : assetId ? (
        <PropertyAssets
          api={api}
          asOf={asOf}
          assetId={assetId}
          navigate={navigate}
          propertyId={propertyId}
          setNavigationBlocker={setNavigationBlocker}
        />
      ) : (
        <PropertyCommandCenter
          api={api}
          navigate={navigate}
          propertyId={propertyId}
        />
      )}

      <section className="panel page-panel" data-property-section="units">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Current inventory</p>
            <h2>Units</h2>
          </div>
          <span className="section-note">
            {data ? data.units.length + ' current Unit records' : 'Loading…'}
          </span>
        </div>

        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        {!error && data === null ? (
          <p className="muted" aria-live="polite">Loading Property and Units…</p>
        ) : null}
        {data?.units.length === 0 ? (
          <p className="muted">No Units for this Property.</p>
        ) : null}

        {data && data.units.length > 0 ? (
          <div className="unit-grid">
            {data.units.map((unit) => (
              <WorkspaceLink
                className="unit-card"
                key={unit.id}
                navigate={navigate}
                route={unitRoute(propertyId, unit.id, asOf, 'overview')}
              >
                <div>
                  <span className="eyebrow">{unit.code}</span>
                  <strong>Unit {unit.unitNumber}</strong>
                </div>
                <dl>
                  <div><dt>Type</dt><dd>{unit.unitType}</dd></div>
                  <div><dt>Floor</dt><dd>{unit.floor ?? '—'}</dd></div>
                  <div><dt>Area</dt><dd>{unit.areaM2 === null ? '—' : unit.areaM2 + ' m²'}</dd></div>
                  <div><dt>Status</dt><dd>{unit.status}</dd></div>
                </dl>
                <span className="open-label">Open dossier →</span>
              </WorkspaceLink>
            ))}
          </div>
        ) : null}
      </section>

      {!maintenanceIssueId && !assetId ? (
        <PropertyAssets
          api={api}
          asOf={asOf}
          navigate={navigate}
          propertyId={propertyId}
          setNavigationBlocker={setNavigationBlocker}
        />
      ) : null}

            {data ? (
        <section className="panel page-panel" data-property-section="setup">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Setup</p>
              <h2>Add Unit</h2>
              <p className="muted">
                Create canonical Property master data only when needed.
              </p>
            </div>
            <span className="section-note">{data.property.code}</span>
          </div>
          <CreateUnitForm
            api={api}
            propertyId={propertyId}
            onCreated={(created) =>
              navigate(unitRoute(propertyId, created.id, asOf, 'spaces'))
            }
          />
        </section>
      ) : null}
    </>
  );
}
