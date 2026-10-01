import {
  portfolioDashboardResponseSchema,
  type PortfolioDashboardResponse,
} from '@portfolio/contracts';
import { useEffect, useState } from 'react';
import { CreatePropertyForm } from '../admin/CreatePropertyForm.js';
import { PortfolioCommandCenter } from './PortfolioCommandCenter.js';
import { reportingDashboardPath } from '../api/paths.js';
import type { PortfolioApi } from '../api/portfolio-api.js';
import { WorkspaceLink } from '../navigation/WorkspaceLink.js';
import {
  dashboardRoute,
  isWorkspaceAsOf,
  propertyRoute,
} from '../navigation/workspace-route.js';
import type { NavigateWorkspace } from '../navigation/use-workspace-navigation.js';
import {
  formatExactMoney,
  formatSwissDate,
} from '../presentation/format.js';

interface PortfolioDashboardProps {
  readonly api: PortfolioApi;
  readonly asOf: string;
  readonly navigate: NavigateWorkspace;
  readonly staffRole: 'admin' | 'manager' | 'inspector' | null;
}

function occupancyRate(data: PortfolioDashboardResponse): string {
  if (data.unitCount === 0) return '—';
  return `${Math.round((data.occupiedUnitCount / data.unitCount) * 100)}%`;
}

function LoadingState() {
  return (
    <section className="panel state-panel" aria-live="polite">
      <p className="eyebrow">Portfolio reporting</p>
      <h2>Loading reporting projection…</h2>
    </section>
  );
}

export function PortfolioDashboard({
  api,
  asOf,
  navigate,
  staffRole,
}: PortfolioDashboardProps) {
  const [data, setData] = useState<PortfolioDashboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [requestVersion, setRequestVersion] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setError(null);

    void api
      .get(reportingDashboardPath(asOf), portfolioDashboardResponseSchema, {
        signal: controller.signal,
      })
      .then((result) => {
        if (result.asOf !== asOf) {
          throw new Error('Portfolio dashboard returned a different as-of date.');
        }
        setData(result);
      })
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
          <h1>Portfolio</h1>
          <p className="header-note">
            Occupancy and costs use the selected business date. Property and Unit
            master inventory, plus operational counters, represent current state.
          </p>
        </div>
        <label className="date-control">
          As of
          <input
            aria-label="Reporting business date"
            onChange={(event) => {
              const nextAsOf = event.currentTarget.value;
              if (!isWorkspaceAsOf(nextAsOf)) return;
              navigate(dashboardRoute(nextAsOf), { replace: true });
            }}
            required
            type="date"
            value={asOf}
          />
        </label>
      </header>

      <PortfolioCommandCenter
        api={api}
        asOf={asOf}
        navigate={navigate}
        staffRole={staffRole}
      />

      <details
        className="portfolio-setup-disclosure"
        data-portfolio-setup
      >
        <summary>
          <span>
            <span className="eyebrow">Setup</span>
            <strong>Add property</strong>
            <small>Create canonical Portfolio master data only when needed.</small>
          </span>
          <span className="portfolio-setup-disclosure-action" aria-hidden="true">
            +
          </span>
        </summary>
        <div className="portfolio-setup-body">
          <CreatePropertyForm
            api={api}
            onCreated={(created) =>
              navigate(propertyRoute(created.id, asOf))
            }
          />
        </div>
      </details>



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
          <section
            className="panel portfolio-attention-panel"
            data-portfolio-section="operations"
          >
            <div className="section-heading">
              <div>
                <p className="eyebrow">Operational footprint</p>
                <h2>Current operating state</h2>
                <p className="muted">
                  Current Maintenance, Asset, Service and Meter counters. Actionable
                  work is prioritized above by the canonical Work projection.
                </p>
              </div>
              <span className="section-note">
                Current state · not rewound by as-of date
              </span>
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

          <section
            className="portfolio-projection"
            data-portfolio-section="occupancy"
            aria-labelledby="portfolio-occupancy-title"
          >
            <div className="section-heading portfolio-section-heading">
              <div>
                <p className="eyebrow">Reporting projection</p>
                <h2 id="portfolio-occupancy-title">
                  Occupancy as of {formatSwissDate(data.asOf)}
                </h2>
                <p className="muted">
                  Occupancy status is projected at the selected date over the
                  current Property and Unit master inventory.
                </p>
              </div>
              <span className="section-note">Inventory population · current</span>
            </div>
            <div className="metric-grid" aria-label="Portfolio occupancy projection">
              <article className="metric-card metric-card-primary">
                <span>Occupancy as of</span>
                <strong>{occupancyRate(data)}</strong>
                <small>
                  {data.occupiedUnitCount} occupied on {formatSwissDate(data.asOf)}
                </small>
              </article>
              <article className="metric-card">
                <span>Current inventory</span>
                <strong>{data.propertyCount}</strong>
                <small>{data.unitCount} current Units</small>
              </article>
              <article className="metric-card">
                <span>Planned as of</span>
                <strong>{data.plannedUnitCount}</strong>
                <small>current Units projected as planned</small>
              </article>
              <article className="metric-card">
                <span>Vacant as of</span>
                <strong>{data.vacantUnitCount}</strong>
                <small>current Units projected as vacant</small>
              </article>
            </div>
          </section>

          <section className="panel" data-portfolio-section="properties">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Current inventory</p>
                <h2>Properties</h2>
                <p className="muted">
                  Property and Unit inventory is current. Occupancy columns use
                  {formatSwissDate(data.asOf)}; Maintenance columns are current.
                </p>
              </div>
              <span className="section-note">
                Occupancy · as of {formatSwissDate(data.asOf)} · Maintenance · current
              </span>
            </div>
            {data.properties.length === 0 ? (
              <p className="muted">No properties in the Portfolio projection.</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Property</th>
                      <th>Units now</th>
                      <th>Occupied as of</th>
                      <th>Planned as of</th>
                      <th>Vacant as of</th>
                      <th>Open issues now</th>
                      <th>Urgent now</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.properties.map((property) => (
                      <tr key={property.propertyId}>
                        <td>
                          <WorkspaceLink
                            className="table-link"
                            navigate={navigate}
                            route={propertyRoute(property.propertyId, asOf)}
                          >
                            <strong>{property.propertyCode}</strong>
                            <span>{property.propertyName}</span>
                          </WorkspaceLink>
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

          <section className="panel" data-portfolio-section="costs">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Cost ledger</p>
                <h2>Portfolio costs by currency</h2>
              </div>
              <span className="section-note">
                No cross-currency total or FX conversion
              </span>
            </div>
            {data.portfolioCostsByCurrency.length === 0 ? (
              <p className="muted">No attributed costs through {formatSwissDate(data.asOf)}.</p>
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
        </div>
      ) : null}
    </>
  );
}
