import {
  INSPECTION_CONDITION_OPERATORS,
  INSPECTION_ITEM_TYPES,
  INSPECTION_SIGNATURE_ROLES,
  INSPECTION_TYPES,
  SPACE_TYPES,
  type InspectionCondition,
  type InspectionConditionOperator,
  type InspectionItemType,
  type InspectionSignatureRole,
  type InspectionType,
  type SpaceType,
} from '@portfolio/domain';
import type {
  CreateInspectionSchemaVersionRequest,
  InspectionSchemaVersionResponse,
} from '@portfolio/contracts';

export interface InspectionSchemaOptionDraft {
  readonly id: string;
  readonly value: string;
  readonly label: string;
}

export interface InspectionSchemaItemDraft {
  readonly id: string;
  readonly key: string;
  readonly type: InspectionItemType;
  readonly label: string;
  readonly required: boolean;
  readonly options: readonly InspectionSchemaOptionDraft[];
  readonly visibleWhen: InspectionCondition | null;
  readonly requiredWhen: InspectionCondition | null;
}

export interface InspectionSchemaSectionDraft {
  readonly id: string;
  readonly key: string;
  readonly title: string;
  readonly description: string;
  readonly scope: 'unit' | 'space';
  readonly spaceTypes: readonly SpaceType[];
  readonly items: readonly InspectionSchemaItemDraft[];
}

export interface InspectionSchemaBuilderDraft {
  readonly schemaCode: string;
  readonly inspectionType: InspectionType;
  readonly title: string;
  readonly requiredSignatureRoles: readonly InspectionSignatureRole[];
  readonly sections: readonly InspectionSchemaSectionDraft[];
}

export interface InspectionSchemaBuilderIssue {
  readonly path: string;
  readonly message: string;
}

export interface InspectionSchemaFieldReference {
  readonly key: string;
  readonly label: string;
  readonly type: InspectionItemType;
  readonly options: readonly { readonly value: string; readonly label: string }[];
  readonly scope: 'unit' | 'space';
  readonly spaceTypes: readonly SpaceType[];
}

function id(): string {
  return crypto.randomUUID();
}

export function schemaKeyFromLabel(value: string, fallback: string): string {
  const key = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return key || fallback;
}

export function nextInspectionSchemaKey(
  base: string,
  usedKeys: ReadonlySet<string>,
): string {
  const normalized = schemaKeyFromLabel(base, 'field');
  if (!usedKeys.has(normalized.toLowerCase())) return normalized;
  let suffix = 2;
  while (usedKeys.has(`${normalized}_${suffix}`.toLowerCase())) {
    suffix += 1;
  }
  return `${normalized}_${suffix}`;
}

export function newInspectionSchemaItem(
  key = 'condition',
  label = 'Condition',
): InspectionSchemaItemDraft {
  return {
    id: id(),
    key,
    type: 'text',
    label,
    required: false,
    options: [],
    visibleWhen: null,
    requiredWhen: null,
  };
}

export function newInspectionSchemaSection(): InspectionSchemaSectionDraft {
  return {
    id: id(),
    key: 'general',
    title: 'General',
    description: '',
    scope: 'unit',
    spaceTypes: [],
    items: [newInspectionSchemaItem()],
  };
}

export function newInspectionSchemaBuilderDraft(): InspectionSchemaBuilderDraft {
  return {
    schemaCode: '',
    inspectionType: 'move_in',
    title: '',
    requiredSignatureRoles: ['tenant', 'landlord'],
    sections: [newInspectionSchemaSection()],
  };
}

export function inspectionSchemaDraftFromVersion(
  schema: InspectionSchemaVersionResponse,
): InspectionSchemaBuilderDraft {
  return {
    schemaCode: schema.schemaCode,
    inspectionType: schema.inspectionType,
    title: schema.title,
    requiredSignatureRoles: [...schema.requiredSignatureRoles],
    sections: [...schema.sections]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((section) => ({
        id: id(),
        key: section.key,
        title: section.title,
        description: section.description ?? '',
        scope: section.scope,
        spaceTypes: [...section.spaceTypes],
        items: [...section.items]
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((item) => ({
            id: id(),
            key: item.key,
            type: item.type,
            label: item.label,
            required: item.required,
            options: item.options.map((option) => ({
              id: id(),
              value: option.value,
              label: option.label,
            })),
            visibleWhen: item.visibleWhen,
            requiredWhen: item.requiredWhen,
          })),
      })),
  };
}

function conditionReferences(
  condition: InspectionCondition | null,
  references: Set<string>,
): void {
  if (!condition) return;
  if ('all' in condition) {
    condition.all.forEach((child) => conditionReferences(child, references));
    return;
  }
  if ('any' in condition) {
    condition.any.forEach((child) => conditionReferences(child, references));
    return;
  }
  references.add(condition.fieldKey.toLowerCase());
}

export function referencedInspectionSchemaFieldKeys(
  draft: InspectionSchemaBuilderDraft,
): ReadonlySet<string> {
  const references = new Set<string>();
  for (const section of draft.sections) {
    for (const item of section.items) {
      conditionReferences(item.visibleWhen, references);
      conditionReferences(item.requiredWhen, references);
    }
  }
  return references;
}

export function replaceInspectionConditionFieldKey(
  condition: InspectionCondition | null,
  previousKey: string,
  nextKey: string,
): InspectionCondition | null {
  if (!condition) return null;
  if ('all' in condition) {
    return {
      all: condition.all.map((child) =>
        replaceInspectionConditionFieldKey(child, previousKey, nextKey)!,
      ),
    };
  }
  if ('any' in condition) {
    return {
      any: condition.any.map((child) =>
        replaceInspectionConditionFieldKey(child, previousKey, nextKey)!,
      ),
    };
  }
  return condition.fieldKey.toLowerCase() === previousKey.toLowerCase()
    ? { ...condition, fieldKey: nextKey }
    : condition;
}

export function renameInspectionSchemaItemKey(
  draft: InspectionSchemaBuilderDraft,
  itemId: string,
  nextKey: string,
): InspectionSchemaBuilderDraft {
  let previousKey: string | null = null;
  const sections = draft.sections.map((section) => ({
    ...section,
    items: section.items.map((item) => {
      if (item.id !== itemId) return item;
      previousKey = item.key;
      return { ...item, key: nextKey };
    }),
  }));
  if (previousKey === null || previousKey === nextKey) {
    return { ...draft, sections };
  }
  return {
    ...draft,
    sections: sections.map((section) => ({
      ...section,
      items: section.items.map((item) => ({
        ...item,
        visibleWhen: replaceInspectionConditionFieldKey(
          item.visibleWhen,
          previousKey!,
          nextKey,
        ),
        requiredWhen: replaceInspectionConditionFieldKey(
          item.requiredWhen,
          previousKey!,
          nextKey,
        ),
      })),
    })),
  };
}

function remapInspectionConditionKeys(
  condition: InspectionCondition | null,
  keyMap: ReadonlyMap<string, string>,
): InspectionCondition | null {
  if (!condition) return null;
  if ('all' in condition) {
    return {
      all: condition.all.map(
        (child) => remapInspectionConditionKeys(child, keyMap)!,
      ),
    };
  }
  if ('any' in condition) {
    return {
      any: condition.any.map(
        (child) => remapInspectionConditionKeys(child, keyMap)!,
      ),
    };
  }
  return {
    ...condition,
    fieldKey:
      keyMap.get(condition.fieldKey.toLowerCase()) ?? condition.fieldKey,
  };
}

export function duplicateInspectionSchemaItem(
  draft: InspectionSchemaBuilderDraft,
  sectionId: string,
  itemId: string,
): InspectionSchemaBuilderDraft {
  const used = new Set(
    draft.sections.flatMap((section) =>
      section.items.map((item) => item.key.toLowerCase()),
    ),
  );
  return {
    ...draft,
    sections: draft.sections.map((section) => {
      if (section.id !== sectionId) return section;
      const index = section.items.findIndex((item) => item.id === itemId);
      if (index < 0) return section;
      const source = section.items[index]!;
      const key = nextInspectionSchemaKey(source.key, used);
      const duplicate: InspectionSchemaItemDraft = {
        ...source,
        id: id(),
        key,
        label: `${source.label} copy`,
        options: source.options.map((option) => ({ ...option, id: id() })),
      };
      return {
        ...section,
        items: [
          ...section.items.slice(0, index + 1),
          duplicate,
          ...section.items.slice(index + 1),
        ],
      };
    }),
  };
}

export function duplicateInspectionSchemaSection(
  draft: InspectionSchemaBuilderDraft,
  sectionId: string,
): InspectionSchemaBuilderDraft {
  const sectionIndex = draft.sections.findIndex(
    (section) => section.id === sectionId,
  );
  if (sectionIndex < 0) return draft;
  const source = draft.sections[sectionIndex]!;
  const usedSectionKeys = new Set(
    draft.sections.map((section) => section.key.toLowerCase()),
  );
  const usedItemKeys = new Set(
    draft.sections.flatMap((section) =>
      section.items.map((item) => item.key.toLowerCase()),
    ),
  );
  const keyMap = new Map<string, string>();
  const copiedItems = source.items.map((item) => {
    const key = nextInspectionSchemaKey(item.key, usedItemKeys);
    usedItemKeys.add(key.toLowerCase());
    keyMap.set(item.key.toLowerCase(), key);
    return {
      ...item,
      id: id(),
      key,
      options: item.options.map((option) => ({ ...option, id: id() })),
    };
  });
  const duplicate: InspectionSchemaSectionDraft = {
    ...source,
    id: id(),
    key: nextInspectionSchemaKey(source.key, usedSectionKeys),
    title: `${source.title} copy`,
    items: copiedItems.map((item) => ({
      ...item,
      visibleWhen: remapInspectionConditionKeys(item.visibleWhen, keyMap),
      requiredWhen: remapInspectionConditionKeys(item.requiredWhen, keyMap),
    })),
  };
  return {
    ...draft,
    sections: [
      ...draft.sections.slice(0, sectionIndex + 1),
      duplicate,
      ...draft.sections.slice(sectionIndex + 1),
    ],
  };
}

export function inspectionSchemaFieldReferences(
  draft: InspectionSchemaBuilderDraft,
): readonly InspectionSchemaFieldReference[] {
  return draft.sections.flatMap((section) =>
    section.items.map((item) => ({
      key: item.key,
      label: item.label,
      type: item.type,
      options: item.options.map(({ value, label }) => ({ value, label })),
      scope: section.scope,
      spaceTypes: section.spaceTypes,
    })),
  );
}

export function conditionSourcesForItem(
  draft: InspectionSchemaBuilderDraft,
  targetSectionId: string,
  targetItemId: string,
): readonly InspectionSchemaFieldReference[] {
  const targetSection = draft.sections.find(
    (section) => section.id === targetSectionId,
  );
  if (!targetSection) return [];

  return inspectionSchemaFieldReferences(draft).filter((field) => {
    const target = targetSection.items.find((item) => item.id === targetItemId);
    if (target?.key.toLowerCase() === field.key.toLowerCase()) return false;

    if (targetSection.scope === 'unit') return field.scope === 'unit';
    if (field.scope === 'unit') return true;
    const sourceTypes = new Set(field.spaceTypes);
    return targetSection.spaceTypes.every((type) => sourceTypes.has(type));
  });
}

function conditionIssue(
  condition: InspectionCondition | null,
  knownKeys: ReadonlySet<string>,
  path: string,
  issues: InspectionSchemaBuilderIssue[],
): void {
  if (!condition) return;
  if ('all' in condition || 'any' in condition) {
    const children = 'all' in condition ? condition.all : condition.any;
    if (children.length === 0) {
      issues.push({ path, message: 'Condition group needs at least one rule.' });
    }
    children.forEach((child, index) =>
      conditionIssue(child, knownKeys, `${path}.${index}`, issues),
    );
    return;
  }
  if (!condition.fieldKey.trim()) {
    issues.push({ path, message: 'Condition field is required.' });
  } else if (!knownKeys.has(condition.fieldKey.trim().toLowerCase())) {
    issues.push({
      path,
      message: `Condition references unknown field '${condition.fieldKey}'.`,
    });
  }
  if (
    !['truthy', 'falsy'].includes(condition.operator) &&
    condition.value === undefined
  ) {
    issues.push({ path, message: 'Condition value is required.' });
  }
}

export function validateInspectionSchemaBuilderDraft(
  draft: InspectionSchemaBuilderDraft,
): readonly InspectionSchemaBuilderIssue[] {
  const issues: InspectionSchemaBuilderIssue[] = [];
  if (!draft.schemaCode.trim()) {
    issues.push({ path: 'schemaCode', message: 'Schema code is required.' });
  }
  if (!draft.title.trim()) {
    issues.push({ path: 'title', message: 'Schema title is required.' });
  }
  if (!INSPECTION_TYPES.includes(draft.inspectionType)) {
    issues.push({ path: 'inspectionType', message: 'Inspection type is invalid.' });
  }
  if (
    draft.requiredSignatureRoles.some(
      (role) => !INSPECTION_SIGNATURE_ROLES.includes(role),
    ) ||
    new Set(draft.requiredSignatureRoles).size !==
      draft.requiredSignatureRoles.length
  ) {
    issues.push({
      path: 'requiredSignatureRoles',
      message: 'Required signature roles must be valid and unique.',
    });
  }
  if (draft.sections.length === 0) {
    issues.push({ path: 'sections', message: 'Add at least one section.' });
  }

  const sectionKeys = new Set<string>();
  const itemKeys = new Set<string>();
  for (const [sectionIndex, section] of draft.sections.entries()) {
    const sectionPath = `sections.${sectionIndex}`;
    const sectionKey = section.key.trim().toLowerCase();
    if (!section.key.trim()) {
      issues.push({ path: `${sectionPath}.key`, message: 'Section key is required.' });
    } else if (sectionKeys.has(sectionKey)) {
      issues.push({ path: `${sectionPath}.key`, message: 'Section keys must be unique.' });
    }
    sectionKeys.add(sectionKey);
    if (!section.title.trim()) {
      issues.push({ path: `${sectionPath}.title`, message: 'Section title is required.' });
    }
    if (section.scope === 'unit' && section.spaceTypes.length > 0) {
      issues.push({
        path: `${sectionPath}.spaceTypes`,
        message: 'Unit sections cannot target Space types.',
      });
    }
    if (section.scope === 'space' && section.spaceTypes.length === 0) {
      issues.push({
        path: `${sectionPath}.spaceTypes`,
        message: 'Space sections need at least one Space type.',
      });
    }
    if (
      section.spaceTypes.some((type) => !SPACE_TYPES.includes(type)) ||
      new Set(section.spaceTypes).size !== section.spaceTypes.length
    ) {
      issues.push({
        path: `${sectionPath}.spaceTypes`,
        message: 'Space types must be valid and unique.',
      });
    }
    if (section.items.length === 0) {
      issues.push({
        path: `${sectionPath}.items`,
        message: 'Each section needs at least one item.',
      });
    }

    for (const [itemIndex, item] of section.items.entries()) {
      const itemPath = `${sectionPath}.items.${itemIndex}`;
      const itemKey = item.key.trim().toLowerCase();
      if (!item.key.trim()) {
        issues.push({ path: `${itemPath}.key`, message: 'Item key is required.' });
      } else if (itemKeys.has(itemKey)) {
        issues.push({
          path: `${itemPath}.key`,
          message: 'Item keys must be globally unique.',
        });
      }
      itemKeys.add(itemKey);
      if (!item.label.trim()) {
        issues.push({ path: `${itemPath}.label`, message: 'Item label is required.' });
      }
      if (!INSPECTION_ITEM_TYPES.includes(item.type)) {
        issues.push({ path: `${itemPath}.type`, message: 'Item type is invalid.' });
      }
      const optionsRequired = ['select', 'multiselect', 'radio'].includes(item.type);
      if (optionsRequired && item.options.length === 0) {
        issues.push({ path: `${itemPath}.options`, message: 'This item type needs options.' });
      }
      if (!optionsRequired && item.options.length > 0) {
        issues.push({
          path: `${itemPath}.options`,
          message: 'This item type cannot define options.',
        });
      }
      const optionValues = new Set<string>();
      for (const [optionIndex, option] of item.options.entries()) {
        const optionPath = `${itemPath}.options.${optionIndex}`;
        const value = option.value.trim().toLowerCase();
        if (!option.value.trim() || !option.label.trim()) {
          issues.push({
            path: optionPath,
            message: 'Option value and label are required.',
          });
        } else if (optionValues.has(value)) {
          issues.push({
            path: optionPath,
            message: 'Option values must be unique inside an item.',
          });
        }
        optionValues.add(value);
      }
    }
  }

  for (const [sectionIndex, section] of draft.sections.entries()) {
    for (const [itemIndex, item] of section.items.entries()) {
      const sources = new Set(
        conditionSourcesForItem(draft, section.id, item.id).map((field) =>
          field.key.toLowerCase(),
        ),
      );
      conditionIssue(
        item.visibleWhen,
        sources,
        `sections.${sectionIndex}.items.${itemIndex}.visibleWhen`,
        issues,
      );
      conditionIssue(
        item.requiredWhen,
        sources,
        `sections.${sectionIndex}.items.${itemIndex}.requiredWhen`,
        issues,
      );
    }
  }

  return issues;
}

export function inspectionSchemaDraftRequest(
  draft: InspectionSchemaBuilderDraft,
): CreateInspectionSchemaVersionRequest {
  return {
    schemaCode: draft.schemaCode.trim(),
    inspectionType: draft.inspectionType,
    title: draft.title.trim(),
    requiredSignatureRoles: [...draft.requiredSignatureRoles],
    sections: draft.sections.map((section, sectionIndex) => ({
      key: section.key.trim(),
      title: section.title.trim(),
      ...(section.description.trim()
        ? { description: section.description.trim() }
        : {}),
      sortOrder: sectionIndex,
      scope: section.scope,
      spaceTypes: section.scope === 'space' ? [...section.spaceTypes] : [],
      items: section.items.map((item, itemIndex) => ({
        key: item.key.trim(),
        type: item.type,
        label: item.label.trim(),
        required: item.required,
        sortOrder: itemIndex,
        options: item.options.map((option) => ({
          value: option.value.trim(),
          label: option.label.trim(),
        })),
        visibleWhen: item.visibleWhen,
        requiredWhen: item.requiredWhen,
      })),
    })),
  };
}

export function defaultConditionForField(
  field: InspectionSchemaFieldReference,
): InspectionCondition {
  if (field.type === 'checkbox') {
    return { fieldKey: field.key, operator: 'equals', value: true };
  }
  const firstOption = field.options[0]?.value;
  return {
    fieldKey: field.key,
    operator: 'equals',
    value: firstOption ?? '',
  };
}

export function conditionOperatorNeedsValue(
  operator: InspectionConditionOperator,
): boolean {
  return !['truthy', 'falsy'].includes(operator);
}

export {
  INSPECTION_CONDITION_OPERATORS,
  INSPECTION_ITEM_TYPES,
  INSPECTION_SIGNATURE_ROLES,
  INSPECTION_TYPES,
  SPACE_TYPES,
};
