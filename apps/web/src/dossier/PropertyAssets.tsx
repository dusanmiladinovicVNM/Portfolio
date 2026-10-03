import {
  assetListResponseSchema,
  type AssetResponse,
} from '@portfolio/contracts';
import { useEffect, useMemo, useState } from 'react';
import { propertyAssetsPath } from '../api/paths.js';
import type { PortfolioApi } from '../api/portfolio-api.js';
import { useCreateSubmissionGuard } from '../admin/use-create-submission-guard.js';
import { WorkspaceLink } from '../navigation/WorkspaceLink.js';
import { propertyRoute } from '../navigation/workspace-route.js';
import type {
  NavigateWorkspace,
  SetNavigationBlocker,
} from '../navigation/use-workspace-navigation.js';
import { AssetServiceAdministration } from './AssetServiceAdministration.js';
import { assertPropertyAssetsOwner } from './asset-owner.js';

interface PropertyAssetsProps {
  readonly api: PortfolioApi;
  readonly propertyId: string;
  readonly asOf: string;
  readonly assetId?: string | undefined;
  readonly servicePlanId?: string | undefined;
  readonly navigate: NavigateWorkspace;
  readonly setNavigationBlocker: SetNavigationBlocker;
}

export function PropertyAssets({
  api,
  propertyId,
  asOf,
  assetId,
  servicePlanId,
  navigate,
  setNavigationBlocker,
}: PropertyAssetsProps) {
  const [assets, setAssets] = useState<readonly AssetResponse[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [writePending, setWritePending] = useState(false);
  const submission = useCreateSubmissionGuard();

  useEffect(
    () => () => setNavigationBlocker(null),
    [setNavigationBlocker],
  );

  useEffect(() => {
    const controller = new AbortController();
    setAssets(null);
    setError(null);

    void api
      .get(
        propertyAssetsPath(propertyId),
        assetListResponseSchema,
        { signal: controller.signal },
      )
      .then((response) => {
        if (controller.signal.aborted) return;
        assertPropertyAssetsOwner(propertyId, response.items);
        setAssets(response.items);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(
          cause instanceof Error
            ? cause.message
            : 'Property Assets could not be loaded.',
        );
      });

    return () => controller.abort();
  }, [api, propertyId]);

  const directAssets = useMemo(
    () => assets?.filter((asset) => asset.unitId === null) ?? null,
    [assets],
  );

  const selectedAsset = useMemo(
    () =>
      assetId === undefined
        ? null
        : directAssets?.find((asset) => asset.id === assetId) ?? null,
    [assetId, directAssets],
  );

  const selectionInvalid =
    directAssets !== null &&
    assetId !== undefined &&
    selectedAsset === null;

  const writeGate = {
    pending: writePending,
    tryStart: () => {
      if (!submission.tryStart()) return false;
      setNavigationBlocker(() => false);
      setWritePending(true);
      return true;
    },
    finish: () => {
      submission.finish();
      setNavigationBlocker(null);
      if (submission.isMounted()) setWritePending(false);
    },
  };

  const register = (
    <section
      className="panel page-panel"
      data-property-assets
      data-property-section="assets"
    >
      <div className="section-heading">
        <div>
          <p className="eyebrow">Building equipment</p>
          <h2>Property Assets</h2>
          <p className="muted">
            Direct Property-level equipment only. Unit-located Assets stay in
            their Unit dossier.
          </p>
        </div>
        <span className="section-note">
          {directAssets === null
            ? 'Loading…'
            : `${directAssets.length} direct Property Assets`}
        </span>
      </div>

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {!error && directAssets === null ? (
        <p className="muted" aria-live="polite">
          Loading Property Assets…
        </p>
      ) : null}
      {directAssets?.length === 0 ? (
        <p className="muted">
          No Assets are currently located directly at Property level.
        </p>
      ) : null}

      {directAssets && directAssets.length > 0 ? (
        <div className="asset-grid">
          {directAssets.map((asset) => (
            <WorkspaceLink
              ariaCurrent={asset.id === assetId ? 'page' : undefined}
              className={
                'asset-card asset-card-link ' +
                (asset.id === assetId ? 'asset-card-active' : '')
              }
              key={asset.id}
              navigate={navigate}
              route={propertyRoute(propertyId, asOf, {
                assetId: asset.id,
              })}
            >
              <div className="asset-heading">
                <div>
                  <span className="eyebrow">{asset.code}</span>
                  <h3>{asset.name}</h3>
                </div>
                <span className={'status-chip status-' + asset.status}>
                  {asset.status}
                </span>
              </div>
              <dl className="detail-list">
                <div>
                  <dt>Placement</dt>
                  <dd>Property level</dd>
                </div>
                <div>
                  <dt>Manufacturer</dt>
                  <dd>{asset.manufacturer ?? '—'}</dd>
                </div>
                <div>
                  <dt>Model</dt>
                  <dd>{asset.model ?? '—'}</dd>
                </div>
                <div>
                  <dt>Version</dt>
                  <dd>{asset.version}</dd>
                </div>
              </dl>
              <span className="open-label">Open service record →</span>
            </WorkspaceLink>
          ))}
        </div>
      ) : null}

      {selectionInvalid ? (
        <p className="form-error" role="alert">
          The selected Asset is not currently located directly at this Property.
        </p>
      ) : null}
    </section>
  );

  const detail = selectedAsset ? (
    <section
      className="panel asset-admin-panel"
      data-property-asset-service
    >
      <div className="section-heading">
        <div>
          <p className="eyebrow">Selected Property Asset</p>
          <h2>{selectedAsset.code} · {selectedAsset.name}</h2>
          <p className="muted">
            Warranty and Service stay attached to this exact physical Asset
            identity.
          </p>
        </div>
        <span className={'status-chip status-' + selectedAsset.status}>
          {selectedAsset.status}
        </span>
      </div>

      <AssetServiceAdministration
        api={api}
        assetId={selectedAsset.id}
        assetStatus={selectedAsset.status}
        selectedServicePlanId={servicePlanId}
        writeGate={writeGate}
      />
    </section>
  ) : null;

  return assetId !== undefined ? (
    <>
      {detail}
      {register}
    </>
  ) : register;
}
