import {
  DomainError,
  type Inspection,
  type InspectionFinding,
  type InspectionId,
  type InspectionResponse,
  type InspectionSchemaVersion,
  type InspectionSchemaVersionId,
  type UnitId,
} from '@portfolio/domain';
import { requireCapability, type Actor } from '../security/access.js';
import type { InspectionRepository } from './inspection-repository.js';

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
  if (!schema) {
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
  return repository.listSchemaVersions();
}
