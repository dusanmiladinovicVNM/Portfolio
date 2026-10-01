import {
  accessItemListResponseSchema,
  spaceListResponseSchema,
  type UnitReportingOverviewResponse,
} from '@portfolio/contracts';
import { useEffect, useState } from 'react';
import {
  unitAccessItemsPath,
  unitSpacesPath,
} from '../api/paths.js';
import type { PortfolioApi } from '../api/portfolio-api.js';
import { WorkspaceLink } from '../navigation/WorkspaceLink.js';
import { unitRoute, type DossierTab } from '../navigation/workspace-route.js';
import type { NavigateWorkspace } from '../navigation/use-workspace-navigation.js';
import { assertUnitAccessItemsOwner } from './access-item-owner.js';
import { assertUnitSpacesOwner } from './route-owner.js';

interface UnitSetupReadinessProps {
  readonly api: PortfolioApi;
  readonly propertyId: string;
  readonly unitId: string;
  readonly asOf: string;
  readonly overview: UnitReportingOverviewResponse;
  readonly navigate: NavigateWorkspace;
}

interface SetupStep {
  readonly tab: DossierTab;
  readonly label: string;
  readonly value: string;
  readonly detail: string;
  readonly sequence: string;
}

export function UnitSetupReadiness({
  api,
  propertyId,
  unitId,
  asOf,
  overview,
  navigate,
}: UnitSetupReadinessProps) {
  const [spaceCount, setSpaceCount] = useState<number | null>(null);
  const [activeAccessItemCount, setActiveAccessItemCount] =
    useState<number | null>(null);
  const [spaceError, setSpaceError] = useState<string | null>(null);
  const [accessItemError, setAccessItemError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setSpaceCount(null);
    setActiveAccessItemCount(null);
    setSpaceError(null);
    setAccessItemError(null);

    void api
      .get(unitSpacesPath(unitId), spaceListResponseSchema, {
        signal: controller.signal,
      })
      .then((response) => {
        if (controller.signal.aborted) return;
        assertUnitSpacesOwner(unitId, response.items);
        setSpaceCount(response.items.length);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setSpaceError(
          cause instanceof Error
            ? cause.message
            : 'Spaces inventory could not be loaded.',
        );
      });

    void api
      .get(unitAccessItemsPath(unitId), accessItemListResponseSchema, {
        signal: controller.signal,
      })
      .then((response) => {
        if (controller.signal.aborted) return;
        assertUnitAccessItemsOwner(propertyId, unitId, response.items);
        setActiveAccessItemCount(
          response.items.filter((entry) => entry.item.status === 'active')
            .length,
        );
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setAccessItemError(
          cause instanceof Error
            ? cause.message
            : 'Keys inventory could not be loaded.',
        );
      });

    return () => controller.abort();
  }, [api, propertyId, unitId]);

  const steps: readonly SetupStep[] = [
    {
      tab: 'spaces',
      label: 'Spaces',
      value: spaceCount === null ? '—' : `${spaceCount} defined`,
      detail: 'Confirm rooms and physical spaces first.',
      sequence: '1',
    },
    {
      tab: 'assets',
      label: 'Assets',
      value: `${overview.currentOperations.locatedAssetCount} located`,
      detail: 'Review equipment placement in the current Unit structure.',
      sequence: '2',
    },
    {
      tab: 'meters',
      label: 'Meters',
      value: `${overview.currentOperations.activeMeterCount} active`,
      detail: 'Review active utility meters and readings.',
      sequence: '2',
    },
    {
      tab: 'keys',
      label: 'Keys',
      value:
        activeAccessItemCount === null
          ? '—'
          : `${activeAccessItemCount} active`,
      detail: 'Review access inventory before custody handover.',
      sequence: '3',
    },
    {
      tab: 'inspections',
      label: 'Inspections',
      value: 'Open field work',
      detail: 'Use the prepared Unit structure during Inspection work.',
      sequence: '4',
    },
  ];

  const spacesMissing = spaceCount === 0;

  return (
    <section
      aria-labelledby="unit-setup-readiness-title"
      className="panel unit-setup-readiness"
      data-unit-setup-readiness
    >
      <div className="section-heading">
        <div>
          <p className="eyebrow">Setup readiness</p>
          <h2 id="unit-setup-readiness-title">Physical Unit setup</h2>
          <p className="muted">
            Current canonical inventory. The sequence is operator guidance,
            not a persisted workflow state.
          </p>
        </div>
        <span className="section-note">
          Recommended: Spaces → inventory → access → field work
        </span>
      </div>

      {spaceError ? (
        <p className="form-error" role="alert">
          Spaces inventory: {spaceError}
        </p>
      ) : null}
      {accessItemError ? (
        <p className="form-error" role="alert">
          Keys inventory: {accessItemError}
        </p>
      ) : null}

      {spacesMissing ? (
        <div className="unit-setup-readiness-callout">
          <div>
            <strong>Start with Spaces</strong>
            <span>
              Confirm the Unit structure before locating equipment, access
              items, and room-aware field work.
            </span>
          </div>
          <WorkspaceLink
            className="button-secondary"
            navigate={navigate}
            route={unitRoute(propertyId, unitId, asOf, 'spaces')}
          >
            Open Spaces
          </WorkspaceLink>
        </div>
      ) : null}

      <div
        aria-label="Recommended Unit setup sequence"
        className="unit-setup-readiness-grid"
      >
        {steps.map((step) => (
          <WorkspaceLink
            className="unit-setup-readiness-step"
            key={step.tab}
            navigate={navigate}
            route={unitRoute(propertyId, unitId, asOf, step.tab)}
          >
            <span data-setup-tab={step.tab}>
              Step {step.sequence} · {step.label}
            </span>
            <strong>{step.value}</strong>
            <small>{step.detail}</small>
          </WorkspaceLink>
        ))}
      </div>
    </section>
  );
}
