import { describe, expect, it } from 'vitest';
import type {
  AssignedInspectionWorkItemResponse,
  InspectionResponseDto,
  InspectionStaffResponse,
} from '@portfolio/contracts';
import {
  assertAssignedInspectionWorkList,
  assertCreatedInspection,
  assertInspectionOrchestrationMutation,
  assertInspectionStaffList,
  assertUnitInspectionListOwner,
  findRecoveredCreatedInspection,
  isRecoveredInspectionOrchestration,
} from '../src/dossier/inspection-orchestration-owner.js';

const unitId = '11111111-1111-4111-8111-111111111111';
const otherUnitId = '22222222-2222-4222-8222-222222222222';
const inspectionId = '33333333-3333-4333-8333-333333333333';
const assigneeId = '44444444-4444-4444-8444-444444444444';

function inspection(
  overrides: Partial<InspectionResponseDto> = {},
): InspectionResponseDto {
  return {
    id: inspectionId,
    code: 'INS-1',
    inspectionType: 'move_in',
    unitId,
    tenancyId: null,
    schemaVersionId: '55555555-5555-4555-8555-555555555555',
    assignedToUserId: assigneeId,
    createdByUserId: '66666666-6666-4666-8666-666666666666',
    scheduledFor: '2026-09-25',
    status: 'draft',
    startedAt: null,
    lockedAt: null,
    finalizedAt: null,
    cancelledAt: null,
    version: 1,
    contentRevision: 0,
    ...overrides,
  };
}

const registration = {
  code: 'INS-1',
  inspectionType: 'move_in' as const,
  unitId,
  tenancyId: null,
  schemaVersionId: '55555555-5555-4555-8555-555555555555',
  assignedToUserId: assigneeId,
  scheduledFor: '2026-09-25',
};

describe('Inspection orchestration browser guards', () => {
  it('fails closed for Unit list ownership drift', () => {
    expect(() =>
      assertUnitInspectionListOwner(unitId, [inspection()]),
    ).not.toThrow();

    expect(() =>
      assertUnitInspectionListOwner(unitId, [
        inspection({ unitId: otherUnitId }),
      ]),
    ).toThrow('another Unit');
  });

  it('requires a complete initial Inspection registration response', () => {
    expect(() =>
      assertCreatedInspection(registration, inspection()),
    ).not.toThrow();

    expect(() =>
      assertCreatedInspection(
        registration,
        inspection({ contentRevision: 1 }),
      ),
    ).toThrow('submitted orchestration identity');
  });

  it('recovers only one exact newly-created Inspection', () => {
    const recovered = inspection({
      id: '77777777-7777-4777-8777-777777777777',
    });
    expect(
      findRecoveredCreatedInspection(
        [inspection(), recovered],
        new Set([inspectionId]),
        registration,
      )?.id,
    ).toBe(recovered.id);

    expect(
      findRecoveredCreatedInspection(
        [
          recovered,
          inspection({
            id: '88888888-8888-4888-8888-888888888888',
          }),
        ],
        new Set(),
        registration,
      ),
    ).toBeNull();
  });

  it('binds draft orchestration response to immutable Inspection identity', () => {
    const current = inspection();
    const expected = {
      assignedToUserId:
        '99999999-9999-4999-8999-999999999999',
      scheduledFor: '2026-09-26',
    };
    const updated = inspection({
      assignedToUserId: expected.assignedToUserId,
      scheduledFor: expected.scheduledFor,
      version: 2,
    });

    expect(() =>
      assertInspectionOrchestrationMutation(
        current,
        expected,
        updated,
      ),
    ).not.toThrow();
    expect(
      isRecoveredInspectionOrchestration(
        current,
        expected,
        updated,
      ),
    ).toBe(true);

    expect(() =>
      assertInspectionOrchestrationMutation(
        current,
        expected,
        {
          ...updated,
          unitId: otherUnitId,
        },
      ),
    ).toThrow('historical Inspection identity');
  });

  it('rejects duplicate staff/work identities in browser read models', () => {
    const staff: InspectionStaffResponse = {
      userId: assigneeId,
      displayName: 'Inspector',
      email: null,
      role: 'inspector',
    };
    expect(() => assertInspectionStaffList([staff])).not.toThrow();
    expect(() => assertInspectionStaffList([staff, staff])).toThrow(
      'duplicate user',
    );

    const work: AssignedInspectionWorkItemResponse = {
      inspection: inspection(),
      propertyId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      unitCode: 'UNIT-1',
      unitNumber: '1A',
    };
    expect(() =>
      assertAssignedInspectionWorkList([work]),
    ).not.toThrow();
    expect(() =>
      assertAssignedInspectionWorkList([work, work]),
    ).toThrow('duplicate Inspection');
  });
});
