import { DomainError } from '../shared/domain-error.js';
import { asInstant } from '../shared/instant.js';
import { asDateOnly, type DateOnly } from '../shared/date-only.js';
import type {
  InspectionFindingId,
  InspectionId,
  InspectionResponseId,
  InspectionSectionInstanceId,
  InspectionSchemaItemId,
  InspectionSchemaSectionId,
  InspectionSchemaVersionId,
  SpaceId,
  TenancyId,
  UnitId,
  UserId,
} from '../shared/entity-id.js';
import type {
  InspectionAnswerValue,
  InspectionCondition,
  InspectionSchemaItem,
  InspectionSchemaSection,
  InspectionSchemaVersion,
  InspectionSectionScope,
  InspectionType,
} from './inspection-schema.js';
import type { Space, SpaceType } from '../portfolio/space.js';

export const INSPECTION_STATUSES = [
  'draft',
  'in_progress',
  'locked',
  'finalized',
  'cancelled',
] as const;

export const INSPECTION_FINDING_SEVERITIES = [
  'info',
  'minor',
  'major',
  'critical',
] as const;

export type InspectionStatus = (typeof INSPECTION_STATUSES)[number];
export type InspectionFindingSeverity =
  (typeof INSPECTION_FINDING_SEVERITIES)[number];

export interface Inspection {
  readonly id: InspectionId;
  readonly code: string;
  readonly inspectionType: InspectionType;
  readonly unitId: UnitId;
  readonly tenancyId: TenancyId | null;
  readonly schemaVersionId: InspectionSchemaVersionId;
  readonly assignedToUserId: UserId;
  readonly createdByUserId: UserId;
  readonly scheduledFor: DateOnly | null;
  readonly status: InspectionStatus;
  readonly startedAt: string | null;
  readonly lockedAt: string | null;
  readonly finalizedAt: string | null;
  readonly cancelledAt: string | null;
  readonly version: number;
  readonly contentRevision: number;
}

export interface InspectionSectionInstance {
  readonly id: InspectionSectionInstanceId;
  readonly inspectionId: InspectionId;
  readonly sectionId: InspectionSchemaSectionId;
  readonly scope: InspectionSectionScope;
  readonly spaceId: SpaceId | null;
  readonly spaceCode: string | null;
  readonly spaceName: string | null;
  readonly spaceType: SpaceType | null;
  readonly spaceSortOrder: number | null;
}

export function createInspectionSectionInstance(
  inspection: Inspection,
  section: InspectionSchemaSection,
  input: {
    readonly id: InspectionSectionInstanceId;
    readonly space?: Space | null;
  },
): InspectionSectionInstance {
  const space = input.space ?? null;

  if (section.scope === 'unit') {
    if (space !== null) {
      throw new DomainError(
        'INSPECTION_UNIT_SECTION_SPACE_FORBIDDEN',
        'Unit-scoped inspection sections cannot bind a Space.',
      );
    }
    return {
      id: input.id,
      inspectionId: inspection.id,
      sectionId: section.id,
      scope: 'unit',
      spaceId: null,
      spaceCode: null,
      spaceName: null,
      spaceType: null,
      spaceSortOrder: null,
    };
  }

  if (space === null) {
    throw new DomainError(
      'INSPECTION_SPACE_SECTION_SPACE_REQUIRED',
      'Space-scoped inspection sections require a Space.',
    );
  }
  if (!space.active) {
    throw new DomainError(
      'INSPECTION_SPACE_SECTION_INACTIVE_SPACE',
      'Space-scoped inspection sections require an active Space.',
    );
  }
  if (space.unitId !== inspection.unitId) {
    throw new DomainError(
      'INSPECTION_SPACE_SECTION_UNIT_MISMATCH',
      'Inspection section Space must belong to the inspection Unit.',
    );
  }
  if (!section.spaceTypes.includes(space.spaceType)) {
    throw new DomainError(
      'INSPECTION_SPACE_SECTION_TYPE_MISMATCH',
      'Inspection section does not apply to this Space type.',
    );
  }

  return {
    id: input.id,
    inspectionId: inspection.id,
    sectionId: section.id,
    scope: 'space',
    spaceId: space.id,
    spaceCode: space.code,
    spaceName: space.name,
    spaceType: space.spaceType,
    spaceSortOrder: space.sortOrder,
  };
}

export interface InspectionSectionState {
  readonly inspectionId: InspectionId;
  readonly sectionInstanceId: InspectionSectionInstanceId;
  readonly sectionId: InspectionSchemaSectionId;
  readonly revision: number;
}

export interface InspectionResponse {
  readonly id: InspectionResponseId;
  readonly inspectionId: InspectionId;
  readonly sectionInstanceId: InspectionSectionInstanceId;
  readonly sectionId: InspectionSchemaSectionId;
  readonly itemId: InspectionSchemaItemId;
  readonly value: InspectionAnswerValue;
  readonly comment: string | null;
  readonly updatedByUserId: UserId;
  readonly updatedAt: string;
}

export interface InspectionFinding {
  readonly id: InspectionFindingId;
  readonly inspectionId: InspectionId;
  readonly sectionInstanceId: InspectionSectionInstanceId;
  readonly sectionId: InspectionSchemaSectionId;
  readonly itemId: InspectionSchemaItemId | null;
  readonly severity: InspectionFindingSeverity;
  readonly title: string;
  readonly description: string | null;
  readonly createdByUserId: UserId;
  readonly createdAt: string;
}

export interface CreateInspectionInput {
  readonly id: InspectionId;
  readonly code: string;
  readonly inspectionType: InspectionType;
  readonly unitId: UnitId;
  readonly tenancyId?: TenancyId | null;
  readonly schemaVersionId: InspectionSchemaVersionId;
  readonly assignedToUserId: UserId;
  readonly createdByUserId: UserId;
  readonly scheduledFor?: string | null;
}

export interface CreateInspectionResponseInput {
  readonly id: InspectionResponseId;
  readonly inspectionId: InspectionId;
  readonly sectionInstanceId: InspectionSectionInstanceId;
  readonly item: InspectionSchemaItem;
  readonly value: InspectionAnswerValue;
  readonly comment?: string | null;
  readonly updatedByUserId: UserId;
  readonly updatedAt: string;
}

function required(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new DomainError(
      'INSPECTION_REQUIRED_FIELD',
      `${field} is required.`,
    );
  }
  return normalized;
}

function instant(value: string, field: string): string {
  return asInstant(value, field, 'INSPECTION_INVALID_TIMESTAMP');
}

export function createInspection(input: CreateInspectionInput): Inspection {
  return {
    id: input.id,
    code: required(input.code, 'code'),
    inspectionType: input.inspectionType,
    unitId: input.unitId,
    tenancyId: input.tenancyId ?? null,
    schemaVersionId: input.schemaVersionId,
    assignedToUserId: input.assignedToUserId,
    createdByUserId: input.createdByUserId,
    scheduledFor:
      input.scheduledFor === undefined || input.scheduledFor === null
        ? null
        : asDateOnly(input.scheduledFor),
    status: 'draft',
    startedAt: null,
    lockedAt: null,
    finalizedAt: null,
    cancelledAt: null,
    version: 1,
    contentRevision: 0,
  };
}

export function updateInspectionOrchestration(
  inspection: Inspection,
  input: {
    readonly assignedToUserId: UserId;
    readonly scheduledFor: string | null;
  },
): Inspection {
  if (inspection.status !== 'draft') {
    throw new DomainError(
      'INSPECTION_ORCHESTRATION_LOCKED',
      'Assignment and schedule can only change while the inspection is draft.',
    );
  }

  return {
    ...inspection,
    assignedToUserId: input.assignedToUserId,
    scheduledFor:
      input.scheduledFor === null ? null : asDateOnly(input.scheduledFor),
    version: inspection.version + 1,
  };
}

export function startInspection(
  inspection: Inspection,
  startedAtValue: string,
): Inspection {
  if (inspection.status !== 'draft') {
    throw new DomainError(
      'INSPECTION_INVALID_TRANSITION',
      'Only a draft inspection can be started.',
    );
  }
  return {
    ...inspection,
    status: 'in_progress',
    startedAt: instant(startedAtValue, 'startedAt'),
    version: inspection.version + 1,
  };
}

export function lockInspection(
  inspection: Inspection,
  lockedAtValue: string,
): Inspection {
  if (inspection.status !== 'in_progress') {
    throw new DomainError(
      'INSPECTION_INVALID_TRANSITION',
      'Only an in-progress inspection can be locked.',
    );
  }
  return {
    ...inspection,
    status: 'locked',
    lockedAt: instant(lockedAtValue, 'lockedAt'),
    version: inspection.version + 1,
  };
}

export function unlockInspection(
  inspection: Inspection,
): Inspection {
  if (inspection.status !== 'locked') {
    throw new DomainError(
      'INSPECTION_INVALID_TRANSITION',
      'Only a locked inspection can be unlocked.',
    );
  }
  return {
    ...inspection,
    status: 'in_progress',
    lockedAt: null,
    version: inspection.version + 1,
    contentRevision: inspection.contentRevision + 1,
  };
}

export function finalizeInspection(
  inspection: Inspection,
  finalizedAtValue: string,
): Inspection {
  if (inspection.status !== 'locked') {
    throw new DomainError(
      'INSPECTION_INVALID_TRANSITION',
      'Only a locked inspection can be finalized.',
    );
  }
  return {
    ...inspection,
    status: 'finalized',
    finalizedAt: instant(finalizedAtValue, 'finalizedAt'),
    version: inspection.version + 1,
  };
}

export function cancelInspection(
  inspection: Inspection,
  cancelledAtValue: string,
): Inspection {
  if (!['draft', 'in_progress'].includes(inspection.status)) {
    throw new DomainError(
      'INSPECTION_INVALID_TRANSITION',
      'Only a draft or in-progress inspection can be cancelled.',
    );
  }
  return {
    ...inspection,
    status: 'cancelled',
    cancelledAt: instant(cancelledAtValue, 'cancelledAt'),
    version: inspection.version + 1,
  };
}

export function assertInspectionContentEditable(inspection: Inspection): void {
  if (!['draft', 'in_progress'].includes(inspection.status)) {
    throw new DomainError(
      'INSPECTION_CONTENT_LOCKED',
      'Inspection content is no longer editable.',
    );
  }
}

function validDecimal(value: string): boolean {
  return /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value.trim());
}

function optionValues(item: InspectionSchemaItem): ReadonlySet<string> {
  return new Set(item.options.map((option) => option.value));
}

export function validateInspectionAnswer(
  item: InspectionSchemaItem,
  value: InspectionAnswerValue,
): InspectionAnswerValue {
  switch (item.type) {
    case 'checkbox':
      if (typeof value !== 'boolean') {
        throw new DomainError(
          'INSPECTION_RESPONSE_TYPE_MISMATCH',
          `Item '${item.key}' requires a boolean answer.`,
        );
      }
      return value;

    case 'multiselect': {
      if (!Array.isArray(value)) {
        throw new DomainError(
          'INSPECTION_RESPONSE_TYPE_MISMATCH',
          `Item '${item.key}' requires an array answer.`,
        );
      }
      const allowed = optionValues(item);
      if (value.some((entry) => typeof entry !== 'string' || !allowed.has(entry))) {
        throw new DomainError(
          'INSPECTION_RESPONSE_INVALID_OPTION',
          `Item '${item.key}' contains an invalid option.`,
        );
      }
      if (new Set(value).size !== value.length) {
        throw new DomainError(
          'INSPECTION_RESPONSE_DUPLICATE_OPTION',
          `Item '${item.key}' cannot repeat an option.`,
        );
      }
      return [...value];
    }

    case 'select':
    case 'radio': {
      if (typeof value !== 'string' || !optionValues(item).has(value)) {
        throw new DomainError(
          'INSPECTION_RESPONSE_INVALID_OPTION',
          `Item '${item.key}' requires one configured option.`,
        );
      }
      return value;
    }

    case 'number':
      if (typeof value !== 'string' || !validDecimal(value)) {
        throw new DomainError(
          'INSPECTION_RESPONSE_TYPE_MISMATCH',
          `Item '${item.key}' requires a canonical decimal string.`,
        );
      }
      return value.trim();

    case 'date':
      if (typeof value !== 'string') {
        throw new DomainError(
          'INSPECTION_RESPONSE_TYPE_MISMATCH',
          `Item '${item.key}' requires a date string.`,
        );
      }
      return asDateOnly(value);

    case 'text':
    case 'textarea':
      if (typeof value !== 'string') {
        throw new DomainError(
          'INSPECTION_RESPONSE_TYPE_MISMATCH',
          `Item '${item.key}' requires a string answer.`,
        );
      }
      return value;
  }
}

export function createInspectionResponse(
  input: CreateInspectionResponseInput,
): InspectionResponse {
  return {
    id: input.id,
    inspectionId: input.inspectionId,
    sectionInstanceId: input.sectionInstanceId,
    sectionId: input.item.sectionId,
    itemId: input.item.id,
    value: validateInspectionAnswer(input.item, input.value),
    comment:
      input.comment === undefined || input.comment === null
        ? null
        : input.comment.trim() || null,
    updatedByUserId: input.updatedByUserId,
    updatedAt: instant(input.updatedAt, 'updatedAt'),
  };
}

function scalarForCondition(
  value: InspectionAnswerValue | undefined,
): InspectionScalarConditionValue {
  return value;
}

type InspectionScalarConditionValue =
  | InspectionAnswerValue
  | undefined;

function isTruthy(value: InspectionScalarConditionValue): boolean {
  if (value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'boolean') return value;
  return value.length > 0;
}

function equality(
  actual: InspectionScalarConditionValue,
  expected: unknown,
): boolean {
  if (Array.isArray(actual)) {
    return actual.some((value) => value === expected);
  }
  return actual === expected;
}

export function evaluateInspectionCondition(
  condition: InspectionCondition,
  valuesByFieldKey: ReadonlyMap<string, InspectionAnswerValue>,
): boolean {
  if ('all' in condition) {
    return condition.all.every((nested) =>
      evaluateInspectionCondition(nested, valuesByFieldKey),
    );
  }
  if ('any' in condition) {
    return condition.any.some((nested) =>
      evaluateInspectionCondition(nested, valuesByFieldKey),
    );
  }

  const actual = scalarForCondition(
    valuesByFieldKey.get(condition.fieldKey.toLowerCase()),
  );

  switch (condition.operator) {
    case 'truthy':
      return isTruthy(actual);
    case 'falsy':
      return !isTruthy(actual);
    case 'equals':
      return equality(actual, condition.value);
    case 'notEquals':
      return !equality(actual, condition.value);
    case 'in':
      return Array.isArray(condition.value)
        ? condition.value.some((expected) => equality(actual, expected))
        : false;
    case 'notIn':
      return Array.isArray(condition.value)
        ? !condition.value.some((expected) => equality(actual, expected))
        : false;
  }
}

function answered(value: InspectionAnswerValue | undefined): boolean {
  if (value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'boolean') return true;
  return value.length > 0;
}

export interface MissingInspectionItem {
  readonly sectionInstanceId: InspectionSectionInstanceId;
  readonly sectionId: InspectionSchemaSectionId;
  readonly itemId: InspectionSchemaItemId;
  readonly itemKey: string;
  readonly label: string;
}

export function inspectionValuesByFieldKeyForInstance(
  schema: InspectionSchemaVersion,
  sectionInstances: readonly InspectionSectionInstance[],
  responses: readonly InspectionResponse[],
  targetInstance: InspectionSectionInstance,
): ReadonlyMap<string, InspectionAnswerValue> {
  const sectionById = new Map(
    schema.sections.map((section) => [section.id, section] as const),
  );
  const itemById = new Map(
    schema.sections.flatMap((section) =>
      section.items.map((item) => [item.id, item] as const),
    ),
  );
  const instanceById = new Map(
    sectionInstances.map((instance) => [instance.id, instance] as const),
  );
  const values = new Map<string, InspectionAnswerValue>();

  for (const response of responses) {
    const sourceInstance = instanceById.get(response.sectionInstanceId);
    const item = itemById.get(response.itemId);
    if (!sourceInstance || !item) continue;
    if (sourceInstance.sectionId !== response.sectionId) continue;
    const sourceSection = sectionById.get(sourceInstance.sectionId);
    if (!sourceSection || item.sectionId !== sourceSection.id) continue;

    const sameInstance = sourceInstance.id === targetInstance.id;
    const unitContext = sourceInstance.scope === 'unit';
    const sameSpaceContext =
      targetInstance.spaceId !== null &&
      sourceInstance.spaceId === targetInstance.spaceId;

    if (sameInstance || unitContext || sameSpaceContext) {
      values.set(item.key.toLowerCase(), response.value);
    }
  }

  return values;
}

export function findMissingRequiredInspectionItems(
  schema: InspectionSchemaVersion,
  sectionInstances: readonly InspectionSectionInstance[],
  responses: readonly InspectionResponse[],
): readonly MissingInspectionItem[] {
  const sectionById = new Map(
    schema.sections.map((section) => [section.id, section] as const),
  );

  const missing: MissingInspectionItem[] = [];
  for (const instance of sectionInstances) {
    const section = sectionById.get(instance.sectionId);
    if (!section) {
      throw new DomainError(
        'INSPECTION_SECTION_INSTANCE_SCHEMA_MISMATCH',
        'Inspection section instance references a missing schema section.',
      );
    }
    const valuesByFieldKey = inspectionValuesByFieldKeyForInstance(
      schema,
      sectionInstances,
      responses,
      instance,
    );

    for (const item of section.items) {
      const visible =
        item.visibleWhen === null ||
        evaluateInspectionCondition(item.visibleWhen, valuesByFieldKey);
      if (!visible) continue;

      const required =
        item.required ||
        (item.requiredWhen !== null &&
          evaluateInspectionCondition(item.requiredWhen, valuesByFieldKey));
      if (!required) continue;

      if (!answered(valuesByFieldKey.get(item.key.toLowerCase()))) {
        missing.push({
          sectionInstanceId: instance.id,
          sectionId: section.id,
          itemId: item.id,
          itemKey: item.key,
          label: item.label,
        });
      }
    }
  }
  return missing;
}

export interface CreateInspectionFindingInput {
  readonly id: InspectionFindingId;
  readonly inspectionId: InspectionId;
  readonly sectionInstanceId: InspectionSectionInstanceId;
  readonly sectionId: InspectionSchemaSectionId;
  readonly itemId?: InspectionSchemaItemId | null;
  readonly severity: InspectionFindingSeverity;
  readonly title: string;
  readonly description?: string | null;
  readonly createdByUserId: UserId;
  readonly createdAt: string;
}

export function createInspectionFinding(
  inspection: Inspection,
  input: CreateInspectionFindingInput,
): InspectionFinding {
  assertInspectionContentEditable(inspection);
  return {
    id: input.id,
    inspectionId: input.inspectionId,
    sectionInstanceId: input.sectionInstanceId,
    sectionId: input.sectionId,
    itemId: input.itemId ?? null,
    severity: input.severity,
    title: required(input.title, 'finding.title'),
    description:
      input.description === undefined || input.description === null
        ? null
        : input.description.trim() || null,
    createdByUserId: input.createdByUserId,
    createdAt: instant(input.createdAt, 'createdAt'),
  };
}
