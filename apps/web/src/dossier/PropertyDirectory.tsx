import {
  propertyListResponseSchema,
  unitListResponseSchema,
  type PropertyResponse,
} from '@portfolio/contracts';
import { useEffect, useMemo, useState } from 'react';
import { propertiesPath, unitsPath } from '../api/paths.js';
import type { PortfolioApi } from '../api/portfolio-api.js';
import { WorkspaceLink } from '../navigation/WorkspaceLink.js';
import { propertyRoute } from '../navigation/workspace-route.js';
import type { NavigateWorkspace } from '../navigation/use-workspace-navigation.js';
import { formatDetailKey, formatSwissDate } from '../presentation/format.js';

interface PropertyDirectoryProps {
  readonly api: PortfolioApi;
  readonly asOf: string;
  readonly navigate: NavigateWorkspace;
}

interface PropertyDirectoryData {
  readonly properties: readonly PropertyResponse[];
  readonly unitCountByProperty: ReadonlyMap<string, number>;
}

function propertyAddress(property: PropertyResponse): string {
  return [
    property.street + ' ' + property.houseNumber,
    property.postalCode + ' ' + property.city,
  ].join(' · ');
}

export function PropertyDirectory({
  api,
  asOf,
  navigate,
}: PropertyDirectoryProps) {
  const [data, setData] = useState<PropertyDirectoryData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [requestVersion, setRequestVersion] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setError(null);

    void Promise.all([
      api.get(propertiesPath(), propertyListResponseSchema, {
        signal: controller.signal,
      }),
      api.get(unitsPath(), unitListResponseSchema, {
        signal: controller.signal,
      }),
    ])
      .then(([propertyResponse, unitResponse]) => {
        if (controller.signal.aborted) return;

        const propertyIds = new Set(
          propertyResponse.items.map((property) => property.id),
        );
        const orphanUnit = unitResponse.items.find(
          (unit) => !propertyIds.has(unit.propertyId),
        );
        if (orphanUnit) {
          throw new Error(
            'Property directory inventory is inconsistent with Unit ownership.',
          );
        }

        const unitCountByProperty = new Map<string, number>();
        for (const unit of unitResponse.items) {
          unitCountByProperty.set(
            unit.propertyId,
            (unitCountByProperty.get(unit.propertyId) ?? 0) + 1,
          );
        }

        setData({
          properties: propertyResponse.items,
          unitCountByProperty,
        });
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(
          cause instanceof Error
            ? cause.message
            : 'Property directory could not be loaded.',
        );
      });

    return () => controller.abort();
  }, [api, requestVersion]);

  const properties = useMemo(
    () =>
      data
        ? [...data.properties].sort((left, right) =>
            left.code.localeCompare(right.code, 'de-CH', {
              sensitivity: 'base',
              numeric: true,
            }),
          )
        : [],
    [data],
  );

  return (
    <>
      <header className="workspace-header">
        <div>
          <p className="eyebrow">Portfolio inventory</p>
          <h1>Properties</h1>
          <p className="header-note">
            Current Property and Unit master inventory. Opening a Property keeps
            the workspace reporting context of {formatSwissDate(asOf)}.
          </p>
        </div>
      </header>

      <section
        aria-labelledby="property-directory-title"
        className="panel property-directory"
        data-property-directory
      >
        <div className="section-heading">
          <div>
            <p className="eyebrow">Current master data</p>
            <h2 id="property-directory-title">Property directory</h2>
          </div>
          <span className="section-note">
            {data ? data.properties.length + ' Properties' : 'Loading…'}
          </span>
        </div>

        {error ? (
          <div className="portfolio-command-center-error" role="alert">
            <strong>Property directory unavailable</strong>
            <span>{error}</span>
            <button
              className="button-secondary inline-button"
              onClick={() => setRequestVersion((value) => value + 1)}
              type="button"
            >
              Retry
            </button>
          </div>
        ) : null}

        {!error && data === null ? (
          <p className="muted" aria-live="polite">
            Loading current Property inventory…
          </p>
        ) : null}

        {data && properties.length === 0 ? (
          <p className="muted">No Properties in the current inventory.</p>
        ) : null}

        {data && properties.length > 0 ? (
          <div className="property-directory-grid">
            {properties.map((property) => (
              <WorkspaceLink
                className="property-directory-card"
                key={property.id}
                navigate={navigate}
                route={propertyRoute(property.id, asOf)}
              >
                <span className="eyebrow">{property.code}</span>
                <strong>{property.name}</strong>
                <span>{propertyAddress(property)}</span>
                <dl>
                  <div>
                    <dt>Type</dt>
                    <dd>{formatDetailKey(property.propertyType)}</dd>
                  </div>
                  <div>
                    <dt>Status</dt>
                    <dd>{formatDetailKey(property.status)}</dd>
                  </div>
                  <div>
                    <dt>Units</dt>
                    <dd>{data.unitCountByProperty.get(property.id) ?? 0}</dd>
                  </div>
                </dl>
                <span className="open-label">Open Property →</span>
              </WorkspaceLink>
            ))}
          </div>
        ) : null}
      </section>
    </>
  );
}
