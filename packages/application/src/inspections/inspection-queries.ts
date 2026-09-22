import {
  DomainError,
  type Inspection,
  type InspectionEvidence,
  type InspectionFinalSnapshot,
  type InspectionFinding,
  type InspectionId,
  type InspectionResponse,
  type InspectionSectionState,
  type InspectionSchemaVersion,
  type InspectionSignature,
  type InspectionSchemaVersionId,
  type PropertyId,
  type UnitId,
} from '@portfolio/domain';
import { requireCapability, type Actor } from '../security/access.js';
import type { PortfolioRepository } from '../portfolio/portfolio-repository.js';
import type {
  InspectionRepository,
  StaffDirectoryEntry,
  StaffDirectoryRepository,
} from './inspection-repository.js';

function assertInspectionReadAccess(actor: Actor, inspection: Inspection): void {
  if (
    actor.role === 'inspector' &&
    inspection.assignedToUserId !== actor.userId
  ) {
    throw new DomainError(
      'INSPECTION_ACCESS_DENIED',
      'Inspector may only access inspections assigned to them.',
    );
  }
}

export async function getInspectionQuery(
  repository: InspectionRepository,
  actor: Actor,
  id: InspectionId,
): Promise<Inspection> {
  requireCapability(actor, 'inspections:read');
  const inspection = await repository.getById(id);
  if (!inspection) {
    throw new DomainError('INSPECTION_NOT_FOUND', 'Inspection not found.');
  }
  assertInspectionReadAccess(actor, inspection);
  return inspection;
}

export async function listInspectionsByUnitQuery(
  repository: InspectionRepository,
  actor: Actor,
  unitId: UnitId,
): Promise<readonly Inspection[]> {
  requireCapability(actor, 'inspections:read');
  const inspections = await repository.listByUnit(unitId);
  return actor.role === 'inspector'
    ? inspections.filter(
        (inspection) => inspection.assignedToUserId === actor.userId,
      )
    : inspections;
}

export interface AssignedInspectionWorkItem {
  readonly inspection: Inspection;
  readonly propertyId: PropertyId;
  readonly unitCode: string;
  readonly unitNumber: string;
}

export async function listAssignedInspectionsQuery(
  inspectionRepository: InspectionRepository,
  portfolioRepository: PortfolioRepository,
  actor: Actor,
): Promise<readonly AssignedInspectionWorkItem[]> {
  requireCapability(actor, 'inspections:read');
  const inspections = await inspectionRepository.listAssignedTo(actor.userId);

  return Promise.all(
    inspections.map(async (inspection) => {
      const unit = await portfolioRepository.getUnitById(inspection.unitId);
      if (!unit) {
        throw new DomainError(
          'UNIT_NOT_FOUND',
          'Assigned Inspection references a missing Unit.',
        );
      }
      return {
        inspection,
        propertyId: unit.propertyId,
        unitCode: unit.code,
        unitNumber: unit.unitNumber,
      };
    }),
  );
}

export async function listAssignableInspectionStaffQuery(
  repository: StaffDirectoryRepository,
  actor: Actor,
): Promise<readonly StaffDirectoryEntry[]> {
  requireCapability(actor, 'inspections:read');
  const staff = await repository.listActiveStaff();
  return actor.role === 'inspector'
    ? staff.filter((entry) => entry.userId === actor.userId)
    : staff;
}

export async function listInspectionResponsesQuery(
  repository: InspectionRepository,
  actor: Actor,
  id: InspectionId,
): Promise<readonly InspectionResponse[]> {
  await getInspectionQuery(repository, actor, id);
  return repository.listResponses(id);
}

export async function listInspectionFindingsQuery(
  repository: InspectionRepository,
  actor: Actor,
  id: InspectionId,
): Promise<readonly InspectionFinding[]> {
  await getInspectionQuery(repository, actor, id);
  return repository.listFindings(id);
}

export async function getInspectionSchemaVersionQuery(
  repository: InspectionRepository,
  actor: Actor,
  id: InspectionSchemaVersionId,
): Promise<InspectionSchemaVersion> {
  requireCapability(actor, 'inspection_schemas:read');
  const schema = await repository.getSchemaVersionById(id);
  if (
    !schema ||
    (actor.role === 'inspector' && schema.status !== 'published')
  ) {
    throw new DomainError(
      'INSPECTION_SCHEMA_NOT_FOUND',
      'Inspection schema version not found.',
    );
  }
  return schema;
}

export async function listInspectionSchemaVersionsQuery(
  repository: InspectionRepository,
  actor: Actor,
): Promise<readonly InspectionSchemaVersion[]> {
  requireCapability(actor, 'inspection_schemas:read');
  const schemas = await repository.listSchemaVersions();
  return actor.role === 'inspector'
    ? schemas.filter((schema) => schema.status === 'published')
    : schemas;
}

export interface InspectionBundle {
  readonly inspection: Inspection;
  readonly schema: InspectionSchemaVersion;
  readonly sectionStates: readonly InspectionSectionState[];
  readonly responses: readonly InspectionResponse[];
  readonly findings: readonly InspectionFinding[];
  readonly evidence: readonly InspectionEvidence[];
  readonly signatures: readonly InspectionSignature[];
  readonly finalSnapshot: InspectionFinalSnapshot | null;
}

export async function getInspectionBundleQuery(
  repository: InspectionRepository,
  actor: Actor,
  id: InspectionId,
): Promise<InspectionBundle> {
  const inspection = await getInspectionQuery(repository, actor, id);
  const schema = await repository.getSchemaVersionById(
    inspection.schemaVersionId,
  );
  if (!schema) {
    throw new DomainError(
      'INSPECTION_SCHEMA_NOT_FOUND',
      'Inspection schema version not found.',
    );
  }

  const [
    sectionStates,
    responses,
    findings,
    evidence,
    signatures,
    finalSnapshot,
  ] = await Promise.all([
    repository.listSectionStates(id),
    repository.listResponses(id),
    repository.listFindings(id),
    repository.listEvidence(id),
    repository.listSignatures(id),
    repository.getFinalSnapshot(id),
  ]);

  return {
    inspection,
    schema,
    sectionStates,
    responses,
    findings,
    evidence,
    signatures,
    finalSnapshot,
  };
}
