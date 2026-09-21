import {
  tenancyListResponseSchema,
  type TenancyResponse,
} from '@portfolio/contracts';
import { useEffect, useState } from 'react';
import { unitTenanciesPath } from '../api/paths.js';
import type { PortfolioApi } from '../api/portfolio-api.js';
import { WorkspaceLink } from '../navigation/WorkspaceLink.js';
import { unitRoute } from '../navigation/workspace-route.js';
import type { NavigateWorkspace } from '../navigation/use-workspace-navigation.js';
import { formatDetailKey } from '../presentation/format.js';
import {
  partyDisplayName,
  usePartyDirectory,
} from '../parties/use-party-directory.js';

interface UnitTenanciesProps {
  readonly api: PortfolioApi;
  readonly propertyId: string;
  readonly unitId: string;
  readonly asOf: string;
  readonly navigate: NavigateWorkspace;
}

function period(tenancy: TenancyResponse): string {
  if (tenancy.actualStart) {
    return `${tenancy.actualStart} → ${tenancy.actualEnd ?? 'open'}`;
  }
  if (tenancy.plannedStart) {
    return `${tenancy.plannedStart} → ${tenancy.plannedEnd ?? 'open'}`;
  }
  return 'Not scheduled';
}

export function UnitTenancies({
  api,
  propertyId,
  unitId,
  asOf,
  navigate,
}: UnitTenanciesProps) {
  const [tenancies, setTenancies] =
    useState<readonly TenancyResponse[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const partyIds =
    tenancies?.flatMap((tenancy) =>
      tenancy.parties.map((party) => party.partyId),
    ) ?? [];
  const partyDirectory = usePartyDirectory(api, partyIds);

  useEffect(() => {
    const controller = new AbortController();
    setTenancies(null);
    setError(null);

    void api
      .get(unitTenanciesPath(unitId), tenancyListResponseSchema, {
        signal: controller.signal,
      })
      .then((response) => setTenancies(response.items))
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(
          cause instanceof Error
            ? cause.message
            : 'Tenancies could not be loaded.',
        );
      });

    return () => controller.abort();
  }, [api, unitId]);

  return (
    <section className="panel page-panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Current lifecycle registry</p>
          <h2>Tenancies</h2>
        </div>
        <span className="section-note">
          Current records · reporting context {asOf} is preserved for drill-down
        </span>
      </div>

      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {partyDirectory.error ? (
        <p className="form-error" role="alert">
          Party details unavailable: {partyDirectory.error}
        </p>
      ) : null}
      {!error && tenancies === null ? (
        <p className="muted" aria-live="polite">Loading Tenancies…</p>
      ) : null}
      {tenancies?.length === 0 ? (
        <p className="muted">No Tenancy records exist for this Unit.</p>
      ) : null}

      {tenancies && tenancies.length > 0 ? (
        <div className="tenancy-grid">
          {tenancies.map((tenancy) => (
            <article className="tenancy-card" key={tenancy.id}>
              <div className="record-heading">
                <div>
                  <span className="eyebrow">{tenancy.code}</span>
                  <h3>{formatDetailKey(tenancy.status)}</h3>
                </div>
                <span className="status-chip">{tenancy.status}</span>
              </div>

              <dl className="detail-list">
                <div><dt>Lifecycle period</dt><dd>{period(tenancy)}</dd></div>
                <div><dt>Notice given</dt><dd>{tenancy.noticeGivenAt ?? '—'}</dd></div>
                <div><dt>Termination effective</dt><dd>{tenancy.terminationEffectiveAt ?? '—'}</dd></div>
                <div><dt>Parties</dt><dd>{tenancy.parties.length}</dd></div>
                <div><dt>Version</dt><dd>{tenancy.version}</dd></div>
              </dl>

              {tenancy.parties.length > 0 ? (
                <ul
                  aria-label="Tenancy party roles"
                  aria-live="polite"
                  className="role-list"
                >
                  {tenancy.parties.map((party) => (
                    <li key={party.id}>
                      <strong>
                        {partyDirectory.loading
                          ? 'Resolving Party…'
                          : partyDisplayName(partyDirectory, party.partyId)}
                      </strong>
                      <span>
                        {formatDetailKey(party.role)}
                        {party.isPrimary ? ' · primary' : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}

              <WorkspaceLink
                className="record-action"
                navigate={navigate}
                route={unitRoute(
                  propertyId,
                  unitId,
                  asOf,
                  'contracts',
                  { tenancyId: tenancy.id },
                )}
              >
                Open contract dossier →
              </WorkspaceLink>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
