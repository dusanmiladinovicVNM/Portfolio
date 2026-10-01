import {
  WORK_ATTENTION_VALUES,
  operationalWorkQueueResponseSchema,
  type OperationalWorkItemResponse,
} from '@portfolio/contracts';
import { useEffect, useMemo, useState } from 'react';
import { operationalWorkPath } from '../api/paths.js';
import type { PortfolioApi } from '../api/portfolio-api.js';
import { WorkspaceLink } from '../navigation/WorkspaceLink.js';
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
  workItemRoute,
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

  return (
    <>
      <header className="workspace-header">
        <div>
          <p className="eyebrow">Operations</p>
          <h1>Work</h1>
          <p className="header-note">
            {queueScope} The item set is current canonical state. Queue date only
            derives dated attention for scheduled Inspection and occupancy work;
            it does not rewind the Work set.
          </p>
        </div>
        <div className="work-queue-date">
          <span>Queue date</span>
          <strong>{formatSwissDate(asOf)}</strong>
        </div>
      </header>

      <div className="work-queue-stack" data-operational-work-queue>
        <section className="work-queue-metrics" aria-label="Operational Work summary">
          <div>
            <span>Active work</span>
            <strong>{counts.all}</strong>
          </div>
          <div>
            <span>Urgent</span>
            <strong>{counts.urgent}</strong>
          </div>
          <div>
            <span>Overdue</span>
            <strong>{counts.overdue}</strong>
          </div>
          <div>
            <span>Today</span>
            <strong>{counts.today}</strong>
          </div>
        </section>

        <section className="panel work-queue-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Canonical operational read model</p>
              <h2>Active work</h2>
              <p className="muted">
                Attention is derived for presentation only. Lifecycle, priority,
                assignment and contract state remain owned by their source domains.
              </p>
            </div>
            <span className="section-note">
              current work · queue date {formatSwissDate(asOf)}
            </span>
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
                <option value="all">All work</option>
                <option value="inspection">Inspections</option>
                <option value="maintenance">Maintenance</option>
                <option value="service">Service</option>
                <option value="occupancy">Occupancy & contracts</option>
              </select>
            </label>
            <label>
              Attention
              <select
                onChange={(event) =>
                  setAttentionFilter(
                    event.currentTarget.value as WorkAttentionFilter,
                  )
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
                    <span
                      className={`work-attention work-attention-${item.attention}`}
                    >
                      {workAttentionLabel(item.attention)}
                    </span>
                    <div>
                      <strong>{workItemCode(item)}</strong>
                      <small>{workDomainLabel(item.kind)}</small>
                    </div>
                  </div>

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
                      className="button-secondary work-queue-open"
                      navigate={navigate}
                      route={workItemRoute(item, asOf)}
                    >
                      {workItemActionLabel(item)}
                    </WorkspaceLink>
                  </div>
                </article>
              ))}
            </div>
          ) : null}
        </section>
      </div>
    </>
  );
}
