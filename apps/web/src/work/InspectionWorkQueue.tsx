import {
  inspectionWorkQueueListResponseSchema,
  type InspectionWorkQueueItemResponse,
} from '@portfolio/contracts';
import { useEffect, useMemo, useState } from 'react';
import { inspectionWorkQueuePath } from '../api/paths.js';
import type { PortfolioApi } from '../api/portfolio-api.js';
import { WorkspaceLink } from '../navigation/WorkspaceLink.js';
import { unitRoute } from '../navigation/workspace-route.js';
import type { NavigateWorkspace } from '../navigation/use-workspace-navigation.js';
import {
  formatDetailKey,
  formatSwissDate,
} from '../presentation/format.js';

type WorkAttention = 'overdue' | 'today' | 'upcoming' | 'unscheduled';

interface InspectionWorkQueueProps {
  readonly api: PortfolioApi;
  readonly asOf: string;
  readonly navigate: NavigateWorkspace;
  readonly staffRole: 'admin' | 'manager' | 'inspector' | null;
}

function attentionFor(
  item: InspectionWorkQueueItemResponse,
  asOf: string,
): WorkAttention {
  const scheduledFor = item.inspection.scheduledFor;
  if (scheduledFor === null) return 'unscheduled';
  if (scheduledFor < asOf) return 'overdue';
  if (scheduledFor === asOf) return 'today';
  return 'upcoming';
}

const attentionRank: Readonly<Record<WorkAttention, number>> = {
  overdue: 0,
  today: 1,
  upcoming: 2,
  unscheduled: 3,
};

function attentionLabel(value: WorkAttention): string {
  switch (value) {
    case 'overdue':
      return 'Overdue';
    case 'today':
      return 'Today';
    case 'upcoming':
      return 'Upcoming';
    case 'unscheduled':
      return 'Unscheduled';
  }
}

function assignedLabel(item: InspectionWorkQueueItemResponse): string {
  if (item.assignedToDisplayName === null) return 'Assigned staff unavailable';
  return item.assignedToRole === null
    ? item.assignedToDisplayName
    : `${item.assignedToDisplayName} · ${formatDetailKey(item.assignedToRole)}`;
}

export function InspectionWorkQueue({
  api,
  asOf,
  navigate,
  staffRole,
}: InspectionWorkQueueProps) {
  const [items, setItems] =
    useState<readonly InspectionWorkQueueItemResponse[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [assigneeFilter, setAssigneeFilter] = useState('all');

  useEffect(() => {
    const controller = new AbortController();
    setItems(null);
    setError(null);

    void api
      .get(
        inspectionWorkQueuePath(),
        inspectionWorkQueueListResponseSchema,
        { signal: controller.signal },
      )
      .then((response) => {
        if (!controller.signal.aborted) setItems(response.items);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(
          cause instanceof Error
            ? cause.message
            : 'Inspection work queue could not be loaded.',
        );
      });

    return () => controller.abort();
  }, [api]);

  const assignees = useMemo(() => {
    const unique = new Map<string, string>();
    for (const item of items ?? []) {
      unique.set(
        item.inspection.assignedToUserId,
        item.assignedToDisplayName ?? 'Assigned staff unavailable',
      );
    }
    return [...unique.entries()].sort((left, right) =>
      left[1].localeCompare(right[1]),
    );
  }, [items]);

  const visibleItems = useMemo(() => {
    const filtered = (items ?? []).filter(
      (item) =>
        (statusFilter === 'all' || item.inspection.status === statusFilter) &&
        (assigneeFilter === 'all' ||
          item.inspection.assignedToUserId === assigneeFilter),
    );
    return [...filtered].sort((left, right) => {
      const leftAttention = attentionFor(left, asOf);
      const rightAttention = attentionFor(right, asOf);
      const attentionDelta =
        attentionRank[leftAttention] - attentionRank[rightAttention];
      if (attentionDelta !== 0) return attentionDelta;

      const leftDate = left.inspection.scheduledFor ?? '9999-12-31';
      const rightDate = right.inspection.scheduledFor ?? '9999-12-31';
      const dateDelta = leftDate.localeCompare(rightDate);
      if (dateDelta !== 0) return dateDelta;

      const propertyDelta = left.propertyCode.localeCompare(right.propertyCode);
      if (propertyDelta !== 0) return propertyDelta;
      const unitDelta = left.unitCode.localeCompare(right.unitCode);
      if (unitDelta !== 0) return unitDelta;
      return left.inspection.code.localeCompare(right.inspection.code);
    });
  }, [asOf, assigneeFilter, items, statusFilter]);

  const counts = useMemo(() => {
    const result: Record<WorkAttention, number> = {
      overdue: 0,
      today: 0,
      upcoming: 0,
      unscheduled: 0,
    };
    for (const item of items ?? []) {
      result[attentionFor(item, asOf)] += 1;
    }
    return result;
  }, [asOf, items]);

  const queueScope =
    staffRole === 'inspector'
      ? 'Your active assigned Inspections across all Units.'
      : staffRole === 'admin' || staffRole === 'manager'
        ? 'Active Inspection work across the company.'
        : 'Active Inspection work across Units.';

  return (
    <>
      <header className="workspace-header">
        <div>
          <p className="eyebrow">Operations</p>
          <h1>Work queue</h1>
          <p className="header-note">
            {queueScope} Attention order is derived from the scheduled date;
            lifecycle status and assignment remain canonical Inspection data.
          </p>
        </div>
        <div className="work-queue-date">
          <span>Queue date</span>
          <strong>{formatSwissDate(asOf)}</strong>
        </div>
      </header>

      <div className="work-queue-stack" data-inspection-work-queue>
        <section className="work-queue-metrics" aria-label="Inspection work summary">
          {(['overdue', 'today', 'upcoming', 'unscheduled'] as const).map(
            (attention) => (
              <div key={attention}>
                <span>{attentionLabel(attention)}</span>
                <strong>{counts[attention]}</strong>
              </div>
            ),
          )}
        </section>

        <section className="panel work-queue-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Inspection operations</p>
              <h2>Active work</h2>
            </div>
            <span className="section-note">
              draft · in progress · locked
            </span>
          </div>

          <div className="work-queue-filters">
            <label>
              Lifecycle
              <select
                onChange={(event) => setStatusFilter(event.currentTarget.value)}
                value={statusFilter}
              >
                <option value="all">All active</option>
                <option value="draft">Draft</option>
                <option value="in_progress">In progress</option>
                <option value="locked">Locked</option>
              </select>
            </label>
            <label>
              Assignee
              <select
                onChange={(event) => setAssigneeFilter(event.currentTarget.value)}
                value={assigneeFilter}
              >
                <option value="all">All assignees</option>
                {assignees.map(([userId, label]) => (
                  <option key={userId} value={userId}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {error ? <p className="form-error" role="alert">{error}</p> : null}
          {!error && items === null ? (
            <p className="muted" aria-live="polite">
              Loading active Inspection work…
            </p>
          ) : null}
          {items !== null && items.length === 0 ? (
            <p className="muted">No active Inspection work.</p>
          ) : null}
          {items !== null && items.length > 0 && visibleItems.length === 0 ? (
            <p className="muted">No Inspection work matches these filters.</p>
          ) : null}

          {visibleItems.length > 0 ? (
            <div className="work-queue-list">
              {visibleItems.map((item) => {
                const attention = attentionFor(item, asOf);
                return (
                  <article
                    className="work-queue-card"
                    data-work-attention={attention}
                    key={item.inspection.id}
                  >
                    <div className="work-queue-card-primary">
                      <span
                        className={`work-attention work-attention-${attention}`}
                      >
                        {attentionLabel(attention)}
                      </span>
                      <div>
                        <strong>{item.inspection.code}</strong>
                        <small>
                          {formatDetailKey(item.inspection.inspectionType)}
                        </small>
                      </div>
                    </div>

                    <dl>
                      <div>
                        <dt>Property</dt>
                        <dd>
                          {item.propertyName} · {item.propertyCode}
                        </dd>
                      </div>
                      <div>
                        <dt>Unit</dt>
                        <dd>
                          {item.unitCode} · Unit {item.unitNumber}
                        </dd>
                      </div>
                      <div>
                        <dt>Assignee</dt>
                        <dd>{assignedLabel(item)}</dd>
                      </div>
                      <div>
                        <dt>Scheduled</dt>
                        <dd>
                          {item.inspection.scheduledFor
                            ? formatSwissDate(item.inspection.scheduledFor)
                            : 'Unscheduled'}
                        </dd>
                      </div>
                    </dl>

                    <div className="work-queue-card-action">
                      <span className="status-chip">
                        {formatDetailKey(item.inspection.status)}
                      </span>
                      <WorkspaceLink
                        className="button-secondary work-queue-open"
                        navigate={navigate}
                        route={unitRoute(
                          item.propertyId,
                          item.inspection.unitId,
                          asOf,
                          'inspections',
                          { inspectionId: item.inspection.id },
                        )}
                      >
                        Open Inspection
                      </WorkspaceLink>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : null}
        </section>
      </div>
    </>
  );
}
