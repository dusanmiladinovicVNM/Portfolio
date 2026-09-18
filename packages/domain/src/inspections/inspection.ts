import { DomainError } from '../shared/domain-error.js';
import { asDateOnly, type DateOnly } from '../shared/date-only.js';
import type {
  InspectionFindingId,
  InspectionId,
  InspectionResponseId,
  InspectionSchemaItemId,
  InspectionSchemaSectionId,
  InspectionSchemaVersionId,
  TenancyId,
  UnitId,
  UserId,
} from '../shared/entity-id.js';
import type {
  InspectionAnswerValue,
  InspectionCondition,
  InspectionSchemaItem,
  InspectionSchemaVersion,
  InspectionType,
} from './inspection-schema.js';

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

export interface InspectionSectionState {
  readonly inspectionId: InspectionId;
  readonly sectionId: InspectionSchemaSectionId;
  readonly revision: number;
}

export interface InspectionResponse {
  readonly id: InspectionResponseId;
  readonly inspectionId: InspectionId;
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
  if (!/^\d{4}-\d{2}-\d{2}T/.test(value) || Number.isNaN(Date.parse(value))) {
    throw new DomainError(
      'INSPECTION_INVALID_TIMESTAMP',
      `${field} must be a valid ISO timestamp.`,
    );
  }
  return value;
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
  readonly sectionId: InspectionSchemaSectionId;
  readonly itemId: InspectionSchemaItemId;
  readonly itemKey: string;
  readonly label: string;
}

export function findMissingRequiredInspectionItems(
  schema: InspectionSchemaVersion,
  responses: readonly InspectionResponse[],
): readonly MissingInspectionItem[] {
  const itemById = new Map(
    schema.sections.flatMap((section) =>
      section.items.map((item) => [item.id, item] as const),
    ),
  );

  const valuesByFieldKey = new Map<string, InspectionAnswerValue>();
  for (const response of responses) {
    const item = itemById.get(response.itemId);
    if (item) valuesByFieldKey.set(item.key.toLowerCase(), response.value);
  }

  const missing: MissingInspectionItem[] = [];
  for (const section of schema.sections) {
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
