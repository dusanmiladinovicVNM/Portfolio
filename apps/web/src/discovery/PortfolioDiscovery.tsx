import {
  propertyListResponseSchema,
  unitListResponseSchema,
  type PropertyResponse,
  type UnitResponse,
} from '@portfolio/contracts';
import { useEffect, useMemo, useState } from 'react';
import { propertiesPath, unitsPath } from '../api/paths.js';
import type { PortfolioApi } from '../api/portfolio-api.js';
import { WorkspaceLink } from '../navigation/WorkspaceLink.js';
import {
  discoveryRoute,
  propertyRoute,
  unitRoute,
} from '../navigation/workspace-route.js';
import type { NavigateWorkspace } from '../navigation/use-workspace-navigation.js';
import { formatDetailKey, formatSwissDate } from '../presentation/format.js';

interface PortfolioDiscoveryProps {
  readonly api: PortfolioApi;
  readonly asOf: string;
  readonly navigate: NavigateWorkspace;
  readonly query: string;
}

interface DiscoveryData {
  readonly properties: readonly PropertyResponse[];
  readonly units: readonly UnitResponse[];
  readonly propertyById: ReadonlyMap<string, PropertyResponse>;
}

const PROPERTY_RESULT_LIMIT = 8;
const UNIT_RESULT_LIMIT = 12;

function normalized(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toLocaleLowerCase('de-CH');
}

function matchesTokens(
  values: readonly (string | null | undefined)[],
  tokens: readonly string[],
): boolean {
  const haystack = normalized(
    values.filter((value): value is string => Boolean(value)).join(' '),
  );
  return tokens.every((token) => haystack.includes(token));
}

function propertyAddress(property: PropertyResponse): string {
  return [
    property.street + ' ' + property.houseNumber,
    property.postalCode + ' ' + property.city,
  ].join(' · ');
}

export function PortfolioDiscovery({
  api,
  asOf,
  navigate,
  query,
}: PortfolioDiscoveryProps) {
  const [data, setData] = useState<DiscoveryData | null>(null);
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

        const propertyById = new Map(
          propertyResponse.items.map((property) => [property.id, property]),
        );
        const orphanUnit = unitResponse.items.find(
          (unit) => !propertyById.has(unit.propertyId),
        );
        if (orphanUnit) {
          throw new Error(
            'Discovery owner projection is inconsistent with current Property inventory.',
          );
        }

        setData({
          properties: propertyResponse.items,
          units: unitResponse.items,
          propertyById,
        });
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(
          cause instanceof Error
            ? cause.message
            : 'Portfolio discovery could not be loaded.',
        );
      });

    return () => controller.abort();
  }, [api, requestVersion]);

  const search = useMemo(() => {
    const normalizedQuery = normalized(query.trim());
    const tokens = normalizedQuery.split(/\s+/u).filter(Boolean);

    if (normalizedQuery.length < 2 || !data) {
      return {
        ready: normalizedQuery.length >= 2,
        properties: [] as PropertyResponse[],
        units: [] as UnitResponse[],
        propertyMatchCount: 0,
        unitMatchCount: 0,
      };
    }

    const propertyMatches = data.properties.filter((property) =>
      matchesTokens(
        [
          property.code,
          property.name,
          property.street,
          property.houseNumber,
          property.postalCode,
          property.city,
          property.countryCode,
          property.propertyType,
          property.status,
        ],
        tokens,
      ),
    );

    const unitMatches = data.units.filter((unit) => {
      const property = data.propertyById.get(unit.propertyId);
      if (!property) return false;

      return matchesTokens(
        [
          unit.code,
          unit.unitNumber,
          unit.unitType,
          unit.floor,
          unit.status,
          unit.notes,
          property.code,
          property.name,
          property.street,
          property.houseNumber,
          property.postalCode,
          property.city,
        ],
        tokens,
      );
    });

    return {
      ready: true,
      properties: propertyMatches.slice(0, PROPERTY_RESULT_LIMIT),
      units: unitMatches.slice(0, UNIT_RESULT_LIMIT),
      propertyMatchCount: propertyMatches.length,
      unitMatchCount: unitMatches.length,
    };
  }, [data, query]);

  const totalMatches = search.propertyMatchCount + search.unitMatchCount;

  return (
    <>
      <header className="workspace-header">
        <div>
          <p className="eyebrow">Portfolio discovery</p>
          <h1>Find</h1>
          <p className="header-note">
            Search current Property and Unit master data by code, name, address
            or Unit number. Opening a result preserves the workspace reporting
            context of {formatSwissDate(asOf)}.
          </p>
        </div>
      </header>

      <section
        className="panel discovery-panel"
        data-portfolio-discovery
        aria-labelledby="portfolio-discovery-title"
      >
        <div className="section-heading">
          <div>
            <p className="eyebrow">Current master data</p>
            <h2 id="portfolio-discovery-title">Property & Unit search</h2>
          </div>
          {data ? (
            <span className="section-note">
              {data.properties.length} Properties · {data.units.length} Units
            </span>
          ) : null}
        </div>

        <label className="discovery-search">
          Find Property or Unit
          <input
            aria-label="Find Property or Unit"
            autoComplete="off"
            onChange={(event) =>
              navigate(discoveryRoute(asOf, event.currentTarget.value), {
                replace: true,
              })
            }
            placeholder="Code, name, street, city, Unit number…"
            type="search"
            value={query}
          />
        </label>

        {error ? (
          <div className="portfolio-command-center-error" role="alert">
            <strong>Discovery unavailable</strong>
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
            Loading current Property and Unit inventory…
          </p>
        ) : null}

        {!error && data && !search.ready ? (
          <p className="discovery-prompt">
            Enter at least two characters. Internal IDs are not searchable or
            shown.
          </p>
        ) : null}

        {!error && data && search.ready ? (
          <div className="discovery-results" aria-live="polite">
            <div className="discovery-result-summary">
              <strong>
                {totalMatches === 0
                  ? 'No matching Property or Unit'
                  : totalMatches + (totalMatches === 1 ? ' match' : ' matches')}
              </strong>
              {totalMatches > search.properties.length + search.units.length ? (
                <span>
                  Showing the first {search.properties.length + search.units.length}.
                  Refine the search for a narrower result.
                </span>
              ) : null}
            </div>

            {search.properties.length > 0 ? (
              <section
                className="discovery-result-group"
                aria-labelledby="discovery-properties"
              >
                <h3 id="discovery-properties">Properties</h3>
                <div className="discovery-result-list">
                  {search.properties.map((property) => (
                    <article data-discovery-kind="property" key={property.id}>
                      <WorkspaceLink
                        className="discovery-result"
                        navigate={navigate}
                        route={propertyRoute(property.id, asOf)}
                      >
                        <span className="eyebrow">
                          Property · {property.code}
                        </span>
                        <strong>{property.name}</strong>
                        <span>{propertyAddress(property)}</span>
                        <small>
                          {formatDetailKey(property.propertyType)} ·{' '}
                          {formatDetailKey(property.status)}
                        </small>
                      </WorkspaceLink>
                    </article>
                  ))}
                </div>
              </section>
            ) : null}

            {search.units.length > 0 ? (
              <section
                className="discovery-result-group"
                aria-labelledby="discovery-units"
              >
                <h3 id="discovery-units">Units</h3>
                <div className="discovery-result-list">
                  {search.units.map((unit) => {
                    const property = data.propertyById.get(unit.propertyId)!;

                    return (
                      <article data-discovery-kind="unit" key={unit.id}>
                        <WorkspaceLink
                          className="discovery-result"
                          navigate={navigate}
                          route={unitRoute(
                            unit.propertyId,
                            unit.id,
                            asOf,
                            'overview',
                          )}
                        >
                          <span className="eyebrow">Unit · {unit.code}</span>
                          <strong>Unit {unit.unitNumber}</strong>
                          <span>
                            {property.code} · {property.name}
                          </span>
                          <small>
                            {formatDetailKey(unit.unitType)}
                            {unit.floor ? ' · floor ' + unit.floor : ''}
                            {' · ' + formatDetailKey(unit.status)}
                          </small>
                        </WorkspaceLink>
                      </article>
                    );
                  })}
                </div>
              </section>
            ) : null}
          </div>
        ) : null}
      </section>
    </>
  );
}
