import { describe, expect, it } from 'vitest';
import type {
  InspectionBundleResponse,
  MaintenanceIssueResponse,
  MaintenanceWorkOrderEntryResponse,
  MaintenanceWorkOrderResponse,
  ServiceEventResponse,
} from '@portfolio/contracts';
import {
  assertCreatedMaintenanceIssue,
  assertCreatedMaintenanceWorkOrder,
  assertCreatedServiceEvent,
  assertInspectionBundleUnitOwner,
  assertMaintenanceIssueOwner,
  assertMaintenanceIssueTerminal,
  assertMaintenanceIssueUpdate,
  assertMaintenanceServiceEventLink,
  assertMaintenanceWorkOrderAssignment,
  assertMaintenanceWorkOrderOwner,
  assertMaintenanceWorkOrdersOwner,
  assertMaintenanceWorkOrderTransition,
  assertMaintenanceWorkOrderUpdate,
  assertServiceEventsOwner,
  assertUnitMaintenanceIssuesOwner,
} from '../src/dossier/maintenance-owner.js';

const propertyId = '11111111-1111-4111-8111-111111111111';
const unitId = '22222222-2222-4222-8222-222222222222';
const otherUnitId = '33333333-3333-4333-8333-333333333333';
const issueId = '44444444-4444-4444-8444-444444444444';
const workOrderId = '55555555-5555-4555-8555-555555555555';
const assetId = '66666666-6666-4666-8666-666666666666';
const serviceEventId = '77777777-7777-4777-8777-777777777777';
const partyId = '88888888-8888-4888-8888-888888888888';

function issue(
  overrides: Partial<MaintenanceIssueResponse> = {},
): MaintenanceIssueResponse {
  return {
    id: issueId,
    code: 'ISS-1',
    propertyId,
    unitId,
    spaceId: null,
    assetId,
    inspectionFindingId: null,
    title: 'Leaking washer',
    description: 'Water under machine',
    priority: 'high',
    status: 'open',
    reportedAt: '2026-09-22T08:00:00.000Z',
    resolvedAt: null,
    cancelledAt: null,
    version: 1,
    recordedAt: '2026-09-22T08:05:00.000Z',
    recordedByUserId: '99999999-9999-4999-8999-999999999999',
    ...overrides,
  };
}

function order(
  overrides: Partial<MaintenanceWorkOrderResponse> = {},
): MaintenanceWorkOrderResponse {
  return {
    id: workOrderId,
    issueId,
    code: 'WO-1',
    title: 'Inspect washer',
    description: null,
    assignee: null,
    status: 'draft',
    assignedAt: null,
    startedAt: null,
    completedAt: null,
    cancelledAt: null,
    version: 1,
    createdAt: '2026-09-22T08:10:00.000Z',
    createdByUserId: '99999999-9999-4999-8999-999999999999',
    ...overrides,
  };
}

function entry(
  overrides: Partial<MaintenanceWorkOrderEntryResponse> = {},
): MaintenanceWorkOrderEntryResponse {
  return {
    workOrder: order(),
    serviceEventIds: [],
    ...overrides,
  };
}

function serviceEvent(
  overrides: Partial<ServiceEventResponse> = {},
): ServiceEventResponse {
  return {
    id: serviceEventId,
    assetId,
    servicePlanId: null,
    warrantyClaimId: null,
    eventType: 'repair',
    performedAt: '2026-09-22T09:00:00.000Z',
    providerPartyId: partyId,
    description: 'Replaced inlet hose',
    reference: 'SRV-1',
    parts: [],
    recordedAt: '2026-09-22T09:10:00.000Z',
    recordedByUserId: '99999999-9999-4999-8999-999999999999',
    ...overrides,
  };
}

describe('Maintenance browser owner guards', () => {
  it('fails closed on Unit/Issue/WorkOrder ownership drift', () => {
    expect(() =>
      assertUnitMaintenanceIssuesOwner(unitId, [issue()]),
    ).not.toThrow();

    expect(() =>
      assertUnitMaintenanceIssuesOwner(unitId, [
        issue({ unitId: otherUnitId }),
      ]),
    ).toThrow('another Unit');

    expect(() =>
      assertMaintenanceIssueOwner(unitId, issueId, issue()),
    ).not.toThrow();

    expect(() =>
      assertMaintenanceWorkOrdersOwner(issueId, [entry()]),
    ).not.toThrow();

    expect(() =>
      assertMaintenanceWorkOrdersOwner(issueId, [
        entry({ workOrder: order({ issueId: otherUnitId }) }),
      ]),
    ).toThrow('another Issue');

    expect(() =>
      assertMaintenanceWorkOrderOwner(issueId, workOrderId, order()),
    ).not.toThrow();

    expect(() =>
      assertMaintenanceWorkOrderOwner(
        issueId,
        workOrderId,
        order({ id: otherUnitId }),
      ),
    ).toThrow('selected Issue/WorkOrder owner');
  });

  it('binds Issue create/update/terminal responses to immutable scope', () => {
    expect(() =>
      assertCreatedMaintenanceIssue(
        {
          code: 'ISS-1',
          propertyId,
          unitId,
          spaceId: null,
          assetId,
          inspectionFindingId: null,
          title: 'Leaking washer',
          description: 'Water under machine',
          priority: 'high',
        },
        issue(),
      ),
    ).not.toThrow();

    expect(() =>
      assertMaintenanceIssueUpdate(
        issue(),
        {
          title: 'Leaking washer - urgent',
          description: 'Water under machine',
          priority: 'urgent',
        },
        issue({
          title: 'Leaking washer - urgent',
          priority: 'urgent',
          version: 2,
        }),
      ),
    ).not.toThrow();

    expect(() =>
      assertMaintenanceIssueUpdate(
        issue(),
        {
          title: 'Leaking washer - urgent',
          description: 'Water under machine',
          priority: 'urgent',
        },
        issue({
          title: 'Leaking washer - urgent',
          priority: 'urgent',
          unitId: otherUnitId,
          version: 2,
        }),
      ),
    ).toThrow('immutable Issue identity');

    expect(() =>
      assertMaintenanceIssueTerminal(
        issue(),
        'resolve',
        issue({
          status: 'resolved',
          resolvedAt: '2026-09-22T10:00:00.000Z',
          version: 2,
        }),
      ),
    ).not.toThrow();
  });

  it('binds WorkOrder create/update/assignment/lifecycle responses', () => {
    expect(() =>
      assertCreatedMaintenanceWorkOrder(
        issueId,
        { code: 'WO-1', title: 'Inspect washer', description: null },
        order(),
      ),
    ).not.toThrow();

    expect(() =>
      assertMaintenanceWorkOrderUpdate(
        order(),
        { title: 'Inspect and repair washer', description: null },
        order({ title: 'Inspect and repair washer', version: 2 }),
      ),
    ).not.toThrow();

    expect(() =>
      assertMaintenanceWorkOrderAssignment(
        order(),
        partyId,
        order({
          assignee: { kind: 'party', partyId },
          status: 'assigned',
          assignedAt: '2026-09-22T08:20:00.000Z',
          version: 2,
        }),
      ),
    ).not.toThrow();

    const assigned = order({
      assignee: { kind: 'party', partyId },
      status: 'assigned',
      assignedAt: '2026-09-22T08:20:00.000Z',
      version: 2,
    });
    expect(() =>
      assertMaintenanceWorkOrderTransition(
        assigned,
        'start',
        {
          ...assigned,
          status: 'in_progress',
          startedAt: '2026-09-22T08:30:00.000Z',
          version: 3,
        },
      ),
    ).not.toThrow();
  });

  it('keeps ServiceEvent evidence owned by exact Asset and WorkOrder link', () => {
    expect(() =>
      assertServiceEventsOwner(assetId, [serviceEvent()]),
    ).not.toThrow();
    expect(() =>
      assertServiceEventsOwner(assetId, [
        serviceEvent({ assetId: otherUnitId }),
      ]),
    ).toThrow('another Asset');

    expect(() =>
      assertCreatedServiceEvent(
        assetId,
        {
          eventType: 'repair',
          performedAt: '2026-09-22T09:00:00.000Z',
          description: 'Replaced inlet hose',
          reference: 'SRV-1',
          providerPartyId: partyId,
        },
        serviceEvent(),
      ),
    ).not.toThrow();

    expect(() =>
      assertMaintenanceServiceEventLink(
        workOrderId,
        serviceEventId,
        {
          workOrderId,
          serviceEventId,
          linkedAt: '2026-09-22T09:11:00.000Z',
          linkedByUserId: '99999999-9999-4999-8999-999999999999',
        },
      ),
    ).not.toThrow();
  });

  it('fails closed when Inspection Finding provenance comes from another Unit', () => {
    const bundle = {
      inspection: {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        code: 'INSP-1',
        inspectionType: 'move_in',
        unitId,
        tenancyId: null,
        schemaVersionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        assignedToUserId: '99999999-9999-4999-8999-999999999999',
        createdByUserId: '99999999-9999-4999-8999-999999999999',
        scheduledFor: null,
        status: 'in_progress',
        startedAt: '2026-09-22T07:00:00.000Z',
        lockedAt: null,
        finalizedAt: null,
        cancelledAt: null,
        version: 2,
        contentRevision: 0,
      },
      schema: {
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        schemaCode: 'SCH-1',
        versionNumber: 1,
        inspectionType: 'move_in',
        title: 'Move in',
        status: 'published',
        requiredSignatureRoles: [],
        sections: [],
      },
      sectionStates: [],
      responses: [],
      findings: [],
      evidence: [],
      signatures: [],
      finalSnapshot: null,
    } as InspectionBundleResponse;

    expect(() =>
      assertInspectionBundleUnitOwner(unitId, bundle),
    ).not.toThrow();

    expect(() =>
      assertInspectionBundleUnitOwner(otherUnitId, bundle),
    ).toThrow('another Unit');
  });
});
