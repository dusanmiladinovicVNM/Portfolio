import {
  spaceListResponseSchema,
  type SpaceResponse,
} from '@portfolio/contracts';
import { useEffect, useState } from 'react';
import { unitSpacesPath } from '../api/paths.js';
import type { PortfolioApi } from '../api/portfolio-api.js';

interface UnitSpacesProps {
  readonly api: PortfolioApi;
  readonly unitId: string;
}

function label(value: string): string {
  return value.replaceAll('_', ' ');
}

export function UnitSpaces({ api, unitId }: UnitSpacesProps) {
  const [spaces, setSpaces] = useState<readonly SpaceResponse[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setSpaces(null);
    setError(null);

    void api
      .get(unitSpacesPath(unitId), spaceListResponseSchema, {
        signal: controller.signal,
      })
      .then((response) =>
        setSpaces(
          [...response.items].sort(
            (left, right) =>
              left.sortOrder - right.sortOrder ||
              left.name.localeCompare(right.name),
          ),
        ),
      )
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(
          cause instanceof Error ? cause.message : 'Spaces could not be loaded.',
        );
      });

    return () => controller.abort();
  }, [api, unitId]);

  return (
    <div className="dashboard-stack">
      <section className="panel">
        <p className="eyebrow">Core setup</p>
        <h2>Space creation</h2>
        <p className="muted">
          Room, storage and parking creation is added in the next commit on
          this Draft PR.
        </p>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Structure</p>
            <h2>Spaces</h2>
          </div>
          <span className="section-note">
            {spaces === null ? 'Loading…' : String(spaces.length) + ' records'}
          </span>
        </div>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        {!error && spaces === null ? (
          <p className="muted" aria-live="polite">Loading Spaces…</p>
        ) : null}
        {spaces?.length === 0 ? (
          <p className="muted">No Spaces defined for this Unit.</p>
        ) : null}
        {spaces && spaces.length > 0 ? (
          <div className="space-grid">
            {spaces.map((space) => (
              <article className="space-card" key={space.id}>
                <div className="space-card-header">
                  <div>
                    <span className="eyebrow">{space.code}</span>
                    <h3>{space.name}</h3>
                  </div>
                  <span className="status-chip">
                    {space.active ? 'active' : 'inactive'}
                  </span>
                </div>
                <div className="space-meta">
                  <span>{label(space.spaceType)}</span>
                  <span>
                    {space.areaM2 === null ? 'area —' : String(space.areaM2) + ' m²'}
                  </span>
                  <span>order {space.sortOrder}</span>
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}
