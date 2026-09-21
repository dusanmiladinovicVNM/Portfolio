import {
  unitTimelineResponseSchema,
  type UnitTimelineEventResponse,
  type UnitTimelineResponse,
} from '@portfolio/contracts';
import { useEffect, useState } from 'react';
import type { PortfolioApi } from '../api/portfolio-api.js';
import {
  formatDetailKey,
  formatTimelineEventType,
  formatTimelineOccurrence,
  formatTimelineValue,
} from '../presentation/format.js';

const PAGE_SIZE = 50;

interface UnitTimelineProps {
  readonly api: PortfolioApi;
  readonly unitId: string;
}

function EventDetails({
  details,
}: {
  readonly details: UnitTimelineEventResponse['details'];
}) {
  const entries = Object.entries(details).sort(([left], [right]) =>
    left.localeCompare(right),
  );
  if (entries.length === 0) return null;

  return (
    <dl className="timeline-details">
      {entries.map(([key, value]) => (
        <div key={key}>
          <dt>{formatDetailKey(key)}</dt>
          <dd>{formatTimelineValue(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

export function UnitTimeline({ api, unitId }: UnitTimelineProps) {
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState<UnitTimelineResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setPage(null);
    setError(null);

    void api
      .get(
        `/units/${encodeURIComponent(unitId)}/timeline?limit=${PAGE_SIZE}&offset=${offset}`,
        unitTimelineResponseSchema,
        { signal: controller.signal },
      )
      .then(setPage)
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(
          cause instanceof Error ? cause.message : 'Timeline could not be loaded.',
        );
      });

    return () => controller.abort();
  }, [api, offset, unitId]);

  return (
    <section className="panel page-panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Business events</p>
          <h2>Unit timeline</h2>
        </div>
        <span className="section-note">
          Date-only events stay date-only; instant events are displayed in UTC
        </span>
      </div>

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {!error && page === null ? (
        <p className="muted" aria-live="polite">
          Loading timeline…
        </p>
      ) : null}
      {page?.items.length === 0 ? (
        <p className="muted">
          {offset === 0
            ? 'No Unit timeline events.'
            : 'No more timeline events on this page.'}
        </p>
      ) : null}

      {page && page.items.length > 0 ? (
        <ol className="timeline-list">
          {page.items.map((event) => (
            <li className="timeline-event" key={event.eventKey}>
              <div className="timeline-marker" aria-hidden="true" />
              <article>
                <div className="timeline-meta">
                  <span className="timeline-category">{event.category}</span>
                  <time
                    dateTime={
                      event.precision === 'instant' && event.occurredAt
                        ? event.occurredAt
                        : event.occurredOn
                    }
                  >
                    {formatTimelineOccurrence(event)}
                  </time>
                </div>
                <h3>{formatTimelineEventType(event.eventType)}</h3>
                <p className="timeline-source">
                  {event.sourceType} · {event.sourceId}
                </p>
                <EventDetails details={event.details} />
              </article>
            </li>
          ))}
        </ol>
      ) : null}

      {page ? (
        <div className="pagination">
          <button
            className="button-secondary"
            disabled={offset === 0}
            onClick={() => setOffset((value) => Math.max(0, value - PAGE_SIZE))}
            type="button"
          >
            Previous
          </button>
          <span>
            {page.items.length === 0
              ? `After event ${offset}`
              : `Events ${offset + 1}–${offset + page.items.length}`}
          </span>
          <button
            className="button-secondary"
            disabled={page.items.length < PAGE_SIZE}
            onClick={() => setOffset((value) => value + PAGE_SIZE)}
            type="button"
          >
            Next
          </button>
        </div>
      ) : null}
    </section>
  );
}
