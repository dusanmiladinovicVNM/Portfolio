import {
  operationalWorkQueueResponseSchema,
  type OperationalWorkItemResponse,
} from '@portfolio/contracts';
import { useEffect, useMemo, useState } from 'react';
import { operationalWorkPath } from '../api/paths.js';
import type { PortfolioApi } from '../api/portfolio-api.js';
import { WorkspaceLink } from '../navigation/WorkspaceLink.js';
import { workRoute } from '../navigation/workspace-route.js';
import type { NavigateWorkspace } from '../navigation/use-workspace-navigation.js';
import {
  formatDetailKey,
  formatSwissDate,
  localDateOnly,
} from '../presentation/format.js';
import {
  workAttentionLabel,
  workDomainLabel,
  workItemActionLabel,
  workItemCode,
  workItemKey,
  workItemRoute,
  workOccupancyReasonLabel,
} from '../work/work-presentation.js';

interface PortfolioCommandCenterProps {
  readonly api: PortfolioApi;
  readonly asOf: string;
  readonly navigate: NavigateWorkspace;
  readonly staffRole: 'admin' | 'manager' | 'inspector' | null;
}

const PREVIEW_LIMIT = 5;

function itemContext(item: OperationalWorkItemResponse): string {
  const property = `${item.propertyName} · ${item.propertyCode}`;
  if (item.unitId === null) return `${property} · Property-level`;
  return `${property} · ${item.unitCode} · Unit ${item.unitNumber}`;
}

function itemSummary(item: OperationalWorkItemResponse): string {
  if (item.kind === 'inspection') {
    return item.scheduledFor
      ? `${formatDetailKey(item.inspectionStatus)} · scheduled ${formatSwissDate(item.scheduledFor)}`
      : `${formatDetailKey(item.inspectionStatus)} · unscheduled`;
  }

  if (item.kind === 'maintenance') {
    return `${item.title} · ${formatDetailKey(item.priority)} priority`;
  }

  const due = item.dueDate
    ? ` · due ${formatSwissDate(item.dueDate)}`
    : '';
  return `${workOccupancyReasonLabel(item.reason)}${due}`;
}

export function PortfolioCommandCenter({
  api,
  asOf,
  navigate,
  staffRole,
}: PortfolioCommandCenterProps) {
  const [items, setItems] =
    useState<readonly OperationalWorkItemResponse[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [requestVersion, setRequestVersion] = useState(0);
  const workQueueDate = localDateOnly();

  useEffect(() => {
    const controller = new AbortController();
    setItems(null);
    setError(null);

    void api
      .get(
        operationalWorkPath(workQueueDate),
        operationalWorkQueueResponseSchema,
        { signal: controller.signal },
      )
      .then((response) => {
        if (controller.signal.aborted) return;
        if (response.referenceDate !== workQueueDate) {
          setError('Work command center returned a different operational date.');
          return;
        }
        setItems(response.items);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(
          cause instanceof Error
            ? cause.message
            : 'Operational Work could not be loaded.',
        );
      });

    return () => controller.abort();
  }, [api, requestVersion, workQueueDate]);

  const summary = useMemo(() => {
    const counts = {
      active: 0,
      actionNow: 0,
      urgent: 0,
      overdue: 0,
      today: 0,
    };

    for (const item of items ?? []) {
      counts.active += 1;
      if (
        item.attention === 'urgent' ||
        item.attention === 'overdue' ||
        item.attention === 'today' ||
        item.attention === 'high'
      ) {
        counts.actionNow += 1;
      }
      if (item.attention === 'urgent') counts.urgent += 1;
      if (item.attention === 'overdue') counts.overdue += 1;
      if (item.attention === 'today') counts.today += 1;
    }

    return counts;
  }, [items]);

  const preview = items?.slice(0, PREVIEW_LIMIT) ?? [];
  const scopeLabel =
    staffRole === 'inspector'
      ? 'Your assigned Work'
      : 'Portfolio Work';

  return (
    <section
      className="portfolio-command-center"
      data-portfolio-command-center
      data-portfolio-section="command-center"
      aria-labelledby="portfolio-command-center-title"
    >
      <div className="section-heading">
        <div>
          <p className="eyebrow">Daily operations</p>
          <h2 id="portfolio-command-center-title">What needs attention</h2>
          <p className="muted">
            {scopeLabel} is current canonical state. Operational attention is
            relative to today in Europe/Zurich ({formatSwissDate(workQueueDate)}),
            independently of the reporting date selected below.
          </p>
        </div>
        <WorkspaceLink
          className="button-secondary"
          navigate={navigate}
          route={workRoute(workQueueDate)}
        >
          View all Work
        </WorkspaceLink>
      </div>

      <div
        className="portfolio-command-center-metrics"
        aria-label="Portfolio Work attention summary"
      >
        <div>
          <span>Active Work</span>
          <strong>{items === null ? '—' : summary.active}</strong>
        </div>
        <div>
          <span>Action now</span>
          <strong>{items === null ? '—' : summary.actionNow}</strong>
        </div>
        <div>
          <span>Urgent</span>
          <strong>{items === null ? '—' : summary.urgent}</strong>
        </div>
        <div>
          <span>Overdue</span>
          <strong>{items === null ? '—' : summary.overdue}</strong>
        </div>
        <div>
          <span>Today</span>
          <strong>{items === null ? '—' : summary.today}</strong>
        </div>
      </div>

      {error ? (
        <div className="portfolio-command-center-error" role="alert">
          <strong>Work unavailable</strong>
          <span>{error}</span>
          <button
            className="button-secondary inline-button"
            onClick={() => setRequestVersion((value) => value + 1)}
            type="button"
          >
            Retry Work
          </button>
        </div>
      ) : null}

      {!error && items === null ? (
        <p className="muted" aria-live="polite">
          Loading operational Work…
        </p>
      ) : null}

      {items !== null && items.length === 0 ? (
        <div className="portfolio-command-center-clear">
          <strong>No active operational Work</strong>
          <span>The canonical Work projection is currently clear.</span>
        </div>
      ) : null}

      {preview.length > 0 ? (
        <div
          className="portfolio-command-center-actions"
          aria-label="Highest-priority operational Work"
        >
          {preview.map((item) => (
            <article
              className="portfolio-command-center-item"
              data-work-attention={item.attention}
              data-work-domain={item.kind}
              key={workItemKey(item)}
            >
              <div className="portfolio-command-center-item-main">
                <span
                  className={`work-attention work-attention-${item.attention}`}
                >
                  {workAttentionLabel(item.attention)}
                </span>
                <div>
                  <span className="portfolio-command-center-kind">
                    {workDomainLabel(item.kind)}
                  </span>
                  <strong>{workItemCode(item)}</strong>
                  <p>{itemSummary(item)}</p>
                  <small>{itemContext(item)}</small>
                </div>
              </div>
              <WorkspaceLink
                className="button-secondary"
                navigate={navigate}
                route={workItemRoute(item, workQueueDate)}
              >
                {workItemActionLabel(item)}
              </WorkspaceLink>
            </article>
          ))}
        </div>
      ) : null}

      {items !== null && items.length > PREVIEW_LIMIT ? (
        <p className="portfolio-command-center-more">
          Showing {PREVIEW_LIMIT} of {items.length} active Work items.
          <WorkspaceLink
            className="portfolio-command-center-more-link"
            navigate={navigate}
            route={workRoute(workQueueDate)}
          >
            Open full Work queue
          </WorkspaceLink>
        </p>
      ) : null}
    </section>
  );
}
