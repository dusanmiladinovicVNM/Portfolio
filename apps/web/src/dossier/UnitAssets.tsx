import {
  assetListResponseSchema,
  type AssetResponse,
} from '@portfolio/contracts';
import { useEffect, useState } from 'react';
import type { PortfolioApi } from '../api/portfolio-api.js';
import { formatDetailKey } from '../presentation/format.js';

interface UnitAssetsProps {
  readonly api: PortfolioApi;
  readonly unitId: string;
}

function AssetIdentifiers({
  identifiers,
}: {
  readonly identifiers: AssetResponse['identifiers'];
}) {
  if (identifiers.length === 0) {
    return <p className="muted asset-empty-detail">No identifiers recorded.</p>;
  }

  return (
    <dl className="identifier-list">
      {identifiers.map((identifier) => (
        <div key={identifier.id}>
          <dt>{identifier.label ?? formatDetailKey(identifier.identifierType)}</dt>
          <dd>{identifier.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function UnitAssets({ api, unitId }: UnitAssetsProps) {
  const [assets, setAssets] = useState<readonly AssetResponse[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setAssets(null);
    setError(null);

    void api
      .get(
        `/units/${encodeURIComponent(unitId)}/assets`,
        assetListResponseSchema,
        { signal: controller.signal },
      )
      .then((response) => setAssets(response.items))
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(
          cause instanceof Error ? cause.message : 'Assets could not be loaded.',
        );
      });

    return () => controller.abort();
  }, [api, unitId]);

  return (
    <section className="panel page-panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Current registry</p>
          <h2>Assets located in this Unit</h2>
        </div>
        <span className="section-note">
          Current Asset location · not an as-of projection
        </span>
      </div>

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {!error && assets === null ? (
        <p className="muted" aria-live="polite">
          Loading Assets…
        </p>
      ) : null}
      {assets?.length === 0 ? (
        <p className="muted">No Assets are currently located in this Unit.</p>
      ) : null}

      {assets && assets.length > 0 ? (
        <div className="asset-grid">
          {assets.map((asset) => (
            <article className="asset-card" key={asset.id}>
              <div className="asset-heading">
                <div>
                  <span className="eyebrow">{asset.code}</span>
                  <h3>{asset.name}</h3>
                </div>
                <span className={`status-chip status-${asset.status}`}>
                  {asset.status}
                </span>
              </div>
              <dl className="detail-list">
                <div>
                  <dt>Manufacturer</dt>
                  <dd>{asset.manufacturer ?? '—'}</dd>
                </div>
                <div>
                  <dt>Model</dt>
                  <dd>{asset.model ?? '—'}</dd>
                </div>
                <div>
                  <dt>Space</dt>
                  <dd>{asset.spaceId ?? 'Unit level'}</dd>
                </div>
                <div>
                  <dt>Version</dt>
                  <dd>{asset.version}</dd>
                </div>
              </dl>
              <AssetIdentifiers identifiers={asset.identifiers} />
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
