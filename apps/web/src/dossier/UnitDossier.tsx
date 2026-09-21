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
import type { NavigateWorkspace } from '../navigation/use-workspace-navigation.js';
import { UnitAssets } from './UnitAssets.js';
import { UnitOverview } from './UnitOverview.js';
import { UnitTimeline } from './UnitTimeline.js';

interface UnitDossierProps {
  readonly api: PortfolioApi;
  readonly propertyId: string;
  readonly unitId: string;
  readonly tab: DossierTab;
  readonly asOf: string;
  readonly navigate: NavigateWorkspace;
}

export function UnitDossier({
  api,
  propertyId,
  unitId,
  tab,
  asOf,
  navigate,
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
        if (result.propertyId !== propertyId) {
          throw new Error(
            'Unit route does not belong to the Property encoded in the URL.',
          );
        }
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
              ariaCurrent={tab === 'timeline' ? 'page' : undefined}
              className={`dossier-tab ${tab === 'timeline' ? 'dossier-tab-active' : ''}`}
              navigate={navigate}
              route={unitRoute(propertyId, unitId, asOf, 'timeline')}
            >
              Timeline
            </WorkspaceLink>
            <span
              className="dossier-tab dossier-tab-disabled"
              title="Requires a Unit-scoped document read endpoint."
            >
              Documents
            </span>
            <WorkspaceLink
              ariaCurrent={tab === 'assets' ? 'page' : undefined}
              className={`dossier-tab ${tab === 'assets' ? 'dossier-tab-active' : ''}`}
              navigate={navigate}
              route={unitRoute(propertyId, unitId, asOf, 'assets')}
            >
              Assets
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
          {tab === 'timeline' ? <UnitTimeline api={api} unitId={unitId} /> : null}
          {tab === 'assets' ? <UnitAssets api={api} unitId={unitId} /> : null}
        </>
      ) : null}
    </>
  );
}
