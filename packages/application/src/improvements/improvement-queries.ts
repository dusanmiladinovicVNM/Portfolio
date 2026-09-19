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
import type { PortfolioRepository } from '../portfolio/portfolio-repository.js';
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

export async function listImprovementProjectsByPropertyQuery(
  repository: ImprovementRepository,
  portfolioRepository: PortfolioRepository,
  actor: Actor,
  propertyId: PropertyId,
) {
  requireCapability(actor, 'improvements:read');
  if (!(await portfolioRepository.getPropertyById(propertyId))) {
    throw new DomainError('PROPERTY_NOT_FOUND', 'Property not found.');
  }
  return repository.listProjectsByProperty(propertyId);
}

export async function listImprovementProjectsByUnitQuery(
  repository: ImprovementRepository,
  portfolioRepository: PortfolioRepository,
  actor: Actor,
  unitId: UnitId,
) {
  requireCapability(actor, 'improvements:read');
  if (!(await portfolioRepository.getUnitById(unitId))) {
    throw new DomainError('UNIT_NOT_FOUND', 'Unit not found.');
  }
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
