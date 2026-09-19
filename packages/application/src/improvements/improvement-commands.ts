import {
  DomainError,
  asImprovementProjectId,
  asProjectAssetId,
  asWorkItemId,
  asWorkMaterialId,
  asWorkRecordId,
  cancelImprovementProject,
  cancelWorkItem,
  completeImprovementProject,
  completeWorkItem,
  createImprovementProject,
  createWorkItem,
  createWorkRecord,
  planImprovementProject,
  startImprovementProject,
  startWorkItem,
  updateImprovementProjectPlan,
  type AssetId,
  type ImprovementProjectId,
  type PartyId,
  type ProjectAssetAction,
  type PropertyId,
  type SpaceId,
  type UnitId,
  type WorkItemId,
  type WorkMaterialUnit,
} from '@portfolio/domain';
import type { AssetRepository } from '../assets/asset-repository.js';
import type { PartyRepository } from '../parties/party-repository.js';
import type { PortfolioRepository } from '../portfolio/portfolio-repository.js';
import {
  requireCapability,
  type Actor,
} from '../security/access.js';
import type { ClockPort } from '../shared/clock.js';
import type { IdGenerator } from '../shared/id-generator.js';
import type { ImprovementRepository } from './improvement-repository.js';

export interface ImprovementDependencies {
  readonly improvementRepository: ImprovementRepository;
  readonly portfolioRepository: PortfolioRepository;
  readonly partyRepository: PartyRepository;
  readonly assetRepository: AssetRepository;
  readonly idGenerator: IdGenerator;
  readonly clock: ClockPort;
}

function assertExpectedVersion(
  actual: number,
  expected: number,
  code: string,
  message: string,
): void {
  if (actual !== expected) {
    throw new DomainError(code, message);
  }
}

async function requireProject(
  repository: ImprovementRepository,
  projectId: ImprovementProjectId,
) {
  const project = await repository.getProjectById(projectId);
  if (!project) {
    throw new DomainError(
      'IMPROVEMENT_PROJECT_NOT_FOUND',
      'ImprovementProject not found.',
    );
  }
  return project;
}

async function requireWorkItem(
  repository: ImprovementRepository,
  workItemId: WorkItemId,
) {
  const item = await repository.getWorkItemById(workItemId);
  if (!item) {
    throw new DomainError('WORK_ITEM_NOT_FOUND', 'WorkItem not found.');
  }
  return item;
}

async function validateProjectScope(
  portfolioRepository: PortfolioRepository,
  propertyId: PropertyId,
  unitId: UnitId | null | undefined,
  spaceId: SpaceId | null | undefined,
): Promise<void> {
  const property = await portfolioRepository.getPropertyById(propertyId);
  if (!property) {
    throw new DomainError('PROPERTY_NOT_FOUND', 'Property not found.');
  }

  if (spaceId != null && unitId == null) {
    throw new DomainError(
      'IMPROVEMENT_SPACE_REQUIRES_UNIT',
      'ImprovementProject Space scope requires a Unit scope.',
    );
  }

  if (unitId != null) {
    const unit = await portfolioRepository.getUnitById(unitId);
    if (!unit) {
      throw new DomainError('UNIT_NOT_FOUND', 'Unit not found.');
    }
    if (unit.propertyId !== propertyId) {
      throw new DomainError(
        'IMPROVEMENT_UNIT_PROPERTY_MISMATCH',
        'ImprovementProject Unit must belong to its Property.',
      );
    }
  }

  if (spaceId != null) {
    const space = await portfolioRepository.getSpaceById(spaceId);
    if (!space) {
      throw new DomainError('SPACE_NOT_FOUND', 'Space not found.');
    }
    if (space.unitId !== unitId) {
      throw new DomainError(
        'IMPROVEMENT_SPACE_UNIT_MISMATCH',
        'ImprovementProject Space must belong to its Unit.',
      );
    }
  }
}

export async function createImprovementProjectCommand(
  deps: ImprovementDependencies,
  actor: Actor,
  input: {
    readonly code: string;
    readonly name: string;
    readonly description?: string | null;
    readonly propertyId: PropertyId;
    readonly unitId?: UnitId | null;
    readonly spaceId?: SpaceId | null;
    readonly plannedStartOn?: string | null;
    readonly plannedEndOn?: string | null;
  },
) {
  requireCapability(actor, 'improvements:write');

  await validateProjectScope(
    deps.portfolioRepository,
    input.propertyId,
    input.unitId,
    input.spaceId,
  );

  if (await deps.improvementRepository.projectCodeExists(input.code)) {
    throw new DomainError(
      'IMPROVEMENT_PROJECT_CODE_EXISTS',
      'ImprovementProject code already exists.',
    );
  }

  const project = createImprovementProject({
    id: asImprovementProjectId(deps.idGenerator.next()),
    code: input.code,
    name: input.name,
    ...(input.description !== undefined
      ? { description: input.description }
      : {}),
    propertyId: input.propertyId,
    ...(input.unitId !== undefined ? { unitId: input.unitId } : {}),
    ...(input.spaceId !== undefined ? { spaceId: input.spaceId } : {}),
    ...(input.plannedStartOn !== undefined
      ? { plannedStartOn: input.plannedStartOn }
      : {}),
    ...(input.plannedEndOn !== undefined
      ? { plannedEndOn: input.plannedEndOn }
      : {}),
    createdAt: deps.clock.now(),
    createdByUserId: actor.userId,
  });

  await deps.improvementRepository.insertProject(project);
  return project;
}

export async function updateImprovementProjectPlanCommand(
  repository: ImprovementRepository,
  actor: Actor,
  projectId: ImprovementProjectId,
  expectedVersion: number,
  input: {
    readonly name?: string;
    readonly description?: string | null;
    readonly plannedStartOn?: string | null;
    readonly plannedEndOn?: string | null;
  },
) {
  requireCapability(actor, 'improvements:write');
  const project = await requireProject(repository, projectId);
  assertExpectedVersion(
    project.version,
    expectedVersion,
    'IMPROVEMENT_PROJECT_VERSION_CONFLICT',
    'ImprovementProject has changed since the caller last read it.',
  );

  const updated = updateImprovementProjectPlan(project, input);
  if (updated === project) return project;
  await repository.updateProjectPlan(updated, expectedVersion);
  return updated;
}

export async function changeImprovementProjectStatusCommand(
  deps: Pick<ImprovementDependencies, 'improvementRepository' | 'clock'>,
  actor: Actor,
  projectId: ImprovementProjectId,
  expectedVersion: number,
  action: 'plan' | 'start' | 'complete' | 'cancel',
) {
  requireCapability(actor, 'improvements:write');
  const project = await requireProject(deps.improvementRepository, projectId);
  assertExpectedVersion(
    project.version,
    expectedVersion,
    'IMPROVEMENT_PROJECT_VERSION_CONFLICT',
    'ImprovementProject has changed since the caller last read it.',
  );

  const now = deps.clock.now();
  const changed =
    action === 'plan'
      ? planImprovementProject(project, now)
      : action === 'start'
        ? startImprovementProject(project, now)
        : action === 'complete'
          ? completeImprovementProject(
              project,
              await deps.improvementRepository.listWorkItemsByProject(project.id),
              now,
            )
          : cancelImprovementProject(project, now);

  await deps.improvementRepository.updateProjectLifecycle(
    changed,
    expectedVersion,
  );
  return changed;
}

export async function createWorkItemCommand(
  deps: Pick<ImprovementDependencies, 'improvementRepository' | 'idGenerator' | 'clock'>,
  actor: Actor,
  projectId: ImprovementProjectId,
  input: {
    readonly code: string;
    readonly title: string;
    readonly description?: string | null;
  },
) {
  requireCapability(actor, 'improvements:write');
  const project = await requireProject(deps.improvementRepository, projectId);

  if (
    await deps.improvementRepository.workItemCodeExists(projectId, input.code)
  ) {
    throw new DomainError(
      'WORK_ITEM_CODE_EXISTS',
      'WorkItem code already exists inside ImprovementProject.',
    );
  }

  const item = createWorkItem({
    id: asWorkItemId(deps.idGenerator.next()),
    project,
    code: input.code,
    title: input.title,
    ...(input.description !== undefined
      ? { description: input.description }
      : {}),
    createdAt: deps.clock.now(),
    createdByUserId: actor.userId,
  });

  await deps.improvementRepository.insertWorkItem(item);
  return item;
}

export async function changeWorkItemStatusCommand(
  deps: Pick<ImprovementDependencies, 'improvementRepository' | 'clock'>,
  actor: Actor,
  workItemId: WorkItemId,
  expectedVersion: number,
  action: 'start' | 'complete' | 'cancel',
) {
  requireCapability(actor, 'improvements:write');
  const item = await requireWorkItem(deps.improvementRepository, workItemId);
  const project = await requireProject(
    deps.improvementRepository,
    item.projectId,
  );
  assertExpectedVersion(
    item.version,
    expectedVersion,
    'WORK_ITEM_VERSION_CONFLICT',
    'WorkItem has changed since the caller last read it.',
  );

  const now = deps.clock.now();
  const changed =
    action === 'start'
      ? startWorkItem(item, project, now)
      : action === 'complete'
        ? completeWorkItem(item, project, now)
        : cancelWorkItem(item, now);

  await deps.improvementRepository.updateWorkItem(changed, expectedVersion);
  return changed;
}

export async function recordWorkCommand(
  deps: ImprovementDependencies,
  actor: Actor,
  workItemId: WorkItemId,
  input: {
    readonly performedAt: string;
    readonly contractorPartyId?: PartyId | null;
    readonly description: string;
    readonly reference?: string | null;
    readonly materials?: readonly {
      readonly name: string;
      readonly reference?: string | null;
      readonly quantity: string;
      readonly unit: WorkMaterialUnit;
      readonly notes?: string | null;
    }[];
    readonly assets?: readonly {
      readonly assetId: AssetId;
      readonly action: ProjectAssetAction;
      readonly notes?: string | null;
    }[];
  },
) {
  requireCapability(actor, 'improvements:write');
  const item = await requireWorkItem(deps.improvementRepository, workItemId);
  const project = await requireProject(
    deps.improvementRepository,
    item.projectId,
  );

  if (input.contractorPartyId != null) {
    if (!(await deps.partyRepository.getById(input.contractorPartyId))) {
      throw new DomainError('PARTY_NOT_FOUND', 'Contractor Party not found.');
    }
  }

  const requestedAssetIds = input.assets?.map((asset) => asset.assetId) ?? [];
  if (new Set(requestedAssetIds).size !== requestedAssetIds.length) {
    throw new DomainError(
      'WORK_RECORD_DUPLICATE_ASSET',
      'One Asset can appear only once inside one WorkRecord.',
    );
  }
  const assets = await Promise.all(
    requestedAssetIds.map((assetId) => deps.assetRepository.getById(assetId)),
  );
  if (assets.some((asset) => asset === null)) {
    throw new DomainError(
      'ASSET_NOT_FOUND',
      'Every ProjectAsset must reference an existing Asset.',
    );
  }

  const recordId = asWorkRecordId(deps.idGenerator.next());
  const record = createWorkRecord({
    id: recordId,
    project,
    workItem: item,
    ...(input.contractorPartyId !== undefined
      ? { contractorPartyId: input.contractorPartyId }
      : {}),
    performedAt: input.performedAt,
    description: input.description,
    ...(input.reference !== undefined ? { reference: input.reference } : {}),
    materials: (input.materials ?? []).map((material) => ({
      id: asWorkMaterialId(deps.idGenerator.next()),
      name: material.name,
      ...(material.reference !== undefined
        ? { reference: material.reference }
        : {}),
      quantity: material.quantity,
      unit: material.unit,
      ...(material.notes !== undefined ? { notes: material.notes } : {}),
    })),
    assets: (input.assets ?? []).map((asset) => ({
      id: asProjectAssetId(deps.idGenerator.next()),
      assetId: asset.assetId,
      action: asset.action,
      ...(asset.notes !== undefined ? { notes: asset.notes } : {}),
    })),
    recordedAt: deps.clock.now(),
    recordedByUserId: actor.userId,
  });

  await deps.improvementRepository.insertWorkRecord(record);
  return record;
}
