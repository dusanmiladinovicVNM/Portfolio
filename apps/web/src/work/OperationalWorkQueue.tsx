import {
  WORK_ATTENTION_VALUES,
  operationalWorkQueueResponseSchema,
  type OperationalWorkItemResponse,
} from '@portfolio/contracts';
import { useEffect, useMemo, useState } from 'react';
import { operationalWorkPath } from '../api/paths.js';
import type { PortfolioApi } from '../api/portfolio-api.js';
import { WorkspaceLink } from '../navigation/WorkspaceLink.js';
import { isWorkspaceAsOf, workRoute } from '../navigation/workspace-route.js';
import type { NavigateWorkspace } from '../navigation/use-workspace-navigation.js';
import {
  formatDetailKey,
  formatSwissDate,
  formatSwissDateTime,
} from '../presentation/format.js';
import {
  workAttentionLabel,
  workDomainLabel,
  workItemActionLabel,
  workItemCode,
  workItemKey,
  workItemHeadline,
  workItemRoute,
  workItemSummary,
  workOccupancyReasonLabel,
} from './work-presentation.js';

type WorkDomain = 'all' | OperationalWorkItemResponse['kind'];
type WorkAttentionFilter = 'all' | (typeof WORK_ATTENTION_VALUES)[number];

interface OperationalWorkQueueProps {
  readonly api: PortfolioApi;
  readonly asOf: string;
  readonly navigate: NavigateWorkspace;
  readonly staffRole: 'admin' | 'manager' | 'inspector' | null;
}

function assignedLabel(
  item: Extract<OperationalWorkItemResponse, { kind: 'inspection' }>,
): string {
  if (item.assignedToDisplayName === null) {
    return 'Assigned staff unavailable';
  }
  return item.assignedToRole === null
    ? item.assignedToDisplayName
    : `${item.assignedToDisplayName} · ${formatDetailKey(item.assignedToRole)}`;
}

function locationLabel(item: OperationalWorkItemResponse): string {
  const property = `${item.propertyName} · ${item.propertyCode}`;
  return item.unitId === null
    ? `${property} · Property-level`
    : `${property} · ${item.unitCode} · Unit ${item.unitNumber}`;
}

export function OperationalWorkQueue({
  api,
  asOf,
  navigate,
  staffRole,
}: OperationalWorkQueueProps) {
  const [items, setItems] =
    useState<readonly OperationalWorkItemResponse[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [domainFilter, setDomainFilter] = useState<WorkDomain>('all');
  const [attentionFilter, setAttentionFilter] =
    useState<WorkAttentionFilter>('all');

  useEffect(() => {
    const controller = new AbortController();
    setItems(null);
    setError(null);

    void api
      .get(
        operationalWorkPath(asOf),
        operationalWorkQueueResponseSchema,
        { signal: controller.signal },
      )
      .then((response) => {
        if (controller.signal.aborted) return;
        if (response.referenceDate !== asOf) {
          setError('Work queue returned a different reference date.');
          return;
        }
        setItems(response.items);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(
          cause instanceof Error
            ? cause.message
            : 'Operational Work queue could not be loaded.',
        );
      });

    return () => controller.abort();
  }, [api, asOf]);

  const visibleItems = useMemo(
    () =>
      (items ?? []).filter(
        (item) =>
          (domainFilter === 'all' || item.kind === domainFilter) &&
          (attentionFilter === 'all' ||
            item.attention === attentionFilter),
      ),
    [attentionFilter, domainFilter, items],
  );

  const counts = useMemo(() => {
    const result = {
      all: 0,
      urgent: 0,
      overdue: 0,
      today: 0,
    };
    for (const item of items ?? []) {
      result.all += 1;
      if (
        item.attention === 'urgent' ||
        item.attention === 'overdue' ||
        item.attention === 'today'
      ) {
        result[item.attention] += 1;
      }
    }
    return result;
  }, [items]);

  const queueScope =
    staffRole === 'inspector'
      ? 'Your assigned Inspection and Maintenance work.'
      : staffRole === 'admin' || staffRole === 'manager'
        ? 'Current operational work across Inspections, Maintenance, Service and occupancy/contracts.'
        : 'Current operational work across the Portfolio.';

  const quickFilters = [
    { value: 'all', label: 'All', count: counts.all },
    { value: 'overdue', label: 'Overdue', count: counts.overdue },
    { value: 'urgent', label: 'Urgent', count: counts.urgent },
    { value: 'today', label: 'Today', count: counts.today },
  ] as const;

  return (
    <>
      <header className="workspace-header work-queue-header">
        <div>
          <p className="eyebrow">Operations</p>
          <h1>Work</h1>
          <p className="header-note work-queue-intro">
            {queueScope} The item set is current canonical state. Queue date only
            derives dated attention for scheduled Inspection, Service and
            occupancy work; it does not rewind the Work set.
          </p>
        </div>
        <label className="work-queue-date">
          As of · attention date
          <input
            aria-label="Work queue attention date"
            onChange={(event) => {
              const nextAsOf = event.currentTarget.value;
              if (!isWorkspaceAsOf(nextAsOf)) return;
              navigate(workRoute(nextAsOf), { replace: true });
            }}
            type="date"
            value={asOf}
          />
        </label>
      </header>

      <section className="work-queue-stack" data-operational-work-queue>
        <div className="work-queue-toolbar">
          <div
            aria-label="Work attention quick filters"
            className="work-queue-quick-filters"
            role="group"
          >
            {quickFilters.map((filter) => (
              <button
                aria-pressed={attentionFilter === filter.value}
                className={
                  'work-queue-filter-pill' +
                  (attentionFilter === filter.value ? ' work-queue-filter-pill-active' : '')
                }
                data-work-filter={filter.value}
                key={filter.value}
                onClick={() => setAttentionFilter(filter.value)}
                type="button"
              >
                {filter.label}
                <span>{items === null ? '—' : filter.count}</span>
              </button>
            ))}
          </div>

          <div className="work-queue-filters">
            <label>
              Domain
              <select
                onChange={(event) =>
                  setDomainFilter(event.currentTarget.value as WorkDomain)
                }
                value={domainFilter}
              >
                <option value="all">All work types</option>
                <option value="inspection">Inspections</option>
                <option value="maintenance">Maintenance</option>
                <option value="service">Service</option>
                <option value="occupancy">Occupancy &amp; contracts</option>
              </select>
            </label>
            <label>
              Attention
              <select
                onChange={(event) =>
                  setAttentionFilter(event.currentTarget.value as WorkAttentionFilter)
                }
                value={attentionFilter}
              >
                <option value="all">All attention</option>
                {WORK_ATTENTION_VALUES.map((attention) => (
                  <option key={attention} value={attention}>
                    {workAttentionLabel(attention)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className="work-queue-panel">
          <div className="work-queue-panel-heading">
            <div>
              <h2>Active work</h2>
              <p className="muted">
                {items === null
                  ? 'Loading canonical work items…'
                  : visibleItems.length === items.length
                    ? String(items.length) + ' current tasks'
                    : String(visibleItems.length) + ' of ' + String(items.length) + ' current tasks'}
                {' · '}Attention reflects {formatSwissDate(asOf)}.
              </p>
            </div>
            <small>Only authorized current items are listed.</small>
          </div>

          {error ? <p className="form-error" role="alert">{error}</p> : null}
          {!error && items === null ? (
            <p className="muted" aria-live="polite">
              Loading operational Work…
            </p>
          ) : null}
          {items !== null && items.length === 0 ? (
            <p className="muted">No active operational Work.</p>
          ) : null}
          {items !== null && items.length > 0 && visibleItems.length === 0 ? (
            <p className="muted">No Work matches these filters.</p>
          ) : null}

          {visibleItems.length > 0 ? (
            <div className="work-queue-list">
              {visibleItems.map((item) => (
                <article
                  className="work-queue-card"
                  data-work-attention={item.attention}
                  data-work-domain={item.kind}
                  key={workItemKey(item)}
                >
                  <div className="work-queue-card-primary">
                    <span className={'work-attention work-attention-' + item.attention}>
                      {workAttentionLabel(item.attention)}
                    </span>
                    <div className="work-queue-card-copy">
                      <strong className="work-queue-card-title">
                        {workItemHeadline(item)}
                      </strong>
                      <small className="work-queue-card-context">
                        {locationLabel(item)}
                      </small>
                      <div className="work-queue-card-summary">
                        <strong>{workItemCode(item)}</strong>
                        <span>{workItemSummary(item)}</span>
                        {item.kind === 'inspection' ? (
                          <span>{assignedLabel(item)}</span>
                        ) : null}
                        {item.kind === 'service' ? (
                          <span>{item.assetName}</span>
                        ) : null}
                        {item.kind === 'occupancy' && item.agreementCode === null ? (
                          <span>No covering agreement</span>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className="work-queue-card-action">
                    <span className="status-chip">
                      {item.kind === 'inspection'
                        ? formatDetailKey(item.inspectionStatus)
                        : item.kind === 'maintenance'
                          ? formatDetailKey(item.priority)
                          : item.kind === 'service'
                            ? formatSwissDate(item.dueOn)
                            : workOccupancyReasonLabel(item.reason)}
                    </span>
                    <WorkspaceLink
                      ariaLabel={workItemActionLabel(item) + ' ' + workItemCode(item)}
                      className="button-secondary work-queue-open"
                      navigate={navigate}
                      route={workItemRoute(item, asOf)}
                    >
                      {workItemActionLabel(item)}
                    </WorkspaceLink>
                  </div>

                  <details className="work-queue-card-extra">
                    <summary>Task details</summary>
                  <dl>
                    <div>
                      <dt>Context</dt>
                      <dd>{locationLabel(item)}</dd>
                    </div>

                    {item.kind === 'inspection' ? (
                      <>
                        <div>
                          <dt>Lifecycle</dt>
                          <dd>{formatDetailKey(item.inspectionStatus)}</dd>
                        </div>
                        <div>
                          <dt>Assignee</dt>
                          <dd>{assignedLabel(item)}</dd>
                        </div>
                        <div>
                          <dt>Scheduled</dt>
                          <dd>
                            {item.scheduledFor
                              ? formatSwissDate(item.scheduledFor)
                              : 'Unscheduled'}
                          </dd>
                        </div>
                      </>
                    ) : null}

                    {item.kind === 'maintenance' ? (
                      <>
                        <div>
                          <dt>Issue</dt>
                          <dd>{item.title}</dd>
                        </div>
                        <div>
                          <dt>Priority</dt>
                          <dd>{formatDetailKey(item.priority)}</dd>
                        </div>
                        <div>
                          <dt>Reported</dt>
                          <dd>{formatSwissDateTime(item.reportedAt)}</dd>
                        </div>
                        <div>
                          <dt>Active work orders</dt>
                          <dd>{item.activeWorkOrderCount}</dd>
                        </div>
                      </>
                    ) : null}

                    {item.kind === 'service' ? (
                      <>
                        <div>
                          <dt>Plan</dt>
                          <dd>{item.planName}</dd>
                        </div>
                        <div>
                          <dt>Asset</dt>
                          <dd>{item.assetName}</dd>
                        </div>
                        <div>
                          <dt>Schedule</dt>
                          <dd>
                            {item.scheduleKind === 'recurring'
                              ? `Every ${item.intervalMonths} month${item.intervalMonths === 1 ? '' : 's'}`
                              : 'One time'}
                          </dd>
                        </div>
                        <div>
                          <dt>Due</dt>
                          <dd>{formatSwissDate(item.dueOn)}</dd>
                        </div>
                      </>
                    ) : null}

                    {item.kind === 'occupancy' ? (
                      <>
                        <div>
                          <dt>Attention</dt>
                          <dd>{workOccupancyReasonLabel(item.reason)}</dd>
                        </div>
                        <div>
                          <dt>Tenancy</dt>
                          <dd>
                            {item.tenancyCode} · {formatDetailKey(item.tenancyStatus)}
                          </dd>
                        </div>
                        <div>
                          <dt>Agreement</dt>
                          <dd>{item.agreementCode ?? 'No covering agreement'}</dd>
                        </div>
                        <div>
                          <dt>Due</dt>
                          <dd>
                            {item.dueDate
                              ? formatSwissDate(item.dueDate)
                              : 'No due date'}
                          </dd>
                        </div>
                      </>
                    ) : null}
                  </dl>
                  </details>
                </article>
              ))}
            </div>
          ) : null}
        </div>
      </section>
    </>
  );
}
