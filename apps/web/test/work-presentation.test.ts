import { describe, expect, it } from 'vitest';
import type { OperationalWorkItemResponse } from '@portfolio/contracts';
import {
  parseWorkspaceLocation,
  workspaceRouteHref,
} from '../src/navigation/workspace-route.js';
import { workItemHeadline, workItemRoute } from '../src/work/work-presentation.js';

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


describe('YEPP Work task titles retain their canonical domain meaning', () => {
  it('uses the service plan title instead of inventing a Work lifecycle', () => {
    expect(workItemHeadline(serviceItem(null))).toBe('Quarterly service');
  });

  it('uses the real Inspection type and Maintenance issue title', () => {
    const inspection: Extract<OperationalWorkItemResponse, { kind: 'inspection' }> = {
      kind: 'inspection',
      attention: 'overdue',
      propertyId,
      propertyCode: 'PROP-1',
      propertyName: 'Property 1',
      unitId,
      unitCode: 'UNIT-1',
      unitNumber: '1A',
      inspectionId: '55555555-5555-4555-8555-555555555555',
      inspectionCode: 'INS-1',
      inspectionType: 'move_in',
      inspectionStatus: 'draft',
      scheduledFor: '2026-10-01',
      assignedToUserId: '66666666-6666-4666-8666-666666666666',
      assignedToDisplayName: 'Inspector',
      assignedToRole: 'inspector',
    };
    expect(workItemHeadline(inspection)).toMatch(/Move In inspection/i);
    const maintenance: Extract<OperationalWorkItemResponse, { kind: 'maintenance' }> = {
      kind: 'maintenance',
      attention: 'urgent',
      propertyId,
      propertyCode: 'PROP-1',
      propertyName: 'Property 1',
      unitId: null,
      unitCode: null,
      unitNumber: null,
      issueId: '77777777-7777-4777-8777-777777777777',
      issueCode: 'ISS-1',
      title: 'Roof inspection follow-up',
      priority: 'urgent',
      reportedAt: '2026-10-02T10:00:00.000Z',
      activeWorkOrderCount: 0,
    };
    expect(workItemHeadline(maintenance)).toBe('Roof inspection follow-up');
  });
});
