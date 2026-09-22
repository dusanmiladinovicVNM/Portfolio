import type {
  AssignedInspectionWorkItemResponse,
  InspectionResponseDto,
  InspectionStaffResponse,
} from '@portfolio/contracts';

interface InspectionRegistrationExpectation {
  readonly code: string;
  readonly inspectionType: InspectionResponseDto['inspectionType'];
  readonly unitId: string;
  readonly tenancyId: string | null;
  readonly schemaVersionId: string;
  readonly assignedToUserId: string;
  readonly scheduledFor: string | null;
}

function matchesInitialInspection(
  inspection: InspectionResponseDto,
  expected: InspectionRegistrationExpectation,
): boolean {
  return (
    inspection.code === expected.code &&
    inspection.inspectionType === expected.inspectionType &&
    inspection.unitId === expected.unitId &&
    inspection.tenancyId === expected.tenancyId &&
    inspection.schemaVersionId === expected.schemaVersionId &&
    inspection.assignedToUserId === expected.assignedToUserId &&
    inspection.scheduledFor === expected.scheduledFor &&
    inspection.status === 'draft' &&
    inspection.startedAt === null &&
    inspection.lockedAt === null &&
    inspection.finalizedAt === null &&
    inspection.cancelledAt === null &&
    inspection.version === 1 &&
    inspection.contentRevision === 0
  );
}

export function assertUnitInspectionListOwner(
  unitId: string,
  inspections: readonly InspectionResponseDto[],
): void {
  if (inspections.some((inspection) => inspection.unitId !== unitId)) {
    throw new Error(
      'Unit Inspection list contains an Inspection owned by another Unit.',
    );
  }
}

export function assertInspectionStaffList(
  staff: readonly InspectionStaffResponse[],
): void {
  const ids = new Set<string>();
  for (const entry of staff) {
    if (ids.has(entry.userId)) {
      throw new Error('Inspection staff list contains a duplicate user.');
    }
    ids.add(entry.userId);
  }
}

export function assertAssignedInspectionWorkList(
  work: readonly AssignedInspectionWorkItemResponse[],
): void {
  const ids = new Set<string>();
  for (const item of work) {
    if (ids.has(item.inspection.id)) {
      throw new Error(
        'Assigned Inspection work list contains duplicate Inspection identity.',
      );
    }
    ids.add(item.inspection.id);
  }
}

export function assertCreatedInspection(
  expected: InspectionRegistrationExpectation,
  inspection: InspectionResponseDto,
): void {
  if (!matchesInitialInspection(inspection, expected)) {
    throw new Error(
      'Created Inspection response does not match submitted orchestration identity.',
    );
  }
}

export function findRecoveredCreatedInspection(
  inspections: readonly InspectionResponseDto[],
  preExistingIds: ReadonlySet<string>,
  expected: InspectionRegistrationExpectation,
): InspectionResponseDto | null {
  const matches = inspections.filter(
    (inspection) =>
      !preExistingIds.has(inspection.id) &&
      matchesInitialInspection(inspection, expected),
  );
  return matches.length === 1 ? matches[0]! : null;
}

function sameHistoricalIdentity(
  current: InspectionResponseDto,
  response: InspectionResponseDto,
): boolean {
  return (
    response.id === current.id &&
    response.code === current.code &&
    response.inspectionType === current.inspectionType &&
    response.unitId === current.unitId &&
    response.tenancyId === current.tenancyId &&
    response.schemaVersionId === current.schemaVersionId &&
    response.createdByUserId === current.createdByUserId
  );
}

export function assertInspectionOrchestrationMutation(
  current: InspectionResponseDto,
  expected: {
    readonly assignedToUserId: string;
    readonly scheduledFor: string | null;
  },
  response: InspectionResponseDto,
): void {
  if (!sameHistoricalIdentity(current, response)) {
    throw new Error(
      'Inspection orchestration response changed historical Inspection identity.',
    );
  }

  if (
    current.status !== 'draft' ||
    response.status !== 'draft' ||
    response.assignedToUserId !== expected.assignedToUserId ||
    response.scheduledFor !== expected.scheduledFor ||
    response.startedAt !== current.startedAt ||
    response.lockedAt !== current.lockedAt ||
    response.finalizedAt !== current.finalizedAt ||
    response.cancelledAt !== current.cancelledAt ||
    response.contentRevision !== current.contentRevision ||
    response.version !== current.version + 1
  ) {
    throw new Error(
      'Inspection orchestration response does not match requested draft metadata.',
    );
  }
}

export function isRecoveredInspectionOrchestration(
  current: InspectionResponseDto,
  expected: {
    readonly assignedToUserId: string;
    readonly scheduledFor: string | null;
  },
  canonical: InspectionResponseDto,
): boolean {
  try {
    assertInspectionOrchestrationMutation(current, expected, canonical);
    return true;
  } catch {
    return false;
  }
}
