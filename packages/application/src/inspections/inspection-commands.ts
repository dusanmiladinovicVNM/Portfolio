import {
  DomainError,
  asInspectionFindingId,
  asInspectionId,
  asInspectionResponseId,
  asInspectionSchemaItemId,
  asInspectionSchemaSectionId,
  asInspectionSchemaVersionId,
  assertInspectionContentEditable,
  cancelInspection,
  createInspection,
  createInspectionFinding,
  createInspectionResponse,
  createInspectionSchemaVersion,
  findInspectionSchemaSection,
  findMissingRequiredInspectionItems,
  lockInspection,
  publishInspectionSchemaVersion,
  startInspection,
  type Inspection,
  type InspectionAnswerValue,
  type InspectionFinding,
  type InspectionFindingSeverity,
  type InspectionId,
  type InspectionItemType,
  type InspectionOption,
  type InspectionCondition,
  type InspectionResponse,
  type InspectionSchemaSectionId,
  type InspectionSchemaVersion,
  type InspectionSchemaVersionId,
  type InspectionType,
  type TenancyId,
  type UnitId,
  type UserId,
} from '@portfolio/domain';
import { requireCapability, type Actor } from '../security/access.js';
import type { ClockPort } from '../shared/clock.js';
import type { IdGenerator } from '../shared/id-generator.js';
import type { PortfolioRepository } from '../portfolio/portfolio-repository.js';
import type { TenancyRepository } from '../tenancy/tenancy-repository.js';
import type {
  InspectionRepository,
  StaffDirectoryRepository,
} from './inspection-repository.js';

export interface InspectionDependencies {
  readonly inspectionRepository: InspectionRepository;
  readonly portfolioRepository: PortfolioRepository;
  readonly tenancyRepository: TenancyRepository;
  readonly staffDirectoryRepository: StaffDirectoryRepository;
  readonly idGenerator: IdGenerator;
  readonly clock: ClockPort;
}

export interface CreateInspectionCommandInput {
  readonly code: string;
  readonly inspectionType: InspectionType;
  readonly unitId: UnitId;
  readonly tenancyId?: TenancyId | null;
  readonly schemaVersionId: InspectionSchemaVersionId;
  readonly assignedToUserId?: UserId;
  readonly scheduledFor?: string | null;
}

export interface SaveInspectionSectionItemInput {
  readonly itemId: string;
  readonly value: InspectionAnswerValue;
  readonly comment?: string | null;
}

export interface CreateInspectionFindingCommandInput {
  readonly sectionId: InspectionSchemaSectionId;
  readonly itemId?: string | null;
  readonly severity: InspectionFindingSeverity;
  readonly title: string;
  readonly description?: string | null;
}

export interface CreateInspectionSchemaVersionCommandInput {
  readonly schemaCode: string;
  readonly inspectionType: InspectionType;
  readonly title: string;
  readonly sections: readonly {
    readonly key: string;
    readonly title: string;
    readonly description?: string | null;
    readonly sortOrder: number;
    readonly items: readonly {
      readonly key: string;
      readonly type: InspectionItemType;
      readonly label: string;
      readonly required?: boolean;
      readonly sortOrder: number;
      readonly options?: readonly InspectionOption[];
      readonly visibleWhen?: InspectionCondition | null;
      readonly requiredWhen?: InspectionCondition | null;
    }[];
  }[];
}

async function requireInspection(
  repository: InspectionRepository,
  id: InspectionId,
): Promise<Inspection> {
  const inspection = await repository.getById(id);
  if (!inspection) {
    throw new DomainError('INSPECTION_NOT_FOUND', 'Inspection not found.');
  }
  return inspection;
}

function assertExpectedVersion(
  inspection: Inspection,
  expectedVersion: number,
): void {
  if (inspection.version !== expectedVersion) {
    throw new DomainError(
      'INSPECTION_VERSION_CONFLICT',
      'Inspection has changed since the caller last read it.',
    );
  }
}

function assertInspectionAccess(actor: Actor, inspection: Inspection): void {
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

async function requireSchema(
  repository: InspectionRepository,
  id: InspectionSchemaVersionId,
): Promise<InspectionSchemaVersion> {
  const schema = await repository.getSchemaVersionById(id);
  if (!schema) {
    throw new DomainError(
      'INSPECTION_SCHEMA_NOT_FOUND',
      'Inspection schema version not found.',
    );
  }
  return schema;
}

async function resolveAssignee(
  deps: Pick<
    InspectionDependencies,
    'staffDirectoryRepository'
  >,
  actor: Actor,
  requested: UserId | undefined,
): Promise<UserId> {
  if (
    actor.role === 'inspector' &&
    requested !== undefined &&
    requested !== actor.userId
  ) {
    throw new DomainError(
      'INSPECTION_ASSIGNMENT_FORBIDDEN',
      'Inspector cannot assign an inspection to another user.',
    );
  }

  const assignee =
    actor.role === 'inspector' ? actor.userId : requested ?? actor.userId;
  const active = await deps.staffDirectoryRepository.getActiveStaffById(assignee);
  if (!active) {
    throw new DomainError(
      'INSPECTION_ASSIGNEE_NOT_ACTIVE',
      'Inspection assignee must be an active staff user.',
    );
  }
  return assignee;
}

export async function createInspectionCommand(
  deps: InspectionDependencies,
  actor: Actor,
  input: CreateInspectionCommandInput,
): Promise<Inspection> {
  requireCapability(actor, 'inspections:write');

  if (!(await deps.portfolioRepository.getUnitById(input.unitId))) {
    throw new DomainError('UNIT_NOT_FOUND', 'Unit not found.');
  }

  if (input.tenancyId !== undefined && input.tenancyId !== null) {
    const tenancy = await deps.tenancyRepository.getById(input.tenancyId);
    if (!tenancy) {
      throw new DomainError('TENANCY_NOT_FOUND', 'Tenancy not found.');
    }
    if (tenancy.unitId !== input.unitId) {
      throw new DomainError(
        'INSPECTION_TENANCY_UNIT_MISMATCH',
        'Inspection tenancy must belong to the same unit.',
      );
    }
  }

  const schema = await requireSchema(
    deps.inspectionRepository,
    input.schemaVersionId,
  );
  if (schema.status !== 'published') {
    throw new DomainError(
      'INSPECTION_SCHEMA_NOT_PUBLISHED',
      'New inspections require a published schema version.',
    );
  }
  if (schema.inspectionType !== input.inspectionType) {
    throw new DomainError(
      'INSPECTION_SCHEMA_TYPE_MISMATCH',
      'Inspection type must match the selected schema version.',
    );
  }

  const assignedToUserId = await resolveAssignee(deps, actor, input.assignedToUserId);

  const inspection = createInspection({
    id: asInspectionId(deps.idGenerator.next()),
    code: input.code,
    inspectionType: input.inspectionType,
    unitId: input.unitId,
    tenancyId: input.tenancyId ?? null,
    schemaVersionId: schema.id,
    assignedToUserId,
    createdByUserId: actor.userId,
    scheduledFor: input.scheduledFor ?? null,
  });

  if (await deps.inspectionRepository.codeExists(inspection.code)) {
    throw new DomainError(
      'INSPECTION_CODE_ALREADY_EXISTS',
      `Inspection code '${inspection.code}' already exists.`,
    );
  }

  await deps.inspectionRepository.insert(inspection, schema);
  return inspection;
}

export async function startInspectionCommand(
  deps: Pick<InspectionDependencies, 'inspectionRepository' | 'clock'>,
  actor: Actor,
  id: InspectionId,
  expectedVersion: number,
): Promise<Inspection> {
  requireCapability(actor, 'inspections:write');
  const current = await requireInspection(deps.inspectionRepository, id);
  assertInspectionAccess(actor, current);
  assertExpectedVersion(current, expectedVersion);

  const updated = startInspection(current, deps.clock.now());
  await deps.inspectionRepository.updateLifecycle(updated, current.version);
  return updated;
}

export async function cancelInspectionCommand(
  deps: Pick<InspectionDependencies, 'inspectionRepository' | 'clock'>,
  actor: Actor,
  id: InspectionId,
  expectedVersion: number,
): Promise<Inspection> {
  requireCapability(actor, 'inspections:write');
  const current = await requireInspection(deps.inspectionRepository, id);
  assertInspectionAccess(actor, current);
  assertExpectedVersion(current, expectedVersion);

  const updated = cancelInspection(current, deps.clock.now());
  await deps.inspectionRepository.updateLifecycle(updated, current.version);
  return updated;
}

export async function saveInspectionSectionCommand(
  deps: Pick<
    InspectionDependencies,
    'inspectionRepository' | 'idGenerator' | 'clock'
  >,
  actor: Actor,
  inspectionId: InspectionId,
  sectionId: InspectionSchemaSectionId,
  expectedRevision: number,
  items: readonly SaveInspectionSectionItemInput[],
): Promise<{ readonly revision: number; readonly responses: readonly InspectionResponse[] }> {
  requireCapability(actor, 'inspections:write');
  const inspection = await requireInspection(
    deps.inspectionRepository,
    inspectionId,
  );
  assertInspectionAccess(actor, inspection);
  assertInspectionContentEditable(inspection);

  const schema = await requireSchema(
    deps.inspectionRepository,
    inspection.schemaVersionId,
  );
  const section = findInspectionSchemaSection(schema, sectionId);

  const currentRevision = await deps.inspectionRepository.getSectionRevision(
    inspection.id,
    section.id,
  );
  if (currentRevision === null) {
    throw new DomainError(
      'INSPECTION_SECTION_STATE_NOT_FOUND',
      'Inspection section state not found.',
    );
  }
  if (currentRevision !== expectedRevision) {
    throw new DomainError(
      'INSPECTION_SECTION_REVISION_CONFLICT',
      'Inspection section changed since the caller last read it.',
    );
  }

  const itemIds = items.map((item) => item.itemId);
  if (new Set(itemIds).size !== itemIds.length) {
    throw new DomainError(
      'INSPECTION_RESPONSE_DUPLICATE_ITEM',
      'A section save cannot contain the same item twice.',
    );
  }

  const itemById = new Map(section.items.map((item) => [item.id, item] as const));
  const now = deps.clock.now();
  const responses = items.map((input) => {
    const itemId = asInspectionSchemaItemId(input.itemId);
    const item = itemById.get(itemId);
    if (!item) {
      throw new DomainError(
        'INSPECTION_RESPONSE_ITEM_NOT_IN_SECTION',
        'Response item does not belong to this inspection section.',
      );
    }

    return createInspectionResponse({
      id: asInspectionResponseId(deps.idGenerator.next()),
      inspectionId: inspection.id,
      item,
      value: input.value,
      ...(input.comment !== undefined ? { comment: input.comment } : {}),
      updatedByUserId: actor.userId,
      updatedAt: now,
    });
  });

  return deps.inspectionRepository.saveSection(
    inspection.id,
    section.id,
    expectedRevision,
    responses,
  );
}

export async function lockInspectionCommand(
  deps: Pick<InspectionDependencies, 'inspectionRepository' | 'clock'>,
  actor: Actor,
  id: InspectionId,
  expectedVersion: number,
): Promise<Inspection> {
  requireCapability(actor, 'inspections:write');
  const current = await requireInspection(deps.inspectionRepository, id);
  assertInspectionAccess(actor, current);
  assertExpectedVersion(current, expectedVersion);

  const schema = await requireSchema(
    deps.inspectionRepository,
    current.schemaVersionId,
  );
  const responses = await deps.inspectionRepository.listResponses(current.id);
  const missing = findMissingRequiredInspectionItems(schema, responses);
  if (missing.length > 0) {
    throw new DomainError(
      'INSPECTION_REQUIRED_RESPONSES_MISSING',
      `Missing required inspection responses: ${missing
        .map((item) => item.itemKey)
        .join(', ')}.`,
    );
  }

  const updated = lockInspection(current, deps.clock.now());
  await deps.inspectionRepository.updateLifecycle(updated, current.version);
  return updated;
}

export async function createInspectionFindingCommand(
  deps: Pick<
    InspectionDependencies,
    'inspectionRepository' | 'idGenerator' | 'clock'
  >,
  actor: Actor,
  inspectionId: InspectionId,
  input: CreateInspectionFindingCommandInput,
): Promise<InspectionFinding> {
  requireCapability(actor, 'inspections:write');
  const inspection = await requireInspection(
    deps.inspectionRepository,
    inspectionId,
  );
  assertInspectionAccess(actor, inspection);

  const schema = await requireSchema(
    deps.inspectionRepository,
    inspection.schemaVersionId,
  );
  const section = findInspectionSchemaSection(schema, input.sectionId);

  let itemId = null;
  if (input.itemId !== undefined && input.itemId !== null) {
    const candidate = asInspectionSchemaItemId(input.itemId);
    if (!section.items.some((item) => item.id === candidate)) {
      throw new DomainError(
        'INSPECTION_FINDING_ITEM_NOT_IN_SECTION',
        'Finding item does not belong to the selected section.',
      );
    }
    itemId = candidate;
  }

  const finding = createInspectionFinding(inspection, {
    id: asInspectionFindingId(deps.idGenerator.next()),
    inspectionId: inspection.id,
    sectionId: section.id,
    itemId,
    severity: input.severity,
    title: input.title,
    ...(input.description !== undefined ? { description: input.description } : {}),
    createdByUserId: actor.userId,
    createdAt: deps.clock.now(),
  });

  await deps.inspectionRepository.insertFinding(finding);
  return finding;
}

export async function createInspectionSchemaVersionCommand(
  deps: Pick<InspectionDependencies, 'inspectionRepository' | 'idGenerator'>,
  actor: Actor,
  input: CreateInspectionSchemaVersionCommandInput,
): Promise<InspectionSchemaVersion> {
  requireCapability(actor, 'inspection_schemas:write');

  const versionNumber =
    (await deps.inspectionRepository.latestSchemaVersionNumber(input.schemaCode)) + 1;

  const schema = createInspectionSchemaVersion({
    id: asInspectionSchemaVersionId(deps.idGenerator.next()),
    schemaCode: input.schemaCode,
    versionNumber,
    inspectionType: input.inspectionType,
    title: input.title,
    sections: input.sections.map((section) => ({
      id: asInspectionSchemaSectionId(deps.idGenerator.next()),
      key: section.key,
      title: section.title,
      ...(section.description !== undefined
        ? { description: section.description }
        : {}),
      sortOrder: section.sortOrder,
      items: section.items.map((item) => ({
        id: asInspectionSchemaItemId(deps.idGenerator.next()),
        key: item.key,
        type: item.type,
        label: item.label,
        ...(item.required !== undefined ? { required: item.required } : {}),
        sortOrder: item.sortOrder,
        ...(item.options !== undefined ? { options: item.options } : {}),
        ...(item.visibleWhen !== undefined
          ? { visibleWhen: item.visibleWhen }
          : {}),
        ...(item.requiredWhen !== undefined
          ? { requiredWhen: item.requiredWhen }
          : {}),
      })),
    })),
  });

  await deps.inspectionRepository.insertSchemaVersion(schema);
  return schema;
}

export async function publishInspectionSchemaVersionCommand(
  repository: InspectionRepository,
  actor: Actor,
  id: InspectionSchemaVersionId,
): Promise<InspectionSchemaVersion> {
  requireCapability(actor, 'inspection_schemas:write');
  const current = await requireSchema(repository, id);
  const published = publishInspectionSchemaVersion(current);
  await repository.updateSchemaVersionStatus(published);
  return published;
}
