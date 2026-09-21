import { describe, expect, it } from 'vitest';
import { unitOverviewPath } from '../src/api/paths.js';
import {
  dashboardRoute,
  parseWorkspaceLocation,
  propertyRoute,
  unitRoute,
  workspaceRouteHref,
} from '../src/navigation/workspace-route.js';

const propertyId = '11111111-1111-4111-8111-111111111111';
const unitId = '22222222-2222-4222-8222-222222222222';

describe('workspace URL navigation', () => {
  it('preserves dashboard asOf through Property and Unit drill-down', () => {
    const dashboard = dashboardRoute('2025-06-30');
    const property = propertyRoute(propertyId, dashboard.asOf);
    const unit = unitRoute(property.propertyId, unitId, property.asOf);

    expect(workspaceRouteHref(dashboard)).toBe(
      '/dashboard?asOf=2025-06-30',
    );
    expect(workspaceRouteHref(property)).toBe(
      `/properties/${propertyId}?asOf=2025-06-30`,
    );
    expect(workspaceRouteHref(unit)).toBe(
      `/properties/${propertyId}/units/${unitId}?tab=overview&asOf=2025-06-30`,
    );
    expect(unitOverviewPath(unit.unitId, unit.asOf)).toBe(
      `/units/${unitId}/overview?asOf=2025-06-30`,
    );
  });

  it('restores a shareable Unit dossier route after refresh', () => {
    const restored = parseWorkspaceLocation(
      `/properties/${propertyId}/units/${unitId}`,
      '?tab=timeline&asOf=2025-06-30',
      '2026-09-21',
    );

    expect(restored).toEqual({
      kind: 'unit',
      propertyId,
      unitId,
      tab: 'timeline',
      asOf: '2025-06-30',
    });
  });

  it('keeps asOf and identity when the Unit tab changes', () => {
    const timeline = unitRoute(
      propertyId,
      unitId,
      '2025-06-30',
      'timeline',
    );
    const assets = unitRoute(
      timeline.propertyId,
      timeline.unitId,
      timeline.asOf,
      'assets',
    );

    expect(workspaceRouteHref(assets)).toBe(
      `/properties/${propertyId}/units/${unitId}?tab=assets&asOf=2025-06-30`,
    );
  });

  it('canonicalizes missing or invalid route presentation state', () => {
    expect(
      parseWorkspaceLocation(
        `/properties/${propertyId}/units/${unitId}`,
        '?tab=unknown&asOf=not-a-date',
        '2026-09-21',
      ),
    ).toEqual({
      kind: 'unit',
      propertyId,
      unitId,
      tab: 'overview',
      asOf: '2026-09-21',
    });
  });
});
