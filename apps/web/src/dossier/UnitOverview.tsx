import {
  unitReportingOverviewResponseSchema,
  type UnitReportingOverviewResponse,
} from '@portfolio/contracts';
import { useEffect, useState } from 'react';
import { unitOverviewPath } from '../api/paths.js';
import type { PortfolioApi } from '../api/portfolio-api.js';
import { isWorkspaceAsOf } from '../navigation/workspace-route.js';
import {
  formatExactMoney,
  formatSwissDate,
} from '../presentation/format.js';

interface UnitOverviewProps {
  readonly api: PortfolioApi;
  readonly unitId: string;
  readonly asOf: string;
  readonly onAsOfChange: (asOf: string) => void;
}

function coverageLabel(
  status: UnitReportingOverviewResponse['contract']['coverageStatus'],
): string {
  if (status === 'future_signed') return 'Future signed';
  if (status === 'effective') return 'Effective';
  return 'Missing';
}

export function UnitOverview({
  api,
  unitId,
  asOf,
  onAsOfChange,
}: UnitOverviewProps) {
  const [overview, setOverview] =
    useState<UnitReportingOverviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setOverview(null);
    setError(null);

    void api
      .get(
        unitOverviewPath(unitId, asOf),
        unitReportingOverviewResponseSchema,
        { signal: controller.signal },
      )
      .then((result) => {
        if (result.asOf !== asOf) {
          throw new Error('Unit overview returned a different as-of date.');
        }
        setOverview(result);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(
          cause instanceof Error
            ? cause.message
            : 'Unit dossier overview could not be loaded.',
        );
      });

    return () => controller.abort();
  }, [api, asOf, unitId]);

  return (
    <>
      <div className="dossier-toolbar">
        <div>
          <p className="eyebrow">Historical overview</p>
          <p className="muted">
            Occupancy, tenancy, contract coverage and attributed costs use this
            business date. Operational counters remain current.
          </p>
        </div>
        <label className="date-control">
          Overview as of
          <input
            aria-label="Unit overview business date"
            onChange={(event) => {
              const nextAsOf = event.currentTarget.value;
              if (!isWorkspaceAsOf(nextAsOf)) return;
              onAsOfChange(nextAsOf);
            }}
            required
            type="date"
            value={asOf}
          />
        </label>
      </div>

      {error ? (
        <section className="panel state-panel" role="alert">
          <p className="eyebrow">Read failed</p>
          <h2>Overview unavailable</h2>
          <p>{error}</p>
        </section>
      ) : null}

      {!error && overview === null ? (
        <section className="panel state-panel" aria-live="polite">
          <p className="eyebrow">Unit projection</p>
          <h2>Loading overview…</h2>
        </section>
      ) : null}

      {overview ? (
        <div className="dashboard-stack">
          <section className="metric-grid">
            <article className="metric-card metric-card-primary">
              <span>Occupancy</span>
              <strong className="text-metric">{overview.occupancyStatus}</strong>
              <small>as of {overview.asOf}</small>
            </article>
            <article className="metric-card">
              <span>Contract coverage</span>
              <strong className="text-metric">
                {coverageLabel(overview.contract.coverageStatus)}
              </strong>
              <small>{overview.contract.agreementCode ?? 'No selected agreement'}</small>
            </article>
            <article className="metric-card">
              <span>Area</span>
              <strong>{overview.areaM2 === null ? '—' : overview.areaM2}</strong>
              <small>{overview.areaM2 === null ? 'not recorded' : 'm²'}</small>
            </article>
            <article className="metric-card">
              <span>Rooms</span>
              <strong>{overview.rooms ?? '—'}</strong>
              <small>floor {overview.floor ?? '—'}</small>
            </article>
          </section>

          <section className="dossier-grid">
            <article className="panel">
              <p className="eyebrow">Tenancy</p>
              <h2>{overview.tenancy?.code ?? 'No tenancy at this date'}</h2>
              {overview.tenancy ? (
                <dl className="detail-list">
                  <div><dt>Status</dt><dd>{overview.tenancy.currentStatus}</dd></div>
                  <div><dt>Actual start</dt><dd>{formatSwissDate(overview.tenancy.actualStart)}</dd></div>
                  <div><dt>Actual end</dt><dd>{formatSwissDate(overview.tenancy.actualEnd)}</dd></div>
                  <div><dt>Planned start</dt><dd>{formatSwissDate(overview.tenancy.plannedStart)}</dd></div>
                  <div><dt>Planned end</dt><dd>{formatSwissDate(overview.tenancy.plannedEnd)}</dd></div>
                </dl>
              ) : (
                <p className="muted">
                  The reporting projection classifies this Unit as vacant.
                </p>
              )}
            </article>

            <article className="panel">
              <p className="eyebrow">Contract</p>
              <h2>{coverageLabel(overview.contract.coverageStatus)}</h2>
              <dl className="detail-list">
                <div><dt>Agreement</dt><dd>{overview.contract.agreementCode ?? '—'}</dd></div>
                <div><dt>Status</dt><dd>{overview.contract.agreementCurrentStatus ?? '—'}</dd></div>
                <div>
                  <dt>Effective</dt>
                  <dd>{formatSwissDate(overview.contract.effectiveFrom)} → {overview.contract.effectiveTo ? formatSwissDate(overview.contract.effectiveTo) : 'open'}</dd>
                </div>
                <div><dt>Signed</dt><dd>{formatSwissDate(overview.contract.signedAt)}</dd></div>
                <div><dt>Other drafts</dt><dd>{overview.contract.currentDraftAgreementCount}</dd></div>
              </dl>
              {overview.contract.effectiveTerms ? (
                <div className="term-total">
                  <span>Recurring total</span>
                  <strong>
                    {formatExactMoney(
                      overview.contract.effectiveTerms.currency,
                      overview.contract.effectiveTerms.recurringTotal,
                    )}
                  </strong>
                  <small>{overview.contract.effectiveTerms.billingFrequency}</small>
                </div>
              ) : null}
            </article>
          </section>

          <section className="panel">
            <div className="section-heading">
              <div><p className="eyebrow">Current operations</p><h2>Unit attention</h2></div>
              <span className="section-note">
                Current state · independent of overview as-of
              </span>
            </div>
            <div className="operations-grid">
              <div><span>Open issues</span><strong>{overview.currentOperations.openMaintenanceIssueCount}</strong></div>
              <div><span>Urgent issues</span><strong>{overview.currentOperations.urgentMaintenanceIssueCount}</strong></div>
              <div><span>Work orders</span><strong>{overview.currentOperations.openMaintenanceWorkOrderCount}</strong></div>
              <div><span>Located assets</span><strong>{overview.currentOperations.locatedAssetCount}</strong></div>
              <div><span>Service plans</span><strong>{overview.currentOperations.activeServicePlanCount}</strong></div>
              <div><span>Active meters</span><strong>{overview.currentOperations.activeMeterCount}</strong></div>
            </div>
          </section>

          <section className="panel">
            <div className="section-heading">
              <div><p className="eyebrow">Attributed cost ledger</p><h2>Costs through {formatSwissDate(overview.asOf)}</h2></div>
              <span className="section-note">Currencies stay separate</span>
            </div>
            {overview.unitAttributedCostsByCurrency.length === 0 ? (
              <p className="muted">
                No costs attributed to this Unit through the selected date.
              </p>
            ) : (
              <div className="cost-grid">
                {overview.unitAttributedCostsByCurrency.map((cost) => (
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
