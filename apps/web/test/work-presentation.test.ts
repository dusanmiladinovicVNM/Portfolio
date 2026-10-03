import { describe, expect, it } from 'vitest';
import type { OperationalWorkItemResponse } from '@portfolio/contracts';
import {
  parseWorkspaceLocation,
  workspaceRouteHref,
} from '../src/navigation/workspace-route.js';
import { workItemRoute } from '../src/work/work-presentation.js';

const propertyId = '11111111-1111-4111-8111-111111111111';
const unitId = '22222222-2222-4222-8222-222222222222';
const assetId = '33333333-3333-4333-8333-333333333333';
const servicePlanId = '44444444-4444-4444-8444-444444444444';
const asOf = '2026-10-03';

function serviceItem(
  unit: { readonly id: string; readonly code: string; readonly number: string } | null,
): Extract<OperationalWorkItemResponse, { kind: 'service' }> {
  return {
    kind: 'service',
    attention: 'upcoming',
    servicePlanId,
    assetId,
    assetCode: 'AST-SVC-1',
    assetName: 'Service asset',
    planName: 'Quarterly service',
    scheduleKind: 'recurring',
    firstDueOn: '2026-10-01',
    intervalMonths: 3,
    dueOn: '2027-01-01',
    propertyId,
    propertyCode: 'PROP-1',
    propertyName: 'Property 1',
    unitId: unit?.id ?? null,
    unitCode: unit?.code ?? null,
    unitNumber: unit?.number ?? null,
  };
}

describe('Service Work routing', () => {
  it('deep-links Property-level Service to the exact Asset and ServicePlan', () => {
    const route = workItemRoute(serviceItem(null), asOf);

    expect(route).toEqual({
      kind: 'property',
      propertyId,
      asOf,
      assetId,
      servicePlanId,
    });
    expect(workspaceRouteHref(route)).toBe(
      `/properties/${propertyId}?assetId=${assetId}&servicePlanId=${servicePlanId}&asOf=${asOf}`,
    );
    expect(
      parseWorkspaceLocation(
        `/properties/${propertyId}`,
        `?assetId=${assetId}&servicePlanId=${servicePlanId}&asOf=${asOf}`,
      ),
    ).toEqual(route);
  });

  it('deep-links Unit-level Service to the exact Asset and ServicePlan', () => {
    const route = workItemRoute(
      serviceItem({ id: unitId, code: 'UNIT-1', number: '1A' }),
      asOf,
    );

    expect(route).toEqual({
      kind: 'unit',
      propertyId,
      unitId,
      tab: 'assets',
      asOf,
      assetId,
      servicePlanId,
    });
    expect(workspaceRouteHref(route)).toBe(
      `/properties/${propertyId}/units/${unitId}?tab=assets&assetId=${assetId}&servicePlanId=${servicePlanId}&asOf=${asOf}`,
    );
    expect(
      parseWorkspaceLocation(
        `/properties/${propertyId}/units/${unitId}`,
        `?tab=assets&assetId=${assetId}&servicePlanId=${servicePlanId}&asOf=${asOf}`,
      ),
    ).toEqual(route);
  });

  it('drops ServicePlan identity when no Asset owns the selection', () => {
    expect(
      parseWorkspaceLocation(
        `/properties/${propertyId}`,
        `?servicePlanId=${servicePlanId}&asOf=${asOf}`,
      ),
    ).toEqual({
      kind: 'property',
      propertyId,
      asOf,
    });

    expect(
      parseWorkspaceLocation(
        `/properties/${propertyId}/units/${unitId}`,
        `?tab=assets&servicePlanId=${servicePlanId}&asOf=${asOf}`,
      ),
    ).toEqual({
      kind: 'unit',
      propertyId,
      unitId,
      tab: 'assets',
      asOf,
    });
  });
});
