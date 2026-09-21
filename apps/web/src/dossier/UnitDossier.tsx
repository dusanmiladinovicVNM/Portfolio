import type { UnitResponse } from '@portfolio/contracts';
import { useState } from 'react';
import type { PortfolioApi } from '../api/portfolio-api.js';
import { UnitAssets } from './UnitAssets.js';
import { UnitOverview } from './UnitOverview.js';
import { UnitTimeline } from './UnitTimeline.js';

type DossierTab = 'overview' | 'timeline' | 'assets';

interface UnitDossierProps {
  readonly api: PortfolioApi;
  readonly unit: UnitResponse;
  readonly onBack: () => void;
}

export function UnitDossier({ api, unit, onBack }: UnitDossierProps) {
  const [tab, setTab] = useState<DossierTab>('overview');

  return (
    <>
      <header className="workspace-header">
        <div>
          <button className="back-link" onClick={onBack} type="button">
            ← Property Units
          </button>
          <p className="eyebrow">Unit dossier · {unit.code}</p>
          <h1>Unit {unit.unitNumber}</h1>
          <p className="header-note">
            {unit.unitType} · floor {unit.floor ?? '—'} · current lifecycle status{' '}
            {unit.status}
          </p>
        </div>
      </header>

      <nav className="dossier-tabs" aria-label="Unit dossier sections">
        <button
          aria-current={tab === 'overview' ? 'page' : undefined}
          className={`dossier-tab ${tab === 'overview' ? 'dossier-tab-active' : ''}`}
          onClick={() => setTab('overview')}
          type="button"
        >
          Overview
        </button>
        <button
          aria-current={tab === 'timeline' ? 'page' : undefined}
          className={`dossier-tab ${tab === 'timeline' ? 'dossier-tab-active' : ''}`}
          onClick={() => setTab('timeline')}
          type="button"
        >
          Timeline
        </button>
        <button
          className="dossier-tab dossier-tab-disabled"
          disabled
          title="Requires a Unit-scoped document read endpoint."
          type="button"
        >
          Documents
        </button>
        <button
          aria-current={tab === 'assets' ? 'page' : undefined}
          className={`dossier-tab ${tab === 'assets' ? 'dossier-tab-active' : ''}`}
          onClick={() => setTab('assets')}
          type="button"
        >
          Assets
        </button>
      </nav>

      {tab === 'overview' ? <UnitOverview api={api} unit={unit} /> : null}
      {tab === 'timeline' ? <UnitTimeline api={api} unitId={unit.id} /> : null}
      {tab === 'assets' ? <UnitAssets api={api} unitId={unit.id} /> : null}
    </>
  );
}
