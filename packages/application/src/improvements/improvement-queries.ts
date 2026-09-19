import {
  DomainError,
  type ImprovementProjectId,
  type PropertyId,
  type UnitId,
  type WorkItemId,
} from '@portfolio/domain';
import {
  requireCapability,
  type Actor,
} from '../security/access.js';
import type { ImprovementRepository } from './improvement-repository.js';

export async function getImprovementProjectQuery(
  repository: ImprovementRepository,
  actor: Actor,
  projectId: ImprovementProjectId,
) {
  requireCapability(actor, 'improvements:read');
  const project = await repository.getProjectById(projectId);
  if (!project) {
    throw new DomainError(
      'IMPROVEMENT_PROJECT_NOT_FOUND',
      'ImprovementProject not found.',
    );
  }
  return project;
}

export function listImprovementProjectsByPropertyQuery(
  repository: ImprovementRepository,
  actor: Actor,
  propertyId: PropertyId,
) {
  requireCapability(actor, 'improvements:read');
  return repository.listProjectsByProperty(propertyId);
}

export function listImprovementProjectsByUnitQuery(
  repository: ImprovementRepository,
  actor: Actor,
  unitId: UnitId,
) {
  requireCapability(actor, 'improvements:read');
  return repository.listProjectsByUnit(unitId);
}

export async function listWorkItemsQuery(
  repository: ImprovementRepository,
  actor: Actor,
  projectId: ImprovementProjectId,
) {
  requireCapability(actor, 'improvements:read');
  if (!(await repository.getProjectById(projectId))) {
    throw new DomainError(
      'IMPROVEMENT_PROJECT_NOT_FOUND',
      'ImprovementProject not found.',
    );
  }
  return repository.listWorkItemsByProject(projectId);
}

export async function listWorkRecordsByProjectQuery(
  repository: ImprovementRepository,
  actor: Actor,
  projectId: ImprovementProjectId,
) {
  requireCapability(actor, 'improvements:read');
  if (!(await repository.getProjectById(projectId))) {
    throw new DomainError(
      'IMPROVEMENT_PROJECT_NOT_FOUND',
      'ImprovementProject not found.',
    );
  }
  return repository.listWorkRecordsByProject(projectId);
}

export async function listWorkRecordsByItemQuery(
  repository: ImprovementRepository,
  actor: Actor,
  workItemId: WorkItemId,
) {
  requireCapability(actor, 'improvements:read');
  if (!(await repository.getWorkItemById(workItemId))) {
    throw new DomainError('WORK_ITEM_NOT_FOUND', 'WorkItem not found.');
  }
  return repository.listWorkRecordsByItem(workItemId);
}
