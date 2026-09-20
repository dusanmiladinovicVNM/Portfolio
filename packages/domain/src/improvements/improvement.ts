import { asDateOnly, type DateOnly } from '../shared/date-only.js';
import { DomainError } from '../shared/domain-error.js';
import { asInstant } from '../shared/instant.js';
import type {
  AssetId,
  ImprovementProjectId,
  PartyId,
  ProjectAssetId,
  PropertyId,
  SpaceId,
  UnitId,
  UserId,
  WorkItemId,
  WorkMaterialId,
  WorkRecordId,
} from '../shared/entity-id.js';

export const IMPROVEMENT_PROJECT_STATUSES = [
  'draft',
  'planned',
  'in_progress',
  'completed',
  'cancelled',
] as const;

export const WORK_ITEM_STATUSES = [
  'planned',
  'in_progress',
  'completed',
  'cancelled',
] as const;

export const WORK_MATERIAL_UNITS = [
  'piece',
  'kg',
  'g',
  'm',
  'm2',
  'm3',
  'l',
  'ml',
  'package',
  'other',
] as const;

export const PROJECT_ASSET_ACTIONS = [
  'affected',
  'installation_work',
  'removal_work',
] as const;

export type ImprovementProjectStatus =
  (typeof IMPROVEMENT_PROJECT_STATUSES)[number];
export type WorkItemStatus = (typeof WORK_ITEM_STATUSES)[number];
export type WorkMaterialUnit = (typeof WORK_MATERIAL_UNITS)[number];
export type ProjectAssetAction = (typeof PROJECT_ASSET_ACTIONS)[number];

declare const workQuantityBrand: unique symbol;
export type WorkQuantity = string & {
  readonly [workQuantityBrand]: 'WorkQuantity';
};

export interface ImprovementProject {
  readonly id: ImprovementProjectId;
  readonly code: string;
  readonly name: string;
  readonly description: string | null;
  readonly propertyId: PropertyId;
  readonly unitId: UnitId | null;
  readonly spaceId: SpaceId | null;
  readonly plannedStartOn: DateOnly | null;
  readonly plannedEndOn: DateOnly | null;
  readonly status: ImprovementProjectStatus;
  readonly plannedAt: string | null;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  readonly cancelledAt: string | null;
  readonly version: number;
  readonly createdAt: string;
  readonly createdByUserId: UserId;
}

export interface WorkItem {
  readonly id: WorkItemId;
  readonly projectId: ImprovementProjectId;
  readonly code: string;
  readonly title: string;
  readonly description: string | null;
  readonly status: WorkItemStatus;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  readonly cancelledAt: string | null;
  readonly version: number;
  readonly createdAt: string;
  readonly createdByUserId: UserId;
}

export interface WorkMaterial {
  readonly id: WorkMaterialId;
  readonly workRecordId: WorkRecordId;
  readonly name: string;
  readonly reference: string | null;
  readonly quantity: WorkQuantity;
  readonly unit: WorkMaterialUnit;
  readonly notes: string | null;
}

export interface ProjectAsset {
  readonly id: ProjectAssetId;
  readonly workRecordId: WorkRecordId;
  readonly assetId: AssetId;
  readonly action: ProjectAssetAction;
  readonly notes: string | null;
}

export interface WorkRecord {
  readonly id: WorkRecordId;
  readonly projectId: ImprovementProjectId;
  readonly workItemId: WorkItemId;
  readonly contractorPartyId: PartyId | null;
  readonly performedAt: string;
  readonly description: string;
  readonly reference: string | null;
  readonly materials: readonly WorkMaterial[];
  readonly assets: readonly ProjectAsset[];
  readonly recordedAt: string;
  readonly recordedByUserId: UserId;
}

function required(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new DomainError(
      'IMPROVEMENT_REQUIRED_FIELD',
      `${field} is required.`,
    );
  }
  return normalized;
}

function optional(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const normalized = value.trim();
  return normalized || null;
}

function instant(value: string, field: string): string {
  return asInstant(value, field, 'IMPROVEMENT_INVALID_TIMESTAMP');
}

function assertTimestampOrder(
  value: string,
  notBefore: string,
  field: string,
  predecessorField: string,
): void {
  if (Date.parse(value) < Date.parse(notBefore)) {
    throw new DomainError(
      'IMPROVEMENT_TIMESTAMP_ORDER_INVALID',
      `${field} cannot be before ${predecessorField}.`,
    );
  }
}

function assertPlacementShape(
  unitId: UnitId | null | undefined,
  spaceId: SpaceId | null | undefined,
): void {
  if (spaceId != null && unitId == null) {
    throw new DomainError(
      'IMPROVEMENT_SPACE_REQUIRES_UNIT',
      'ImprovementProject Space scope requires a Unit scope.',
    );
  }
}

function normalizePlanDates(
  plannedStartOnValue?: string | null,
  plannedEndOnValue?: string | null,
): {
  readonly plannedStartOn: DateOnly | null;
  readonly plannedEndOn: DateOnly | null;
} {
  const plannedStartOn =
    plannedStartOnValue == null ? null : asDateOnly(plannedStartOnValue);
  const plannedEndOn =
    plannedEndOnValue == null ? null : asDateOnly(plannedEndOnValue);

  if (plannedEndOn !== null && plannedStartOn === null) {
    throw new DomainError(
      'IMPROVEMENT_PLAN_DATES_INVALID',
      'plannedEndOn requires plannedStartOn.',
    );
  }
  if (
    plannedStartOn !== null &&
    plannedEndOn !== null &&
    plannedEndOn < plannedStartOn
  ) {
    throw new DomainError(
      'IMPROVEMENT_PLAN_DATES_INVALID',
      'plannedEndOn cannot be before plannedStartOn.',
    );
  }
  return { plannedStartOn, plannedEndOn };
}

export function asWorkQuantity(value: string): WorkQuantity {
  const normalized = value.trim();
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/.test(normalized)) {
    throw new DomainError(
      'WORK_MATERIAL_QUANTITY_INVALID',
      'WorkMaterial quantity must be a decimal with at most six decimal places.',
    );
  }
  if (/^0(?:\.0+)?$/.test(normalized)) {
    throw new DomainError(
      'WORK_MATERIAL_QUANTITY_INVALID',
      'WorkMaterial quantity must be greater than zero.',
    );
  }
  return normalized as WorkQuantity;
}

export function createImprovementProject(input: {
  readonly id: ImprovementProjectId;
  readonly code: string;
  readonly name: string;
  readonly description?: string | null;
  readonly propertyId: PropertyId;
  readonly unitId?: UnitId | null;
  readonly spaceId?: SpaceId | null;
  readonly plannedStartOn?: string | null;
  readonly plannedEndOn?: string | null;
  readonly createdAt: string;
  readonly createdByUserId: UserId;
}): ImprovementProject {
  assertPlacementShape(input.unitId, input.spaceId);
  const planDates = normalizePlanDates(
    input.plannedStartOn,
    input.plannedEndOn,
  );

  return {
    id: input.id,
    code: required(input.code, 'code'),
    name: required(input.name, 'name'),
    description: optional(input.description),
    propertyId: input.propertyId,
    unitId: input.unitId ?? null,
    spaceId: input.spaceId ?? null,
    ...planDates,
    status: 'draft',
    plannedAt: null,
    startedAt: null,
    completedAt: null,
    cancelledAt: null,
    version: 1,
    createdAt: instant(input.createdAt, 'createdAt'),
    createdByUserId: input.createdByUserId,
  };
}

export function updateImprovementProjectPlan(
  project: ImprovementProject,
  input: {
    readonly name?: string;
    readonly description?: string | null;
    readonly plannedStartOn?: string | null;
    readonly plannedEndOn?: string | null;
  },
): ImprovementProject {
  if (project.status !== 'draft' && project.status !== 'planned') {
    throw new DomainError(
      'IMPROVEMENT_PROJECT_PLAN_FROZEN',
      'ImprovementProject plan can only be corrected while draft or planned.',
    );
  }

  const name =
    input.name === undefined ? project.name : required(input.name, 'name');
  const description =
    input.description === undefined
      ? project.description
      : optional(input.description);

  const planDates = normalizePlanDates(
    input.plannedStartOn === undefined
      ? project.plannedStartOn
      : input.plannedStartOn,
    input.plannedEndOn === undefined
      ? project.plannedEndOn
      : input.plannedEndOn,
  );

  if (
    name === project.name &&
    description === project.description &&
    planDates.plannedStartOn === project.plannedStartOn &&
    planDates.plannedEndOn === project.plannedEndOn
  ) {
    return project;
  }

  return {
    ...project,
    name,
    description,
    ...planDates,
    version: project.version + 1,
  };
}

export function planImprovementProject(
  project: ImprovementProject,
  plannedAtValue: string,
): ImprovementProject {
  if (project.status !== 'draft') {
    throw new DomainError(
      'IMPROVEMENT_PROJECT_INVALID_TRANSITION',
      `Cannot plan ImprovementProject from ${project.status}.`,
    );
  }
  const plannedAt = instant(plannedAtValue, 'plannedAt');
  assertTimestampOrder(plannedAt, project.createdAt, 'plannedAt', 'createdAt');
  return {
    ...project,
    status: 'planned',
    plannedAt,
    version: project.version + 1,
  };
}

export function startImprovementProject(
  project: ImprovementProject,
  startedAtValue: string,
): ImprovementProject {
  if (project.status !== 'planned') {
    throw new DomainError(
      'IMPROVEMENT_PROJECT_INVALID_TRANSITION',
      `Cannot start ImprovementProject from ${project.status}.`,
    );
  }
  if (project.plannedAt === null) {
    throw new DomainError(
      'IMPROVEMENT_PROJECT_INVALID_STATE',
      'Planned ImprovementProject is missing plannedAt.',
    );
  }
  const startedAt = instant(startedAtValue, 'startedAt');
  assertTimestampOrder(startedAt, project.plannedAt, 'startedAt', 'plannedAt');
  return {
    ...project,
    status: 'in_progress',
    startedAt,
    version: project.version + 1,
  };
}

function assertNoWorkRecordAfter(
  records: readonly WorkRecord[],
  cutoff: string,
  predicate: (record: WorkRecord) => boolean,
  code: string,
  message: string,
): void {
  if (
    records.some(
      (record) =>
        predicate(record) && Date.parse(record.performedAt) > Date.parse(cutoff),
    )
  ) {
    throw new DomainError(code, message);
  }
}

export function completeImprovementProject(
  project: ImprovementProject,
  workItems: readonly WorkItem[],
  workRecords: readonly WorkRecord[],
  completedAtValue: string,
): ImprovementProject {
  if (project.status !== 'in_progress') {
    throw new DomainError(
      'IMPROVEMENT_PROJECT_INVALID_TRANSITION',
      `Cannot complete ImprovementProject from ${project.status}.`,
    );
  }
  if (project.startedAt === null) {
    throw new DomainError(
      'IMPROVEMENT_PROJECT_INVALID_STATE',
      'In-progress ImprovementProject is missing startedAt.',
    );
  }

  const openItem = workItems.find(
    (item) =>
      item.projectId === project.id &&
      item.status !== 'completed' &&
      item.status !== 'cancelled',
  );
  if (openItem) {
    throw new DomainError(
      'IMPROVEMENT_PROJECT_OPEN_WORK_ITEMS',
      'ImprovementProject cannot complete while WorkItems remain operational.',
    );
  }

  const completedAt = instant(completedAtValue, 'completedAt');
  assertTimestampOrder(
    completedAt,
    project.startedAt,
    'completedAt',
    'startedAt',
  );
  assertNoWorkRecordAfter(
    workRecords,
    completedAt,
    (record) => record.projectId === project.id,
    'IMPROVEMENT_PROJECT_TERMINAL_BEFORE_WORK_RECORD',
    'ImprovementProject completion cannot predate existing WorkRecord history.',
  );

  const laterChildTerminal = workItems.find((item) => {
    if (item.projectId !== project.id) return false;
    const terminalAt = item.completedAt ?? item.cancelledAt;
    return terminalAt !== null && Date.parse(terminalAt) > Date.parse(completedAt);
  });
  if (laterChildTerminal) {
    throw new DomainError(
      'IMPROVEMENT_PROJECT_COMPLETED_BEFORE_WORK_ITEM_TERMINAL',
      'ImprovementProject completion cannot predate a WorkItem terminal timestamp.',
    );
  }

  return {
    ...project,
    status: 'completed',
    completedAt,
    version: project.version + 1,
  };
}

export function cancelImprovementProject(
  project: ImprovementProject,
  workItems: readonly WorkItem[],
  workRecords: readonly WorkRecord[],
  cancelledAtValue: string,
): ImprovementProject {
  if (project.status === 'completed' || project.status === 'cancelled') {
    throw new DomainError(
      'IMPROVEMENT_PROJECT_TERMINAL',
      `ImprovementProject in status ${project.status} cannot transition.`,
    );
  }

  const cancelledAt = instant(cancelledAtValue, 'cancelledAt');
  const notBefore =
    project.startedAt ?? project.plannedAt ?? project.createdAt;
  assertTimestampOrder(
    cancelledAt,
    notBefore,
    'cancelledAt',
    project.startedAt !== null
      ? 'startedAt'
      : project.plannedAt !== null
        ? 'plannedAt'
        : 'createdAt',
  );
  assertNoWorkRecordAfter(
    workRecords,
    cancelledAt,
    (record) => record.projectId === project.id,
    'IMPROVEMENT_PROJECT_TERMINAL_BEFORE_WORK_RECORD',
    'ImprovementProject cancellation cannot predate existing WorkRecord history.',
  );

  const laterChildHistory = workItems.find((item) => {
    if (item.projectId !== project.id) return false;
    return (
      Date.parse(item.createdAt) > Date.parse(cancelledAt) ||
      (item.startedAt !== null &&
        Date.parse(item.startedAt) > Date.parse(cancelledAt)) ||
      (item.completedAt !== null &&
        Date.parse(item.completedAt) > Date.parse(cancelledAt))
    );
  });
  if (laterChildHistory) {
    throw new DomainError(
      'IMPROVEMENT_PROJECT_CANCELLED_BEFORE_WORK_ITEM_HISTORY',
      'ImprovementProject cancellation cannot predate existing WorkItem creation, start or completion history.',
    );
  }

  return {
    ...project,
    status: 'cancelled',
    cancelledAt,
    version: project.version + 1,
  };
}

export function createWorkItem(input: {
  readonly id: WorkItemId;
  readonly project: ImprovementProject;
  readonly code: string;
  readonly title: string;
  readonly description?: string | null;
  readonly createdAt: string;
  readonly createdByUserId: UserId;
}): WorkItem {
  if (
    input.project.status === 'completed' ||
    input.project.status === 'cancelled'
  ) {
    throw new DomainError(
      'WORK_ITEM_PROJECT_TERMINAL',
      'Cannot add WorkItem to a terminal ImprovementProject.',
    );
  }

  return {
    id: input.id,
    projectId: input.project.id,
    code: required(input.code, 'code'),
    title: required(input.title, 'title'),
    description: optional(input.description),
    status: 'planned',
    startedAt: null,
    completedAt: null,
    cancelledAt: null,
    version: 1,
    createdAt: instant(input.createdAt, 'createdAt'),
    createdByUserId: input.createdByUserId,
  };
}

export function updateWorkItemPlan(
  item: WorkItem,
  input: {
    readonly title?: string;
    readonly description?: string | null;
  },
): WorkItem {
  if (item.status !== 'planned') {
    throw new DomainError(
      'WORK_ITEM_PLAN_FROZEN',
      'WorkItem plan can only be corrected while planned.',
    );
  }

  const title =
    input.title === undefined ? item.title : required(input.title, 'title');
  const description =
    input.description === undefined
      ? item.description
      : optional(input.description);

  if (title === item.title && description === item.description) {
    return item;
  }

  return {
    ...item,
    title,
    description,
    version: item.version + 1,
  };
}

export function startWorkItem(
  item: WorkItem,
  project: ImprovementProject,
  startedAtValue: string,
): WorkItem {
  if (item.projectId !== project.id) {
    throw new DomainError(
      'WORK_ITEM_PROJECT_MISMATCH',
      'WorkItem does not belong to ImprovementProject.',
    );
  }
  if (project.status !== 'in_progress' || project.startedAt === null) {
    throw new DomainError(
      'WORK_ITEM_PROJECT_NOT_IN_PROGRESS',
      'WorkItem can start only while ImprovementProject is in progress.',
    );
  }
  if (item.status !== 'planned') {
    throw new DomainError(
      'WORK_ITEM_INVALID_TRANSITION',
      `Cannot start WorkItem from ${item.status}.`,
    );
  }

  const startedAt = instant(startedAtValue, 'startedAt');
  assertTimestampOrder(
    startedAt,
    project.startedAt,
    'startedAt',
    'project.startedAt',
  );

  return {
    ...item,
    status: 'in_progress',
    startedAt,
    version: item.version + 1,
  };
}

export function completeWorkItem(
  item: WorkItem,
  project: ImprovementProject,
  workRecords: readonly WorkRecord[],
  completedAtValue: string,
): WorkItem {
  if (item.projectId !== project.id) {
    throw new DomainError(
      'WORK_ITEM_PROJECT_MISMATCH',
      'WorkItem does not belong to ImprovementProject.',
    );
  }
  if (project.status !== 'in_progress') {
    throw new DomainError(
      'WORK_ITEM_PROJECT_NOT_IN_PROGRESS',
      'WorkItem can complete only while ImprovementProject is in progress.',
    );
  }
  if (item.status !== 'in_progress' || item.startedAt === null) {
    throw new DomainError(
      'WORK_ITEM_INVALID_TRANSITION',
      `Cannot complete WorkItem from ${item.status}.`,
    );
  }

  const completedAt = instant(completedAtValue, 'completedAt');
  assertTimestampOrder(
    completedAt,
    item.startedAt,
    'completedAt',
    'startedAt',
  );
  assertNoWorkRecordAfter(
    workRecords,
    completedAt,
    (record) => record.workItemId === item.id,
    'WORK_ITEM_TERMINAL_BEFORE_WORK_RECORD',
    'WorkItem completion cannot predate existing WorkRecord history.',
  );

  return {
    ...item,
    status: 'completed',
    completedAt,
    version: item.version + 1,
  };
}

export function cancelWorkItem(
  item: WorkItem,
  workRecords: readonly WorkRecord[],
  cancelledAtValue: string,
): WorkItem {
  if (item.status === 'completed' || item.status === 'cancelled') {
    throw new DomainError(
      'WORK_ITEM_TERMINAL',
      `WorkItem in status ${item.status} cannot transition.`,
    );
  }
  const cancelledAt = instant(cancelledAtValue, 'cancelledAt');
  const notBefore = item.startedAt ?? item.createdAt;
  assertTimestampOrder(
    cancelledAt,
    notBefore,
    'cancelledAt',
    item.startedAt === null ? 'createdAt' : 'startedAt',
  );
  assertNoWorkRecordAfter(
    workRecords,
    cancelledAt,
    (record) => record.workItemId === item.id,
    'WORK_ITEM_TERMINAL_BEFORE_WORK_RECORD',
    'WorkItem cancellation cannot predate existing WorkRecord history.',
  );

  return {
    ...item,
    status: 'cancelled',
    cancelledAt,
    version: item.version + 1,
  };
}

export function createWorkRecord(input: {
  readonly id: WorkRecordId;
  readonly project: ImprovementProject;
  readonly workItem: WorkItem;
  readonly contractorPartyId?: PartyId | null;
  readonly performedAt: string;
  readonly description: string;
  readonly reference?: string | null;
  readonly materials?: readonly {
    readonly id: WorkMaterialId;
    readonly name: string;
    readonly reference?: string | null;
    readonly quantity: string;
    readonly unit: WorkMaterialUnit;
    readonly notes?: string | null;
  }[];
  readonly assets?: readonly {
    readonly id: ProjectAssetId;
    readonly assetId: AssetId;
    readonly action: ProjectAssetAction;
    readonly notes?: string | null;
  }[];
  readonly recordedAt: string;
  readonly recordedByUserId: UserId;
}): WorkRecord {
  if (input.workItem.projectId !== input.project.id) {
    throw new DomainError(
      'WORK_RECORD_PROJECT_ITEM_MISMATCH',
      'WorkRecord WorkItem must belong to the same ImprovementProject.',
    );
  }

  const performedAt = instant(input.performedAt, 'performedAt');
  const recordedAt = instant(input.recordedAt, 'recordedAt');
  if (Date.parse(performedAt) > Date.parse(recordedAt)) {
    throw new DomainError(
      'WORK_RECORD_PERFORMED_IN_FUTURE',
      'WorkRecord performedAt cannot be after recordedAt.',
    );
  }

  if (input.project.startedAt === null || input.workItem.startedAt === null) {
    throw new DomainError(
      'WORK_RECORD_START_TIME_MISSING',
      'WorkRecord requires started Project and WorkItem occurrence boundaries.',
    );
  }

  const startBoundary = [input.project.startedAt, input.workItem.startedAt]
    .sort((left, right) => Date.parse(right) - Date.parse(left))[0]!;
  if (Date.parse(performedAt) < Date.parse(startBoundary)) {
    throw new DomainError(
      'WORK_RECORD_BEFORE_START_TIME',
      'WorkRecord performedAt cannot be before Project or WorkItem startedAt.',
    );
  }

  const terminalCutoff = [
    input.workItem.cancelledAt,
    input.workItem.completedAt,
    input.project.cancelledAt,
    input.project.completedAt,
  ]
    .filter((value): value is string => value !== null)
    .sort((left, right) => Date.parse(left) - Date.parse(right))[0] ?? null;
  if (
    terminalCutoff !== null &&
    Date.parse(performedAt) > Date.parse(terminalCutoff)
  ) {
    throw new DomainError(
      'WORK_RECORD_AFTER_TERMINAL_TIME',
      'WorkRecord performedAt cannot be after the WorkItem or Project terminal time.',
    );
  }

  const materialIds = new Set<WorkMaterialId>();
  const materials = (input.materials ?? []).map((material): WorkMaterial => {
    if (materialIds.has(material.id)) {
      throw new DomainError(
        'WORK_RECORD_DUPLICATE_MATERIAL',
        'WorkMaterial ids must be unique inside one WorkRecord.',
      );
    }
    materialIds.add(material.id);
    return {
      id: material.id,
      workRecordId: input.id,
      name: required(material.name, 'material.name'),
      reference: optional(material.reference),
      quantity: asWorkQuantity(material.quantity),
      unit: material.unit,
      notes: optional(material.notes),
    };
  });

  const assetIds = new Set<AssetId>();
  const projectAssets = (input.assets ?? []).map((asset): ProjectAsset => {
    if (assetIds.has(asset.assetId)) {
      throw new DomainError(
        'WORK_RECORD_DUPLICATE_ASSET',
        'One Asset can appear only once inside one WorkRecord.',
      );
    }
    assetIds.add(asset.assetId);
    return {
      id: asset.id,
      workRecordId: input.id,
      assetId: asset.assetId,
      action: asset.action,
      notes: optional(asset.notes),
    };
  });

  return {
    id: input.id,
    projectId: input.project.id,
    workItemId: input.workItem.id,
    contractorPartyId: input.contractorPartyId ?? null,
    performedAt,
    description: required(input.description, 'description'),
    reference: optional(input.reference),
    materials,
    assets: projectAssets,
    recordedAt,
    recordedByUserId: input.recordedByUserId,
  };
}
