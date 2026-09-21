import {
  unitListResponseSchema,
  type PortfolioDashboardResponse,
  type UnitResponse,
} from '@portfolio/contracts';
import { useEffect, useState } from 'react';
import type { PortfolioApi } from '../api/portfolio-api.js';

type PropertySummary = PortfolioDashboardResponse['properties'][number];

interface PropertyUnitsProps {
  readonly api: PortfolioApi;
  readonly property: PropertySummary;
  readonly onBack: () => void;
  readonly onSelectUnit: (unit: UnitResponse) => void;
}

export function PropertyUnits({
  api,
  property,
  onBack,
  onSelectUnit,
}: PropertyUnitsProps) {
  const [units, setUnits] = useState<readonly UnitResponse[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setUnits(null);
    setError(null);

    void api
      .get(
        `/properties/${encodeURIComponent(property.propertyId)}/units`,
        unitListResponseSchema,
        { signal: controller.signal },
      )
      .then((response) => setUnits(response.items))
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(
          cause instanceof Error ? cause.message : 'Units could not be loaded.',
        );
      });

    return () => controller.abort();
  }, [api, property.propertyId]);

  return (
    <>
      <header className="workspace-header">
        <div>
          <button className="back-link" onClick={onBack} type="button">
            ← Portfolio
          </button>
          <p className="eyebrow">Property · {property.propertyCode}</p>
          <h1>{property.propertyName}</h1>
          <p className="header-note">
            Current Unit inventory. Occupancy figures on the previous screen are
            reporting projections for the selected business date.
          </p>
        </div>
      </header>

      <section className="panel page-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Inventory</p>
            <h2>Units</h2>
          </div>
          <span className="section-note">
            {units ? `${units.length} current Unit records` : 'Loading…'}
          </span>
        </div>

        {error ? <p className="form-error" role="alert">{error}</p> : null}
        {!error && units === null ? <p className="muted">Loading Units…</p> : null}
        {units?.length === 0 ? <p className="muted">No Units for this Property.</p> : null}

        {units && units.length > 0 ? (
          <div className="unit-grid">
            {units.map((unit) => (
              <button
                className="unit-card"
                key={unit.id}
                onClick={() => onSelectUnit(unit)}
                type="button"
              >
                <div>
                  <span className="eyebrow">{unit.code}</span>
                  <strong>Unit {unit.unitNumber}</strong>
                </div>
                <dl>
                  <div><dt>Type</dt><dd>{unit.unitType}</dd></div>
                  <div><dt>Floor</dt><dd>{unit.floor ?? '—'}</dd></div>
                  <div><dt>Area</dt><dd>{unit.areaM2 === null ? '—' : `${unit.areaM2} m²`}</dd></div>
                  <div><dt>Status</dt><dd>{unit.status}</dd></div>
                </dl>
                <span className="open-label">Open dossier →</span>
              </button>
            ))}
          </div>
        ) : null}
      </section>
    </>
  );
}
