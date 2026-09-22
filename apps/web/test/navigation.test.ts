import { describe, expect, it } from 'vitest';
import { unitOverviewPath } from '../src/api/paths.js';
import {
  dashboardRoute,
  partiesRoute,
  parseWorkspaceLocation,
  isWorkspaceAsOf,
  propertyRoute,
  unitRoute,
  workspaceRouteHref,
  workspaceRouteOwnerKey,
} from '../src/navigation/workspace-route.js';

const propertyId = '11111111-1111-4111-8111-111111111111';
const unitId = '22222222-2222-4222-8222-222222222222';
const tenancyId = '33333333-3333-4333-8333-333333333333';
const agreementId = '44444444-4444-4444-8444-444444444444';
const amendmentId = '55555555-5555-4555-8555-555555555555';
const inspectionId = '66666666-6666-4666-8666-666666666666';
const inspectionSectionId = '77777777-7777-4777-8777-777777777777';
const assetId = '88888888-8888-4888-8888-888888888888';
const meterId = '99999999-9999-4999-8999-999999999999';

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

  it('deep-links selected Tenancy, Agreement and Amendment without losing asOf', () => {
    const route = unitRoute(
      propertyId,
      unitId,
      '2025-06-30',
      'contracts',
      { tenancyId, agreementId, amendmentId },
    );

    expect(workspaceRouteHref(route)).toBe(
      `/properties/${propertyId}/units/${unitId}?tab=contracts&tenancyId=${tenancyId}&agreementId=${agreementId}&amendmentId=${amendmentId}&asOf=2025-06-30`,
    );

    expect(
      parseWorkspaceLocation(
        `/properties/${propertyId}/units/${unitId}`,
        `?tab=contracts&tenancyId=${tenancyId}&agreementId=${agreementId}&amendmentId=${amendmentId}&asOf=2025-06-30`,
        '2026-09-21',
      ),
    ).toEqual({
      kind: 'unit',
      propertyId,
      unitId,
      tab: 'contracts',
      tenancyId,
      agreementId,
      amendmentId,
      asOf: '2025-06-30',
    });
  });

  it('drops contract-only identities when navigating to another dossier tab', () => {
    const contracts = unitRoute(
      propertyId,
      unitId,
      '2025-06-30',
      'contracts',
      { tenancyId, agreementId, amendmentId },
    );
    const timeline = unitRoute(
      contracts.propertyId,
      contracts.unitId,
      contracts.asOf,
      'timeline',
    );

    expect(workspaceRouteHref(timeline)).toBe(
      `/properties/${propertyId}/units/${unitId}?tab=timeline&asOf=2025-06-30`,
    );
  });


  it('rejects an empty business date before route construction', () => {
    expect(isWorkspaceAsOf('2025-06-30')).toBe(true);
    expect(isWorkspaceAsOf('')).toBe(false);
    expect(() => dashboardRoute('')).toThrow(
      'Workspace asOf must be a valid DateOnly value.',
    );
  });


  it('deep-links one Inspection only inside the Inspections dossier tab', () => {
    const selected = unitRoute(
      propertyId,
      unitId,
      '2025-06-30',
      'inspections',
      { inspectionId, inspectionSectionId },
    );

    expect(workspaceRouteHref(selected)).toBe(
      `/properties/${propertyId}/units/${unitId}?tab=inspections&inspectionId=${inspectionId}&sectionId=${inspectionSectionId}&asOf=2025-06-30`,
    );

    expect(
      parseWorkspaceLocation(
        `/properties/${propertyId}/units/${unitId}`,
        `?tab=inspections&inspectionId=${inspectionId}&sectionId=${inspectionSectionId}&asOf=2025-06-30`,
        '2026-09-21',
      ),
    ).toEqual({
      kind: 'unit',
      propertyId,
      unitId,
      tab: 'inspections',
      inspectionId,
      inspectionSectionId,
      asOf: '2025-06-30',
    });

    expect(
      workspaceRouteHref(
        unitRoute(
          propertyId,
          unitId,
          '2025-06-30',
          'overview',
          { inspectionId },
        ),
      ),
    ).toBe(
      `/properties/${propertyId}/units/${unitId}?tab=overview&asOf=2025-06-30`,
    );
  });


  it('round-trips the global Parties route with the reporting context', () => {
    const route = partiesRoute('2025-06-30');
    expect(workspaceRouteHref(route)).toBe('/parties?asOf=2025-06-30');
    expect(
      parseWorkspaceLocation(
        '/parties',
        '?asOf=2025-06-30',
        '2026-09-21',
      ),
    ).toEqual({
      kind: 'parties',
      asOf: '2025-06-30',
    });
  });

  it('deep-links one Asset only inside the Assets dossier tab', () => {
    const selected = unitRoute(
      propertyId,
      unitId,
      '2025-06-30',
      'assets',
      { assetId },
    );

    expect(workspaceRouteHref(selected)).toBe(
      `/properties/${propertyId}/units/${unitId}?tab=assets&assetId=${assetId}&asOf=2025-06-30`,
    );

    expect(
      parseWorkspaceLocation(
        `/properties/${propertyId}/units/${unitId}`,
        `?tab=assets&assetId=${assetId}&asOf=2025-06-30`,
        '2026-09-21',
      ),
    ).toEqual({
      kind: 'unit',
      propertyId,
      unitId,
      tab: 'assets',
      assetId,
      asOf: '2025-06-30',
    });

    expect(
      workspaceRouteHref(
        unitRoute(
          propertyId,
          unitId,
          '2025-06-30',
          'overview',
          { assetId },
        ),
      ),
    ).toBe(
      `/properties/${propertyId}/units/${unitId}?tab=overview&asOf=2025-06-30`,
    );
  });

  it('deep-links one Meter only inside the Meters dossier tab', () => {
    const selected = unitRoute(
      propertyId,
      unitId,
      '2025-06-30',
      'meters',
      { meterId },
    );

    expect(workspaceRouteHref(selected)).toBe(
      `/properties/${propertyId}/units/${unitId}?tab=meters&meterId=${meterId}&asOf=2025-06-30`,
    );

    expect(
      parseWorkspaceLocation(
        `/properties/${propertyId}/units/${unitId}`,
        `?tab=meters&meterId=${meterId}&asOf=2025-06-30`,
        '2026-09-21',
      ),
    ).toEqual({
      kind: 'unit',
      propertyId,
      unitId,
      tab: 'meters',
      meterId,
      asOf: '2025-06-30',
    });

    expect(
      workspaceRouteHref(
        unitRoute(
          propertyId,
          unitId,
          '2025-06-30',
          'overview',
          { meterId },
        ),
      ),
    ).toBe(
      `/properties/${propertyId}/units/${unitId}?tab=overview&asOf=2025-06-30`,
    );
  });

  it('round-trips the Unit Spaces setup tab', () => {
    const route = unitRoute(
      propertyId,
      unitId,
      '2025-06-30',
      'spaces',
    );
    expect(workspaceRouteHref(route)).toBe(
      '/properties/' + propertyId +
        '/units/' + unitId +
        '?tab=spaces&asOf=2025-06-30',
    );
    expect(
      parseWorkspaceLocation(
        '/properties/' + propertyId + '/units/' + unitId,
        '?tab=spaces&asOf=2025-06-30',
        '2026-09-21',
      ),
    ).toEqual({
      kind: 'unit',
      propertyId,
      unitId,
      tab: 'spaces',
      asOf: '2025-06-30',
    });
  });


  it('changes the React owner key when Property or Unit business ownership changes', () => {
    const propertyA = propertyRoute(
      propertyId,
      '2025-06-30',
    );
    const propertyB = propertyRoute(
      agreementId,
      '2025-06-30',
    );
    expect(workspaceRouteOwnerKey(propertyA)).not.toBe(
      workspaceRouteOwnerKey(propertyB),
    );

    const unitAOverview = unitRoute(
      propertyId,
      unitId,
      '2025-06-30',
      'overview',
    );
    const unitASpaces = unitRoute(
      propertyId,
      unitId,
      '2025-06-30',
      'spaces',
    );
    const unitBSpaces = unitRoute(
      propertyId,
      agreementId,
      '2025-06-30',
      'spaces',
    );

    expect(workspaceRouteOwnerKey(unitAOverview)).toBe(
      workspaceRouteOwnerKey(unitASpaces),
    );
    expect(workspaceRouteOwnerKey(unitASpaces)).not.toBe(
      workspaceRouteOwnerKey(unitBSpaces),
    );
  });

});
