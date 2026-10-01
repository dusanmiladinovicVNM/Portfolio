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
  workItemSummary,
  workNeedsActionNow,
} from '../work/work-presentation.js';

interface PropertyCommandCenterProps {
  readonly api: PortfolioApi;
  readonly propertyId: string;
  readonly navigate: NavigateWorkspace;
}

const PREVIEW_LIMIT = 5;

function itemContext(item: OperationalWorkItemResponse): string {
  if (item.unitId === null) return 'Property-level';
  return item.unitCode + ' · Unit ' + item.unitNumber;
}

export function PropertyCommandCenter({
  api,
  propertyId,
  navigate,
}: PropertyCommandCenterProps) {
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
          setError('Property Work returned a different operational date.');
          return;
        }
        setItems(response.items);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(
          cause instanceof Error
            ? cause.message
            : 'Property Work could not be loaded.',
        );
      });

    return () => controller.abort();
  }, [api, requestVersion, workQueueDate]);

  const propertyItems = useMemo(
    () =>
      items === null
        ? null
        : items.filter((item) => item.propertyId === propertyId),
    [items, propertyId],
  );

  const summary = useMemo(() => {
    const affectedUnits = new Set<string>();
    const counts = {
      active: 0,
      actionNow: 0,
      urgent: 0,
      overdue: 0,
      affectedUnits: 0,
    };

    for (const item of propertyItems ?? []) {
      counts.active += 1;
      if (workNeedsActionNow(item.attention)) counts.actionNow += 1;
      if (item.attention === 'urgent') counts.urgent += 1;
      if (item.attention === 'overdue') counts.overdue += 1;
      if (item.unitId !== null) affectedUnits.add(item.unitId);
    }

    counts.affectedUnits = affectedUnits.size;
    return counts;
  }, [propertyItems]);

  const preview = propertyItems?.slice(0, PREVIEW_LIMIT) ?? [];

  return (
    <section
      className="portfolio-command-center"
      data-property-command-center
      aria-labelledby="property-command-center-title"
    >
      <div className="section-heading">
        <div>
          <p className="eyebrow">Daily operations</p>
          <h2 id="property-command-center-title">What needs attention</h2>
          <p className="muted">
            Current canonical Work for this Property, relative to today in
            Europe/Zurich ({formatSwissDate(workQueueDate)}). The server-ranked
            queue is only narrowed to this Property; it is not re-ranked here.
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
        aria-label="Property Work attention summary"
      >
        <div>
          <span>Active Work</span>
          <strong>{propertyItems === null ? '—' : summary.active}</strong>
        </div>
        <div>
          <span>Action now</span>
          <strong>{propertyItems === null ? '—' : summary.actionNow}</strong>
        </div>
        <div>
          <span>Urgent</span>
          <strong>{propertyItems === null ? '—' : summary.urgent}</strong>
        </div>
        <div>
          <span>Overdue</span>
          <strong>{propertyItems === null ? '—' : summary.overdue}</strong>
        </div>
        <div>
          <span>Units affected</span>
          <strong>{propertyItems === null ? '—' : summary.affectedUnits}</strong>
        </div>
      </div>

      {error ? (
        <div className="portfolio-command-center-error" role="alert">
          <strong>Property Work unavailable</strong>
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

      {!error && propertyItems === null ? (
        <p className="muted" aria-live="polite">
          Loading Property Work…
        </p>
      ) : null}

      {propertyItems !== null && propertyItems.length === 0 ? (
        <div className="portfolio-command-center-clear">
          <strong>No active Work for this Property</strong>
          <span>The canonical Work projection is currently clear here.</span>
        </div>
      ) : null}

      {preview.length > 0 ? (
        <div
          className="portfolio-command-center-actions"
          aria-label="Highest-priority Property Work"
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
                  className={'work-attention work-attention-' + item.attention}
                >
                  {workAttentionLabel(item.attention)}
                </span>
                <div>
                  <span className="portfolio-command-center-kind">
                    {workDomainLabel(item.kind)}
                  </span>
                  <strong>{workItemCode(item)}</strong>
                  <p>{workItemSummary(item)}</p>
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

      {propertyItems !== null && propertyItems.length > PREVIEW_LIMIT ? (
        <p className="portfolio-command-center-more">
          Showing {PREVIEW_LIMIT} of {propertyItems.length} active Work items
          for this Property.
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
