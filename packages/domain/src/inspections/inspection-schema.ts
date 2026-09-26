import { DomainError } from '../shared/domain-error.js';
import { SPACE_TYPES, type SpaceType } from '../portfolio/space.js';
import type {
  InspectionSchemaItemId,
  InspectionSchemaSectionId,
  InspectionSchemaVersionId,
} from '../shared/entity-id.js';

export const INSPECTION_TYPES = [
  'move_in',
  'move_out',
  'periodic',
  'damage_report',
  'key_handover',
  'other',
] as const;

export const INSPECTION_SCHEMA_STATUSES = [
  'draft',
  'published',
  'retired',
] as const;

export const INSPECTION_ITEM_TYPES = [
  'text',
  'textarea',
  'number',
  'date',
  'checkbox',
  'select',
  'multiselect',
  'radio',
] as const;

export const INSPECTION_SECTION_SCOPES = ['unit', 'space'] as const;

export const INSPECTION_SIGNATURE_ROLES = [
  'landlord',
  'tenant',
  'witness',
  'agent',
] as const;

export const INSPECTION_CONDITION_OPERATORS = [
  'equals',
  'notEquals',
  'in',
  'notIn',
  'truthy',
  'falsy',
] as const;

export type InspectionType = (typeof INSPECTION_TYPES)[number];
export type InspectionSchemaStatus =
  (typeof INSPECTION_SCHEMA_STATUSES)[number];
export type InspectionItemType = (typeof INSPECTION_ITEM_TYPES)[number];
export type InspectionSectionScope = (typeof INSPECTION_SECTION_SCOPES)[number];
export type InspectionSignatureRole =
  (typeof INSPECTION_SIGNATURE_ROLES)[number];
export type InspectionConditionOperator =
  (typeof INSPECTION_CONDITION_OPERATORS)[number];
export type InspectionScalarValue = string | boolean;
export type InspectionAnswerValue =
  | InspectionScalarValue
  | readonly string[];

export interface InspectionOption {
  readonly value: string;
  readonly label: string;
}

export interface InspectionConditionLeaf {
  readonly fieldKey: string;
  readonly operator: InspectionConditionOperator;
  readonly value?:
    | InspectionScalarValue
    | readonly InspectionScalarValue[]
    | undefined;
}

export type InspectionCondition =
  | InspectionConditionLeaf
  | { readonly all: readonly InspectionCondition[] }
  | { readonly any: readonly InspectionCondition[] };

export interface InspectionConditionSourceField {
  readonly key: string;
  readonly type: InspectionItemType;
  readonly options: readonly InspectionOption[];
}

export interface InspectionSchemaItem {
  readonly id: InspectionSchemaItemId;
  readonly sectionId: InspectionSchemaSectionId;
  readonly key: string;
  readonly type: InspectionItemType;
  readonly label: string;
  readonly required: boolean;
  readonly sortOrder: number;
  readonly options: readonly InspectionOption[];
  readonly visibleWhen: InspectionCondition | null;
  readonly requiredWhen: InspectionCondition | null;
}

export interface InspectionSchemaSection {
  readonly id: InspectionSchemaSectionId;
  readonly key: string;
  readonly title: string;
  readonly description: string | null;
  readonly sortOrder: number;
  readonly scope: InspectionSectionScope;
  readonly spaceTypes: readonly SpaceType[];
  readonly items: readonly InspectionSchemaItem[];
}

export interface InspectionSchemaVersion {
  readonly id: InspectionSchemaVersionId;
  readonly schemaCode: string;
  readonly versionNumber: number;
  readonly inspectionType: InspectionType;
  readonly title: string;
  readonly status: InspectionSchemaStatus;
  readonly requiredSignatureRoles: readonly InspectionSignatureRole[];
  readonly sections: readonly InspectionSchemaSection[];
}

export interface CreateInspectionSchemaVersionInput {
  readonly id: InspectionSchemaVersionId;
  readonly schemaCode: string;
  readonly versionNumber: number;
  readonly inspectionType: InspectionType;
  readonly title: string;
  readonly requiredSignatureRoles?: readonly InspectionSignatureRole[];
  readonly sections: readonly {
    readonly id: InspectionSchemaSectionId;
    readonly key: string;
    readonly title: string;
    readonly description?: string | null;
    readonly sortOrder: number;
    readonly scope?: InspectionSectionScope;
    readonly spaceTypes?: readonly SpaceType[];
    readonly items: readonly {
      readonly id: InspectionSchemaItemId;
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

function requiredText(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new DomainError(
      'INSPECTION_SCHEMA_REQUIRED_FIELD',
      `${field} is required.`,
    );
  }
  return normalized;
}

function assertNonnegativeInteger(value: number, field: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new DomainError(
      'INSPECTION_SCHEMA_INVALID_SORT_ORDER',
      `${field} must be a non-negative integer.`,
    );
  }
}

function assertUnique(
  values: readonly string[],
  code: string,
  message: string,
): void {
  const normalized = values.map((value) => value.toLowerCase());
  if (new Set(normalized).size !== normalized.length) {
    throw new DomainError(code, message);
  }
}

function validateCondition(
  condition: InspectionCondition,
  knownFieldKeys: ReadonlySet<string>,
): void {
  if ('all' in condition) {
    if (condition.all.length === 0) {
      throw new DomainError(
        'INSPECTION_SCHEMA_INVALID_CONDITION',
        'Condition all[] cannot be empty.',
      );
    }
    condition.all.forEach((nested) => validateCondition(nested, knownFieldKeys));
    return;
  }

  if ('any' in condition) {
    if (condition.any.length === 0) {
      throw new DomainError(
        'INSPECTION_SCHEMA_INVALID_CONDITION',
        'Condition any[] cannot be empty.',
      );
    }
    condition.any.forEach((nested) => validateCondition(nested, knownFieldKeys));
    return;
  }

  const fieldKey = requiredText(condition.fieldKey, 'condition.fieldKey');
  if (!knownFieldKeys.has(fieldKey.toLowerCase())) {
    throw new DomainError(
      'INSPECTION_SCHEMA_UNKNOWN_CONDITION_FIELD',
      `Condition references unknown field '${fieldKey}'.`,
    );
  }

  const requiresValue = !['truthy', 'falsy'].includes(condition.operator);
  if (requiresValue && condition.value === undefined) {
    throw new DomainError(
      'INSPECTION_SCHEMA_INVALID_CONDITION',
      `Operator '${condition.operator}' requires a value.`,
    );
  }
}

function validateOptions(
  itemType: InspectionItemType,
  options: readonly InspectionOption[],
): readonly InspectionOption[] {
  const normalized = options.map((option) => ({
    value: requiredText(option.value, 'option.value'),
    label: requiredText(option.label, 'option.label'),
  }));

  if (['select', 'multiselect', 'radio'].includes(itemType)) {
    if (normalized.length === 0) {
      throw new DomainError(
        'INSPECTION_SCHEMA_OPTIONS_REQUIRED',
        `Item type '${itemType}' requires options.`,
      );
    }
  } else if (normalized.length > 0) {
    throw new DomainError(
      'INSPECTION_SCHEMA_OPTIONS_NOT_ALLOWED',
      `Item type '${itemType}' cannot define options.`,
    );
  }

  assertUnique(
    normalized.map((option) => option.value),
    'INSPECTION_SCHEMA_DUPLICATE_OPTION',
    'Option values must be unique inside an item.',
  );

  return normalized;
}

function invalidConditionValue(
  source: InspectionConditionSourceField,
  condition: InspectionConditionLeaf,
  detail: string,
): never {
  throw new DomainError(
    'INSPECTION_SCHEMA_CONDITION_VALUE_INVALID',
    `Condition on field '${source.key}' with operator '${condition.operator}' ${detail}`,
  );
}

function assertConditionScalarCompatible(
  source: InspectionConditionSourceField,
  condition: InspectionConditionLeaf,
  value: InspectionScalarValue,
): void {
  if (source.type === 'checkbox') {
    if (typeof value !== 'boolean') {
      invalidConditionValue(
        source,
        condition,
        'requires boolean condition values.',
      );
    }
    return;
  }

  if (typeof value !== 'string') {
    invalidConditionValue(
      source,
      condition,
      'requires string condition values.',
    );
  }

  if (['select', 'radio', 'multiselect'].includes(source.type)) {
    const allowed = new Set(source.options.map((option) => option.value));
    if (!allowed.has(value)) {
      invalidConditionValue(
        source,
        condition,
        `references option '${value}' that is not configured on the source field.`,
      );
    }
  }
}

export function assertInspectionConditionLeafValueCompatible(
  condition: InspectionConditionLeaf,
  source: InspectionConditionSourceField,
): void {
  if (['truthy', 'falsy'].includes(condition.operator)) {
    if (condition.value !== undefined) {
      invalidConditionValue(
        source,
        condition,
        'does not accept an explicit value.',
      );
    }
    return;
  }

  if (condition.value === undefined) {
    invalidConditionValue(source, condition, 'requires a value.');
  }

  if (['in', 'notIn'].includes(condition.operator)) {
    if (!Array.isArray(condition.value)) {
      invalidConditionValue(
        source,
        condition,
        'requires an array of condition values.',
      );
    }
    for (const value of condition.value) {
      assertConditionScalarCompatible(source, condition, value);
    }
    return;
  }

  if (Array.isArray(condition.value)) {
    invalidConditionValue(
      source,
      condition,
      'requires one scalar condition value.',
    );
  }
  assertConditionScalarCompatible(source, condition, condition.value);
}

export function createInspectionSchemaVersion(
  input: CreateInspectionSchemaVersionInput,
): InspectionSchemaVersion {
  if (!Number.isInteger(input.versionNumber) || input.versionNumber < 1) {
    throw new DomainError(
      'INSPECTION_SCHEMA_INVALID_VERSION',
      'Schema version number must be a positive integer.',
    );
  }

  if (input.sections.length === 0) {
    throw new DomainError(
      'INSPECTION_SCHEMA_SECTIONS_REQUIRED',
      'Inspection schema must contain at least one section.',
    );
  }

  const sectionKeys = input.sections.map((section) =>
    requiredText(section.key, 'section.key'),
  );
  assertUnique(
    sectionKeys,
    'INSPECTION_SCHEMA_DUPLICATE_SECTION_KEY',
    'Section keys must be unique inside a schema version.',
  );

  const allItemKeys = input.sections.flatMap((section) =>
    section.items.map((item) => requiredText(item.key, 'item.key')),
  );
  if (allItemKeys.length === 0) {
    throw new DomainError(
      'INSPECTION_SCHEMA_ITEMS_REQUIRED',
      'Inspection schema must contain at least one item.',
    );
  }
  assertUnique(
    allItemKeys,
    'INSPECTION_SCHEMA_DUPLICATE_ITEM_KEY',
    'Item keys must be globally unique inside a schema version.',
  );

  const knownFieldKeys = new Set(allItemKeys.map((key) => key.toLowerCase()));
  const requiredSignatureRoles = [...(input.requiredSignatureRoles ?? [])];
  if (new Set(requiredSignatureRoles).size !== requiredSignatureRoles.length) {
    throw new DomainError(
      'INSPECTION_SCHEMA_DUPLICATE_SIGNATURE_ROLE',
      'Required signature roles must be unique.',
    );
  }

  const sections = input.sections.map((section) => {
    assertNonnegativeInteger(section.sortOrder, 'section.sortOrder');
    const scope = section.scope ?? 'unit';
    const spaceTypes = [...(section.spaceTypes ?? [])];
    if (scope === 'unit' && spaceTypes.length > 0) {
      throw new DomainError(
        'INSPECTION_SCHEMA_UNIT_SECTION_SPACE_TYPES_FORBIDDEN',
        `Unit section '${section.key}' cannot declare Space types.`,
      );
    }
    if (scope === 'space' && spaceTypes.length === 0) {
      throw new DomainError(
        'INSPECTION_SCHEMA_SPACE_SECTION_TYPES_REQUIRED',
        `Space section '${section.key}' must declare at least one Space type.`,
      );
    }
    if (
      new Set(spaceTypes).size !== spaceTypes.length ||
      spaceTypes.some((spaceType) => !SPACE_TYPES.includes(spaceType))
    ) {
      throw new DomainError(
        'INSPECTION_SCHEMA_SPACE_TYPES_INVALID',
        `Space section '${section.key}' contains invalid or duplicate Space types.`,
      );
    }
    if (section.items.length === 0) {
      throw new DomainError(
        'INSPECTION_SCHEMA_SECTION_ITEMS_REQUIRED',
        `Section '${section.key}' must contain at least one item.`,
      );
    }

    const items = section.items.map((item) => {
      assertNonnegativeInteger(item.sortOrder, 'item.sortOrder');
      const options = validateOptions(item.type, item.options ?? []);
      const visibleWhen = item.visibleWhen ?? null;
      const requiredWhen = item.requiredWhen ?? null;
      if (visibleWhen) validateCondition(visibleWhen, knownFieldKeys);
      if (requiredWhen) validateCondition(requiredWhen, knownFieldKeys);

      return {
        id: item.id,
        sectionId: section.id,
        key: requiredText(item.key, 'item.key'),
        type: item.type,
        label: requiredText(item.label, 'item.label'),
        required: item.required ?? false,
        sortOrder: item.sortOrder,
        options,
        visibleWhen,
        requiredWhen,
      };
    });

    return {
      id: section.id,
      key: requiredText(section.key, 'section.key'),
      title: requiredText(section.title, 'section.title'),
      description:
        section.description === undefined || section.description === null
          ? null
          : requiredText(section.description, 'section.description'),
      sortOrder: section.sortOrder,
      scope,
      spaceTypes,
      items,
    };
  });

  assertUnique(
    sections.map((section) => String(section.sortOrder)),
    'INSPECTION_SCHEMA_DUPLICATE_SECTION_ORDER',
    'Section sortOrder values must be unique.',
  );
  sections.forEach((section) =>
    assertUnique(
      section.items.map((item) => String(item.sortOrder)),
      'INSPECTION_SCHEMA_DUPLICATE_ITEM_ORDER',
      `Item sortOrder values must be unique in section '${section.key}'.`,
    ),
  );

  const fieldContext = new Map(
    sections.flatMap((section) =>
      section.items.map((item) => [
        item.key.toLowerCase(),
        {
          scope: section.scope,
          spaceTypes: section.spaceTypes,
          item,
        },
      ] as const),
    ),
  );

  const assertConditionContext = (
    section: InspectionSchemaSection,
    condition: InspectionCondition | null,
  ): void => {
    if (condition === null) return;
    if ('all' in condition) {
      condition.all.forEach((child) => assertConditionContext(section, child));
      return;
    }
    if ('any' in condition) {
      condition.any.forEach((child) => assertConditionContext(section, child));
      return;
    }

    const source = fieldContext.get(condition.fieldKey.toLowerCase());
    if (!source) return;

    assertInspectionConditionLeafValueCompatible(condition, source.item);

    if (section.scope === 'unit' && source.scope === 'space') {
      throw new DomainError(
        'INSPECTION_SCHEMA_CONDITION_CONTEXT_INVALID',
        `Unit section '${section.key}' cannot depend on Space field '${condition.fieldKey}'.`,
      );
    }

    if (section.scope === 'space' && source.scope === 'space') {
      const sourceTypes = new Set(source.spaceTypes);
      if (section.spaceTypes.some((spaceType) => !sourceTypes.has(spaceType))) {
        throw new DomainError(
          'INSPECTION_SCHEMA_CONDITION_CONTEXT_INVALID',
          `Space section '${section.key}' depends on field '${condition.fieldKey}' that is not available for every target Space type.`,
        );
      }
    }
  };

  for (const section of sections) {
    for (const item of section.items) {
      assertConditionContext(section, item.visibleWhen);
      assertConditionContext(section, item.requiredWhen);
    }
  }

  return {
    id: input.id,
    schemaCode: requiredText(input.schemaCode, 'schemaCode'),
    versionNumber: input.versionNumber,
    inspectionType: input.inspectionType,
    title: requiredText(input.title, 'title'),
    status: 'draft',
    requiredSignatureRoles,
    sections,
  };
}

export function publishInspectionSchemaVersion(
  schema: InspectionSchemaVersion,
): InspectionSchemaVersion {
  if (schema.status !== 'draft') {
    throw new DomainError(
      'INSPECTION_SCHEMA_INVALID_TRANSITION',
      'Only a draft schema version can be published.',
    );
  }
  return { ...schema, status: 'published' };
}

export function retireInspectionSchemaVersion(
  schema: InspectionSchemaVersion,
): InspectionSchemaVersion {
  if (schema.status !== 'published') {
    throw new DomainError(
      'INSPECTION_SCHEMA_INVALID_TRANSITION',
      'Only a published schema version can be retired.',
    );
  }
  return { ...schema, status: 'retired' };
}

export function findInspectionSchemaSection(
  schema: InspectionSchemaVersion,
  sectionId: InspectionSchemaSectionId,
): InspectionSchemaSection {
  const section = schema.sections.find((candidate) => candidate.id === sectionId);
  if (!section) {
    throw new DomainError(
      'INSPECTION_SCHEMA_SECTION_NOT_FOUND',
      'Schema section not found.',
    );
  }
  return section;
}

export function findInspectionSchemaItem(
  schema: InspectionSchemaVersion,
  itemId: InspectionSchemaItemId,
): InspectionSchemaItem {
  for (const section of schema.sections) {
    const item = section.items.find((candidate) => candidate.id === itemId);
    if (item) return item;
  }
  throw new DomainError(
    'INSPECTION_SCHEMA_ITEM_NOT_FOUND',
    'Schema item not found.',
  );
}
