import {
  portfolioDashboardResponseSchema,
  type PortfolioDashboardResponse,
} from '@portfolio/contracts';
import { useEffect, useState } from 'react';
import type { PortfolioApi } from '../api/portfolio-api.js';
import { formatExactMoney, localDateOnly } from '../presentation/format.js';

type PropertySummary = PortfolioDashboardResponse['properties'][number];

interface PortfolioDashboardProps {
  readonly api: PortfolioApi;
  readonly onSelectProperty: (property: PropertySummary) => void;
}

function occupancyRate(data: PortfolioDashboardResponse): string {
  if (data.unitCount === 0) return '—';
  return `${Math.round((data.occupiedUnitCount / data.unitCount) * 100)}%`;
}

function LoadingState() {
  return (
    <section className="panel state-panel" aria-live="polite">
      <p className="eyebrow">Portfolio snapshot</p>
      <h2>Loading reporting projection…</h2>
    </section>
  );
}

export function PortfolioDashboard({
  api,
  onSelectProperty,
}: PortfolioDashboardProps) {
  const [asOf, setAsOf] = useState(localDateOnly);
  const [data, setData] = useState<PortfolioDashboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [requestVersion, setRequestVersion] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setError(null);

    void api
      .get(
        `/reporting/dashboard?asOf=${encodeURIComponent(asOf)}`,
        portfolioDashboardResponseSchema,
        { signal: controller.signal },
      )
      .then(setData)
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(
          cause instanceof Error
            ? cause.message
            : 'Portfolio dashboard could not be loaded.',
        );
      });

    return () => controller.abort();
  }, [api, asOf, requestVersion]);

  return (
    <>
      <header className="workspace-header">
        <div>
          <p className="eyebrow">Portfolio dashboard</p>
          <h1>Current portfolio picture</h1>
          <p className="header-note">
            Occupancy and costs are historical as of the selected business date.
            Operational counters represent current operations.
          </p>
        </div>
        <label className="date-control">
          As of
          <input
            aria-label="Reporting business date"
            onChange={(event) => setAsOf(event.currentTarget.value)}
            type="date"
            value={asOf}
          />
        </label>
      </header>

      {error ? (
        <section className="panel state-panel" role="alert">
          <p className="eyebrow">Read failed</p>
          <h2>Dashboard unavailable</h2>
          <p>{error}</p>
          <button
            className="button-secondary inline-button"
            onClick={() => setRequestVersion((value) => value + 1)}
            type="button"
          >
            Retry
          </button>
        </section>
      ) : null}

      {!error && !data ? <LoadingState /> : null}

      {data ? (
        <div className="dashboard-stack">
          <section className="metric-grid" aria-label="Portfolio occupancy summary">
            <article className="metric-card metric-card-primary">
              <span>Occupancy</span>
              <strong>{occupancyRate(data)}</strong>
              <small>{data.occupiedUnitCount} occupied units</small>
            </article>
            <article className="metric-card">
              <span>Properties</span>
              <strong>{data.propertyCount}</strong>
              <small>{data.unitCount} total units</small>
            </article>
            <article className="metric-card">
              <span>Planned</span>
              <strong>{data.plannedUnitCount}</strong>
              <small>units with planned occupancy</small>
            </article>
            <article className="metric-card">
              <span>Vacant</span>
              <strong>{data.vacantUnitCount}</strong>
              <small>units without occupancy</small>
            </article>
          </section>

          <section className="panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Current operations</p>
                <h2>Operational attention</h2>
              </div>
              <span className="section-note">Current state · not rewound by as-of date</span>
            </div>
            <div className="operations-grid">
              <div><span>Open maintenance</span><strong>{data.currentOperations.openMaintenanceIssueCount}</strong></div>
              <div><span>Urgent maintenance</span><strong>{data.currentOperations.urgentMaintenanceIssueCount}</strong></div>
              <div><span>Open work orders</span><strong>{data.currentOperations.openMaintenanceWorkOrderCount}</strong></div>
              <div><span>Located assets</span><strong>{data.currentOperations.locatedAssetCount}</strong></div>
              <div><span>Active service plans</span><strong>{data.currentOperations.activeServicePlanCount}</strong></div>
              <div><span>Active meters</span><strong>{data.currentOperations.activeMeterCount}</strong></div>
            </div>
          </section>

          <section className="panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Cost ledger</p>
                <h2>Portfolio costs by currency</h2>
              </div>
              <span className="section-note">No cross-currency total or FX conversion</span>
            </div>
            {data.portfolioCostsByCurrency.length === 0 ? (
              <p className="muted">No attributed costs through {data.asOf}.</p>
            ) : (
              <div className="cost-grid">
                {data.portfolioCostsByCurrency.map((cost) => (
                  <article className="cost-card" key={cost.currency}>
                    <span>{cost.currency}</span>
                    <strong>{formatExactMoney(cost.currency, cost.total)}</strong>
                    <dl>
                      <div><dt>CAPEX</dt><dd>{formatExactMoney(cost.currency, cost.capex)}</dd></div>
                      <div><dt>OPEX</dt><dd>{formatExactMoney(cost.currency, cost.opex)}</dd></div>
                      <div><dt>Unclassified</dt><dd>{formatExactMoney(cost.currency, cost.unclassified)}</dd></div>
                    </dl>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Inventory</p>
                <h2>Properties</h2>
              </div>
              <span className="section-note">Snapshot {data.asOf}</span>
            </div>
            {data.properties.length === 0 ? (
              <p className="muted">No properties in the Portfolio projection.</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Property</th><th>Units</th><th>Occupied</th><th>Planned</th>
                      <th>Vacant</th><th>Open issues</th><th>Urgent</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.properties.map((property) => (
                      <tr key={property.propertyId}>
                        <td>
                          <button
                            className="table-link"
                            onClick={() => onSelectProperty(property)}
                            type="button"
                          >
                            <strong>{property.propertyCode}</strong>
                            <span>{property.propertyName}</span>
                          </button>
                        </td>
                        <td>{property.unitCount}</td>
                        <td>{property.occupiedUnitCount}</td>
                        <td>{property.plannedUnitCount}</td>
                        <td>{property.vacantUnitCount}</td>
                        <td>{property.currentOpenMaintenanceIssueCount}</td>
                        <td>{property.currentUrgentMaintenanceIssueCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      ) : null}
    </>
  );
}
