import {
  createInspectionSchemaVersionRequestSchema,
  inspectionSchemaVersionListResponseSchema,
  inspectionSchemaVersionResponseSchema,
  type InspectionSchemaVersionResponse,
} from '@portfolio/contracts';
import type {
  InspectionCondition,
  InspectionItemType,
  InspectionSignatureRole,
  SpaceType,
} from '@portfolio/domain';
import {
  type ChangeEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  inspectionSchemaPublishPath,
  inspectionSchemasPath,
} from '../api/paths.js';
import {
  isAmbiguousWriteFailure,
  type PortfolioApi,
} from '../api/portfolio-api.js';
import type { SetNavigationBlocker } from '../navigation/use-workspace-navigation.js';
import { formatDetailKey } from '../presentation/format.js';
import { InspectionConditionBuilder } from './InspectionConditionBuilder.js';
import {
  INSPECTION_ITEM_TYPES,
  INSPECTION_SIGNATURE_ROLES,
  INSPECTION_TYPES,
  SPACE_TYPES,
  conditionSourcesForItem,
  duplicateInspectionSchemaItem,
  duplicateInspectionSchemaSection,
  inspectionSchemaDraftFromVersion,
  inspectionSchemaDraftRequest,
  inspectionSchemaOptionValueReferenced,
  newInspectionSchemaBuilderDraft,
  newInspectionSchemaItem,
  newInspectionSchemaSection,
  nextInspectionSchemaKey,
  referencedInspectionSchemaFieldKeys,
  renameInspectionSchemaItemKey,
  renameInspectionSchemaOptionValue,
  validateInspectionSchemaBuilderDraft,
  type InspectionSchemaBuilderDraft,
  type InspectionSchemaItemDraft,
  type InspectionSchemaSectionDraft,
} from './inspection-schema-builder.js';

interface InspectionSchemaAdministrationProps {
  readonly api: PortfolioApi;
  readonly setNavigationBlocker: SetNavigationBlocker;
}

function sortedSchemas(
  schemas: readonly InspectionSchemaVersionResponse[],
): readonly InspectionSchemaVersionResponse[] {
  return [...schemas].sort(
    (left, right) =>
      left.schemaCode.localeCompare(right.schemaCode) ||
      right.versionNumber - left.versionNumber ||
      left.id.localeCompare(right.id),
  );
}

function move<T>(items: readonly T[], index: number, delta: -1 | 1): readonly T[] {
  const target = index + delta;
  if (index < 0 || target < 0 || target >= items.length) return items;
  const next = [...items];
  const [value] = next.splice(index, 1);
  if (value === undefined) return items;
  next.splice(target, 0, value);
  return next;
}

function replaceSection(
  draft: InspectionSchemaBuilderDraft,
  sectionId: string,
  transform: (section: InspectionSchemaSectionDraft) => InspectionSchemaSectionDraft,
): InspectionSchemaBuilderDraft {
  return {
    ...draft,
    sections: draft.sections.map((section) =>
      section.id === sectionId ? transform(section) : section,
    ),
  };
}

function replaceItem(
  draft: InspectionSchemaBuilderDraft,
  sectionId: string,
  itemId: string,
  transform: (item: InspectionSchemaItemDraft) => InspectionSchemaItemDraft,
): InspectionSchemaBuilderDraft {
  return replaceSection(draft, sectionId, (section) => ({
    ...section,
    items: section.items.map((item) =>
      item.id === itemId ? transform(item) : item,
    ),
  }));
}

function supportsOptions(type: InspectionItemType): boolean {
  return ['select', 'multiselect', 'radio'].includes(type);
}

function conditionSummary(condition: InspectionCondition | null): string {
  if (!condition) return 'Always';
  if ('all' in condition) {
    return `All: ${condition.all.map(conditionSummary).join(' AND ')}`;
  }
  if ('any' in condition) {
    return `Any: ${condition.any.map(conditionSummary).join(' OR ')}`;
  }
  if (['truthy', 'falsy'].includes(condition.operator)) {
    return `${condition.fieldKey} ${condition.operator}`;
  }
  const value = Array.isArray(condition.value)
    ? condition.value.join(', ')
    : String(condition.value ?? '');
  return `${condition.fieldKey} ${condition.operator} ${value}`;
}

function statusClass(status: InspectionSchemaVersionResponse['status']): string {
  return `status-chip status-${status}`;
}

function SchemaVersionSummary({
  schema,
}: {
  readonly schema: InspectionSchemaVersionResponse;
}) {
  const itemCount = schema.sections.reduce(
    (sum, section) => sum + section.items.length,
    0,
  );
  return (
    <>
      <div className="schema-version-title">
        <strong>{schema.title}</strong>
        <span className={statusClass(schema.status)}>{schema.status}</span>
      </div>
      <small>
        {schema.schemaCode} · v{schema.versionNumber} ·{' '}
        {formatDetailKey(schema.inspectionType)}
      </small>
      <small>
        {schema.sections.length} sections · {itemCount} fields
      </small>
    </>
  );
}

function SchemaPreview({
  draft,
}: {
  readonly draft: InspectionSchemaBuilderDraft;
}) {
  return (
    <section className="schema-builder-preview" aria-label="Schema preview">
      <div className="schema-builder-preview-heading">
        <div>
          <p className="eyebrow">Preview</p>
          <h2>{draft.title.trim() || 'Untitled Inspection schema'}</h2>
          <p className="muted">
            {draft.schemaCode.trim() || 'NO-CODE'} ·{' '}
            {formatDetailKey(draft.inspectionType)}
          </p>
        </div>
        <span className="status-chip status-draft">local draft</span>
      </div>
      {draft.sections.map((section, sectionIndex) => (
        <article className="schema-preview-section" key={section.id}>
          <div className="schema-preview-section-heading">
            <div>
              <strong>
                {sectionIndex + 1}. {section.title || 'Untitled section'}
              </strong>
              <small>
                {section.scope === 'unit'
                  ? 'Once per Unit'
                  : `Repeat for: ${section.spaceTypes
                      .map(formatDetailKey)
                      .join(', ') || 'no Space type selected'}`}
              </small>
            </div>
            <code>{section.key || 'no_key'}</code>
          </div>
          {section.description ? <p>{section.description}</p> : null}
          <div className="schema-preview-items">
            {section.items.map((item, itemIndex) => (
              <div className="schema-preview-item" key={item.id}>
                <div>
                  <strong>
                    {itemIndex + 1}. {item.label || 'Untitled field'}
                    {item.required ? ' *' : ''}
                  </strong>
                  <small>
                    {formatDetailKey(item.type)} · <code>{item.key || 'no_key'}</code>
                  </small>
                </div>
                {item.options.length > 0 ? (
                  <small>
                    Options: {item.options.map((option) => option.label || option.value).join(' · ')}
                  </small>
                ) : null}
                {item.visibleWhen ? (
                  <small>Visible when: {conditionSummary(item.visibleWhen)}</small>
                ) : null}
                {item.requiredWhen ? (
                  <small>Required when: {conditionSummary(item.requiredWhen)}</small>
                ) : null}
              </div>
            ))}
          </div>
        </article>
      ))}
    </section>
  );
}

function ItemEditor({
  draft,
  section,
  item,
  itemIndex,
  referencedKeys,
  onDraft,
}: {
  readonly draft: InspectionSchemaBuilderDraft;
  readonly section: InspectionSchemaSectionDraft;
  readonly item: InspectionSchemaItemDraft;
  readonly itemIndex: number;
  readonly referencedKeys: ReadonlySet<string>;
  readonly onDraft: (draft: InspectionSchemaBuilderDraft) => void;
}) {
  const sources = conditionSourcesForItem(draft, section.id, item.id);
  const cannotDelete = referencedKeys.has(item.key.toLowerCase());
  const update = (transform: (value: InspectionSchemaItemDraft) => InspectionSchemaItemDraft) =>
    onDraft(replaceItem(draft, section.id, item.id, transform));

  function changeType(event: ChangeEvent<HTMLSelectElement>) {
    const type = event.currentTarget.value as InspectionItemType;
    update((current) => ({
      ...current,
      type,
      options: supportsOptions(type)
        ? current.options.length > 0
          ? current.options
          : [{ id: crypto.randomUUID(), value: 'option_1', label: 'Option 1' }]
        : [],
    }));
  }

  return (
    <article className="schema-item-editor" data-schema-item={item.id}>
      <div className="schema-item-toolbar">
        <div>
          <strong>
            Field {itemIndex + 1}: {item.label || 'Untitled'}
          </strong>
          <small>{item.key || 'No key yet'}</small>
        </div>
        <div className="schema-builder-button-row">
          <button
            className="button-secondary"
            disabled={itemIndex === 0}
            onClick={() =>
              onDraft(
                replaceSection(draft, section.id, (current) => ({
                  ...current,
                  items: move(current.items, itemIndex, -1),
                })),
              )
            }
            type="button"
          >
            ↑
          </button>
          <button
            className="button-secondary"
            disabled={itemIndex === section.items.length - 1}
            onClick={() =>
              onDraft(
                replaceSection(draft, section.id, (current) => ({
                  ...current,
                  items: move(current.items, itemIndex, 1),
                })),
              )
            }
            type="button"
          >
            ↓
          </button>
          <button
            className="button-secondary"
            onClick={() =>
              onDraft(
                duplicateInspectionSchemaItem(draft, section.id, item.id),
              )
            }
            type="button"
          >
            Duplicate
          </button>
          <button
            className="button-secondary"
            disabled={section.items.length === 1 || cannotDelete}
            onClick={() =>
              onDraft(
                replaceSection(draft, section.id, (current) => ({
                  ...current,
                  items: current.items.filter(
                    (candidate) => candidate.id !== item.id,
                  ),
                })),
              )
            }
            title={
              cannotDelete
                ? 'This field is referenced by a visibility/required condition.'
                : undefined
            }
            type="button"
          >
            Remove
          </button>
        </div>
      </div>

      <div className="schema-builder-field-grid">
        <label>
          Field label
          <input
            onChange={(event) =>
              update((current) => ({
                ...current,
                label: event.currentTarget.value,
              }))
            }
            value={item.label}
          />
        </label>
        <label>
          Stable field key
          <input
            onChange={(event) =>
              onDraft(
                renameInspectionSchemaItemKey(
                  draft,
                  item.id,
                  event.currentTarget.value,
                ),
              )
            }
            spellCheck={false}
            value={item.key}
          />
        </label>
        <label>
          Input type
          <select onChange={changeType} value={item.type}>
            {INSPECTION_ITEM_TYPES.map((type) => (
              <option key={type} value={type}>
                {formatDetailKey(type)}
              </option>
            ))}
          </select>
        </label>
        <label className="schema-builder-check">
          <input
            checked={item.required}
            onChange={(event) =>
              update((current) => ({
                ...current,
                required: event.currentTarget.checked,
              }))
            }
            type="checkbox"
          />
          Always required
        </label>
      </div>

      {supportsOptions(item.type) ? (
        <div className="schema-option-editor">
          <div className="schema-builder-subheading">
            <strong>Options</strong>
            <button
              className="button-secondary"
              onClick={() =>
                update((current) => ({
                  ...current,
                  options: [
                    ...current.options,
                    {
                      id: crypto.randomUUID(),
                      value: `option_${current.options.length + 1}`,
                      label: `Option ${current.options.length + 1}`,
                    },
                  ],
                }))
              }
              type="button"
            >
              Add option
            </button>
          </div>
          {item.options.map((option, optionIndex) => {
            const referenced = inspectionSchemaOptionValueReferenced(
              draft,
              item.key,
              option.value,
            );
            return (
              <div className="schema-option-row" key={option.id}>
                <input
                  aria-label={`Option ${optionIndex + 1} label`}
                  onChange={(event) =>
                    update((current) => ({
                      ...current,
                      options: current.options.map((candidate) =>
                        candidate.id === option.id
                          ? { ...candidate, label: event.currentTarget.value }
                          : candidate,
                      ),
                    }))
                  }
                  placeholder="Label"
                  value={option.label}
                />
                <input
                  aria-label={`Option ${optionIndex + 1} value`}
                  onChange={(event) =>
                    onDraft(
                      renameInspectionSchemaOptionValue(
                        draft,
                        item.id,
                        option.id,
                        event.currentTarget.value,
                      ),
                    )
                  }
                  placeholder="value"
                  spellCheck={false}
                  value={option.value}
                />
                <button
                  className="button-secondary"
                  disabled={item.options.length === 1 || referenced}
                  onClick={() =>
                    update((current) => ({
                      ...current,
                      options: current.options.filter(
                        (candidate) => candidate.id !== option.id,
                      ),
                    }))
                  }
                  title={
                    referenced
                      ? 'This option value is referenced by a visibility/required condition. Rename it or update the condition before removing it.'
                      : undefined
                  }
                  type="button"
                >
                  Remove
                </button>
              </div>
            );
          })}
        </div>
      ) : null}

      <div className="schema-condition-pair">
        <InspectionConditionBuilder
          condition={item.visibleWhen}
          fields={sources}
          label="Visibility"
          onChange={(visibleWhen) =>
            update((current) => ({ ...current, visibleWhen }))
          }
        />
        <InspectionConditionBuilder
          condition={item.requiredWhen}
          fields={sources}
          label="Conditional requiredness"
          onChange={(requiredWhen) =>
            update((current) => ({ ...current, requiredWhen }))
          }
        />
      </div>
    </article>
  );
}

function SectionEditor({
  draft,
  section,
  sectionIndex,
  onDraft,
}: {
  readonly draft: InspectionSchemaBuilderDraft;
  readonly section: InspectionSchemaSectionDraft;
  readonly sectionIndex: number;
  readonly onDraft: (draft: InspectionSchemaBuilderDraft) => void;
}) {
  const referencedKeys = referencedInspectionSchemaFieldKeys(draft);

  function update(
    transform: (value: InspectionSchemaSectionDraft) => InspectionSchemaSectionDraft,
  ) {
    onDraft(replaceSection(draft, section.id, transform));
  }

  function addField() {
    const used = new Set(
      draft.sections.flatMap((candidate) =>
        candidate.items.map((item) => item.key.toLowerCase()),
      ),
    );
    const key = nextInspectionSchemaKey('field', used);
    update((current) => ({
      ...current,
      items: [...current.items, newInspectionSchemaItem(key, 'New field')],
    }));
  }

  return (
    <article className="schema-section-editor" data-schema-section={section.id}>
      <div className="schema-section-toolbar">
        <div>
          <p className="eyebrow">Section {sectionIndex + 1}</p>
          <strong>{section.title || 'Untitled section'}</strong>
          <small>{section.key || 'No key yet'}</small>
        </div>
        <div className="schema-builder-button-row">
          <button
            className="button-secondary"
            disabled={sectionIndex === 0}
            onClick={() =>
              onDraft({
                ...draft,
                sections: move(draft.sections, sectionIndex, -1),
              })
            }
            type="button"
          >
            ↑
          </button>
          <button
            className="button-secondary"
            disabled={sectionIndex === draft.sections.length - 1}
            onClick={() =>
              onDraft({
                ...draft,
                sections: move(draft.sections, sectionIndex, 1),
              })
            }
            type="button"
          >
            ↓
          </button>
          <button
            className="button-secondary"
            onClick={() =>
              onDraft(duplicateInspectionSchemaSection(draft, section.id))
            }
            type="button"
          >
            Duplicate
          </button>
          <button
            className="button-secondary"
            disabled={draft.sections.length === 1}
            onClick={() =>
              onDraft({
                ...draft,
                sections: draft.sections.filter(
                  (candidate) => candidate.id !== section.id,
                ),
              })
            }
            type="button"
          >
            Remove
          </button>
        </div>
      </div>

      <div className="schema-builder-field-grid">
        <label>
          Section title
          <input
            onChange={(event) =>
              update((current) => ({
                ...current,
                title: event.currentTarget.value,
              }))
            }
            value={section.title}
          />
        </label>
        <label>
          Stable section key
          <input
            onChange={(event) =>
              update((current) => ({
                ...current,
                key: event.currentTarget.value,
              }))
            }
            spellCheck={false}
            value={section.key}
          />
        </label>
        <label>
          Scope
          <select
            aria-label="Section scope"
            onChange={(event) => {
              const scope = event.currentTarget.value as 'unit' | 'space';
              update((current) => ({
                ...current,
                scope,
                spaceTypes:
                  scope === 'unit'
                    ? []
                    : current.spaceTypes.length > 0
                      ? current.spaceTypes
                      : ['living_room'],
              }));
            }}
            value={section.scope}
          >
            <option value="unit">Unit — once per Inspection</option>
            <option value="space">Space — repeat by room/Space</option>
          </select>
        </label>
      </div>

      <label>
        Description
        <textarea
          onChange={(event) =>
            update((current) => ({
              ...current,
              description: event.currentTarget.value,
            }))
          }
          rows={2}
          value={section.description}
        />
      </label>

      {section.scope === 'space' ? (
        <fieldset className="schema-space-types">
          <legend>Apply this section to Space types</legend>
          {SPACE_TYPES.map((spaceType) => (
            <label key={spaceType}>
              <input
                checked={section.spaceTypes.includes(spaceType)}
                onChange={(event) =>
                  update((current) => ({
                    ...current,
                    spaceTypes: event.currentTarget.checked
                      ? [...current.spaceTypes, spaceType]
                      : current.spaceTypes.filter(
                          (candidate) => candidate !== spaceType,
                        ),
                  }))
                }
                type="checkbox"
              />
              {formatDetailKey(spaceType)}
            </label>
          ))}
        </fieldset>
      ) : null}

      <div className="schema-builder-subheading">
        <div>
          <strong>Fields</strong>
          <small>
            Field keys are schema-wide identities used by conditional logic.
          </small>
        </div>
        <button className="button-secondary" onClick={addField} type="button">
          Add field
        </button>
      </div>

      <div className="schema-item-list">
        {section.items.map((item, itemIndex) => (
          <ItemEditor
            draft={draft}
            item={item}
            itemIndex={itemIndex}
            key={item.id}
            onDraft={onDraft}
            referencedKeys={referencedKeys}
            section={section}
          />
        ))}
      </div>
    </article>
  );
}

function SchemaDraftEditor({
  draft,
  issues,
  saving,
  createOutcomeAmbiguous,
  onDraft,
  onCancel,
  onSave,
  onConfirmRetry,
}: {
  readonly draft: InspectionSchemaBuilderDraft;
  readonly issues: readonly { readonly path: string; readonly message: string }[];
  readonly saving: boolean;
  readonly createOutcomeAmbiguous: boolean;
  readonly onDraft: (draft: InspectionSchemaBuilderDraft) => void;
  readonly onCancel: () => void;
  readonly onSave: () => void;
  readonly onConfirmRetry: () => void;
}) {
  function addSection() {
    const usedSections = new Set(
      draft.sections.map((section) => section.key.toLowerCase()),
    );
    const usedItems = new Set(
      draft.sections.flatMap((section) =>
        section.items.map((item) => item.key.toLowerCase()),
      ),
    );
    const section = newInspectionSchemaSection();
    const sectionKey = nextInspectionSchemaKey('section', usedSections);
    const itemKey = nextInspectionSchemaKey('field', usedItems);
    onDraft({
      ...draft,
      sections: [
        ...draft.sections,
        {
          ...section,
          key: sectionKey,
          title: 'New section',
          items: [newInspectionSchemaItem(itemKey, 'New field')],
        },
      ],
    });
  }

  return (
    <div className="schema-builder-editor">
      <section className="panel schema-builder-header">
        <div>
          <p className="eyebrow">Local editable draft</p>
          <h2>Build Inspection schema</h2>
          <p className="muted">
            Nothing is persisted until Save draft. Published schema versions are
            never edited in place.
          </p>
        </div>
        <div className="schema-builder-button-row">
          <button className="button-secondary" disabled={saving} onClick={onCancel} type="button">
            Discard local draft
          </button>
          <button
            className="button-primary"
            disabled={
              saving ||
              issues.length > 0 ||
              createOutcomeAmbiguous
            }
            onClick={onSave}
            type="button"
          >
            {saving ? 'Saving…' : 'Save draft version'}
          </button>
        </div>
      </section>

      {createOutcomeAmbiguous ? (
        <section
          className="panel schema-builder-ambiguity"
          data-schema-create-ambiguity
          role="alert"
        >
          <div>
            <strong>Save outcome needs operator verification</strong>
            <p>
              Portfolio cannot prove whether the create request committed.
              Save stays disabled until you resolve that uncertainty.
            </p>
            <small>
              Refresh and inspect the canonical version list. If the intended
              version is there, select it and discard this local copy. Only
              re-enable Save after you have confirmed that no new canonical
              version exists.
            </small>
          </div>
          <button
            className="button-secondary"
            onClick={onConfirmRetry}
            type="button"
          >
            I confirmed no version was created — allow retry
          </button>
        </section>
      ) : null}

      <section className="panel">
        <div className="schema-builder-field-grid">
          <label>
            Schema code
            <input
              onChange={(event) =>
                onDraft({ ...draft, schemaCode: event.currentTarget.value })
              }
              placeholder="MOVE-IN"
              spellCheck={false}
              value={draft.schemaCode}
            />
          </label>
          <label>
            Title
            <input
              onChange={(event) =>
                onDraft({ ...draft, title: event.currentTarget.value })
              }
              placeholder="Move-in inspection"
              value={draft.title}
            />
          </label>
          <label>
            Inspection type
            <select
              onChange={(event) =>
                onDraft({
                  ...draft,
                  inspectionType: event.currentTarget
                    .value as InspectionSchemaBuilderDraft['inspectionType'],
                })
              }
              value={draft.inspectionType}
            >
              {INSPECTION_TYPES.map((type) => (
                <option key={type} value={type}>
                  {formatDetailKey(type)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <fieldset className="schema-signature-roles">
          <legend>Required signatures</legend>
          {INSPECTION_SIGNATURE_ROLES.map((role) => (
            <label key={role}>
              <input
                checked={draft.requiredSignatureRoles.includes(role)}
                onChange={(event) => {
                  const next = event.currentTarget.checked
                    ? [...draft.requiredSignatureRoles, role]
                    : draft.requiredSignatureRoles.filter(
                        (candidate) => candidate !== role,
                      );
                  onDraft({
                    ...draft,
                    requiredSignatureRoles: next as readonly InspectionSignatureRole[],
                  });
                }}
                type="checkbox"
              />
              {formatDetailKey(role)}
            </label>
          ))}
        </fieldset>
      </section>

      {issues.length > 0 ? (
        <section className="panel schema-builder-validation" role="alert">
          <strong>Fix before saving</strong>
          <ul>
            {issues.slice(0, 12).map((issue, index) => (
              <li key={`${issue.path}-${index}`}>
                {issue.message} <code>{issue.path}</code>
              </li>
            ))}
          </ul>
          {issues.length > 12 ? (
            <small>{issues.length - 12} more validation issues.</small>
          ) : null}
        </section>
      ) : (
        <section className="schema-builder-valid" aria-live="polite">
          Draft passes client structural validation. The domain validator still
          runs on Save draft.
        </section>
      )}

      <div className="schema-section-list">
        {draft.sections.map((section, sectionIndex) => (
          <SectionEditor
            draft={draft}
            key={section.id}
            onDraft={onDraft}
            section={section}
            sectionIndex={sectionIndex}
          />
        ))}
      </div>

      <button className="button-secondary schema-add-section" onClick={addSection} type="button">
        Add section
      </button>

      <SchemaPreview draft={draft} />
    </div>
  );
}

function CanonicalSchemaDetail({
  schema,
  busy,
  onDuplicate,
  onPublish,
}: {
  readonly schema: InspectionSchemaVersionResponse;
  readonly busy: boolean;
  readonly onDuplicate: () => void;
  readonly onPublish: () => void;
}) {
  return (
    <div className="schema-canonical-detail">
      <section className="panel schema-canonical-heading">
        <div>
          <p className="eyebrow">Canonical schema version</p>
          <h2>{schema.title}</h2>
          <p className="muted">
            {schema.schemaCode} · v{schema.versionNumber} ·{' '}
            {formatDetailKey(schema.inspectionType)}
          </p>
        </div>
        <span className={statusClass(schema.status)}>{schema.status}</span>
      </section>

      <section className="panel schema-canonical-actions">
        <div>
          <strong>Immutable version content</strong>
          <p className="muted">
            Duplicate this version to revise it. Existing published history and
            Inspections keep their original schema version.
          </p>
        </div>
        <div className="schema-builder-button-row">
          <button className="button-secondary" disabled={busy} onClick={onDuplicate} type="button">
            Duplicate as new draft
          </button>
          {schema.status === 'draft' ? (
            <button className="button-primary" disabled={busy} onClick={onPublish} type="button">
              {busy ? 'Publishing…' : 'Publish this draft'}
            </button>
          ) : null}
        </div>
      </section>

      <section className="schema-canonical-sections">
        {schema.sections
          .slice()
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((section) => (
            <article className="schema-canonical-section" key={section.id}>
              <div className="schema-preview-section-heading">
                <div>
                  <strong>{section.title}</strong>
                  <small>
                    {section.scope === 'unit'
                      ? 'Unit scope'
                      : `Space scope · ${section.spaceTypes
                          .map(formatDetailKey)
                          .join(', ')}`}
                  </small>
                </div>
                <code>{section.key}</code>
              </div>
              {section.description ? <p>{section.description}</p> : null}
              <div className="schema-preview-items">
                {section.items
                  .slice()
                  .sort((a, b) => a.sortOrder - b.sortOrder)
                  .map((item) => (
                    <div className="schema-preview-item" key={item.id}>
                      <div>
                        <strong>
                          {item.label}
                          {item.required ? ' *' : ''}
                        </strong>
                        <small>
                          {formatDetailKey(item.type)} · <code>{item.key}</code>
                        </small>
                      </div>
                      {item.options.length > 0 ? (
                        <small>
                          Options: {item.options.map((option) => option.label).join(' · ')}
                        </small>
                      ) : null}
                      {item.visibleWhen ? (
                        <small>Visible when: {conditionSummary(item.visibleWhen)}</small>
                      ) : null}
                      {item.requiredWhen ? (
                        <small>Required when: {conditionSummary(item.requiredWhen)}</small>
                      ) : null}
                    </div>
                  ))}
              </div>
            </article>
          ))}
      </section>
    </div>
  );
}

function Message({
  kind,
  children,
}: {
  readonly kind: 'error' | 'success';
  readonly children: ReactNode;
}) {
  return (
    <p className={kind === 'error' ? 'form-error' : 'form-success'} role={kind === 'error' ? 'alert' : 'status'}>
      {children}
    </p>
  );
}

export function InspectionSchemaAdministration({
  api,
  setNavigationBlocker,
}: InspectionSchemaAdministrationProps) {
  const [schemas, setSchemas] =
    useState<readonly InspectionSchemaVersionResponse[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<InspectionSchemaBuilderDraft | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [createOutcomeAmbiguous, setCreateOutcomeAmbiguous] = useState(false);
  const [pending, setPending] = useState<'save' | 'publish' | null>(null);
  const mountedRef = useRef(true);
  const readGenerationRef = useRef(0);
  const writePendingRef = useRef(false);

  const fetchSchemas = useCallback(async () => {
    const response = await api.get(
      inspectionSchemasPath(),
      inspectionSchemaVersionListResponseSchema,
    );
    return sortedSchemas(response.items);
  }, [api]);

  const load = useCallback(async () => {
    const generation = ++readGenerationRef.current;
    setLoadError(null);
    try {
      const items = await fetchSchemas();
      if (!mountedRef.current || readGenerationRef.current !== generation) return;
      setSchemas(items);
      setSelectedId((current) =>
        current && items.some((schema) => schema.id === current)
          ? current
          : items[0]?.id ?? null,
      );
    } catch (cause) {
      if (!mountedRef.current || readGenerationRef.current !== generation) return;
      setLoadError(
        cause instanceof Error
          ? cause.message
          : 'Inspection schemas could not be loaded.',
      );
    }
  }, [fetchSchemas]);

  useEffect(() => {
    mountedRef.current = true;
    void load();
    return () => {
      mountedRef.current = false;
      readGenerationRef.current += 1;
    };
  }, [load]);

  useEffect(() => {
    if (pending) {
      setNavigationBlocker(() => false);
      return () => setNavigationBlocker(null);
    }
    if (draft) {
      setNavigationBlocker(() =>
        window.confirm(
          'This Inspection schema draft has unsaved changes. Leave and discard it?',
        ),
      );
      return () => setNavigationBlocker(null);
    }
    setNavigationBlocker(null);
    return () => setNavigationBlocker(null);
  }, [draft, pending, setNavigationBlocker]);

  const selected = useMemo(
    () => schemas?.find((schema) => schema.id === selectedId) ?? null,
    [schemas, selectedId],
  );
  const issues = useMemo(
    () => (draft ? validateInspectionSchemaBuilderDraft(draft) : []),
    [draft],
  );

  function confirmDiscardDraft(): boolean {
    return (
      draft === null ||
      window.confirm('Discard the current unsaved Inspection schema draft?')
    );
  }

  function startNew() {
    if (!confirmDiscardDraft()) return;
    setCreateOutcomeAmbiguous(false);
    setDraft(newInspectionSchemaBuilderDraft());
    setActionError(null);
    setSuccess(null);
  }

  function startDuplicate(schema: InspectionSchemaVersionResponse) {
    if (!confirmDiscardDraft()) return;
    setCreateOutcomeAmbiguous(false);
    setDraft(inspectionSchemaDraftFromVersion(schema));
    setActionError(null);
    setSuccess(
      `Editing a local copy of ${schema.schemaCode} v${schema.versionNumber}. Saving creates a new immutable version.`,
    );
  }

  async function saveDraft() {
    if (
      !draft ||
      writePendingRef.current ||
      createOutcomeAmbiguous
    ) {
      return;
    }
    const validation = validateInspectionSchemaBuilderDraft(draft);
    if (validation.length > 0) {
      setActionError('Fix the highlighted schema validation issues before saving.');
      return;
    }
    const request = inspectionSchemaDraftRequest(draft);
    const parsed = createInspectionSchemaVersionRequestSchema.safeParse(request);
    if (!parsed.success) {
      setActionError('The local schema draft does not match the API contract.');
      return;
    }

    writePendingRef.current = true;
    setPending('save');
    setActionError(null);
    setSuccess(null);

    try {
      let saved: InspectionSchemaVersionResponse;
      try {
        saved = await api.post(
          inspectionSchemasPath(),
          parsed.data,
          inspectionSchemaVersionResponseSchema,
        );
      } catch (cause) {
        if (!isAmbiguousWriteFailure(cause)) throw cause;

        if (mountedRef.current) {
          setCreateOutcomeAmbiguous(true);
          setActionError(
            'Schema save outcome is ambiguous. Save is disabled until an operator verifies the canonical version list.',
          );
        }

        try {
          const canonical = await fetchSchemas();
          if (!mountedRef.current) return;
          setSchemas(canonical);
          setActionError(
            'Schema save outcome is ambiguous. Canonical versions were reloaded. Do not retry automatically; verify the version list first.',
          );
        } catch (rereadCause) {
          if (!mountedRef.current) return;
          setActionError(
            `Schema save outcome is ambiguous and the canonical reread failed: ${
              rereadCause instanceof Error
                ? rereadCause.message
                : 'request failed'
            }. Save remains disabled until an operator resolves the uncertainty.`,
          );
        }
        return;
      }

      const canonical = await fetchSchemas();
      if (!mountedRef.current) return;
      setSchemas(canonical);
      setSelectedId(saved.id);
      setDraft(null);
      setCreateOutcomeAmbiguous(false);
      setSuccess(
        `${saved.schemaCode} v${saved.versionNumber} saved as a canonical draft.`,
      );
    } catch (cause) {
      if (!mountedRef.current) return;
      setActionError(
        cause instanceof Error
          ? cause.message
          : 'Inspection schema draft could not be saved.',
      );
    } finally {
      writePendingRef.current = false;
      if (mountedRef.current) setPending(null);
    }
  }

  async function publish(schema: InspectionSchemaVersionResponse) {
    if (writePendingRef.current || schema.status !== 'draft') return;
    writePendingRef.current = true;
    setPending('publish');
    setActionError(null);
    setSuccess(null);

    try {
      let published: InspectionSchemaVersionResponse;
      try {
        published = await api.post(
          inspectionSchemaPublishPath(schema.id),
          {},
          inspectionSchemaVersionResponseSchema,
        );
      } catch (cause) {
        if (!isAmbiguousWriteFailure(cause)) throw cause;
        const canonical = await fetchSchemas();
        if (mountedRef.current) setSchemas(canonical);
        const recovered = canonical.find(
          (candidate) =>
            candidate.id === schema.id && candidate.status === 'published',
        );
        if (!recovered) {
          setActionError(
            'Publish outcome is ambiguous. Canonical versions were reloaded; verify the schema status before retrying.',
          );
          return;
        }
        published = recovered;
      }

      const canonical = await fetchSchemas();
      if (!mountedRef.current) return;
      setSchemas(canonical);
      setSelectedId(published.id);
      setSuccess(
        `${published.schemaCode} v${published.versionNumber} is published and available for new Inspections.`,
      );
    } catch (cause) {
      if (!mountedRef.current) return;
      setActionError(
        cause instanceof Error
          ? cause.message
          : 'Inspection schema could not be published.',
      );
    } finally {
      writePendingRef.current = false;
      if (mountedRef.current) setPending(null);
    }
  }

  return (
    <div className="inspection-schema-admin">
      <section className="page-heading schema-admin-page-heading">
        <div>
          <p className="eyebrow">Inspection administration</p>
          <h1>Inspection Schema Builder</h1>
          <p className="lede">
            Build versioned Inspection checklists visually. SQL remains a
            bootstrap/development mechanism, not the operating workflow.
          </p>
        </div>
        <button className="button-primary" disabled={pending !== null} onClick={startNew} type="button">
          New schema
        </button>
      </section>

      {loadError ? <Message kind="error">{loadError}</Message> : null}
      {actionError ? <Message kind="error">{actionError}</Message> : null}
      {success ? <Message kind="success">{success}</Message> : null}

      <div className="schema-admin-layout">
        <aside className="schema-version-sidebar">
          <div className="schema-builder-subheading">
            <div>
              <strong>Schema versions</strong>
              <small>Published history stays immutable.</small>
            </div>
            <button className="button-secondary" disabled={pending !== null} onClick={() => void load()} type="button">
              Refresh
            </button>
          </div>
          {schemas === null ? (
            <p className="muted">Loading schemas…</p>
          ) : schemas.length === 0 ? (
            <p className="muted">No Inspection schemas yet.</p>
          ) : (
            <div className="schema-version-list">
              {schemas.map((schema) => (
                <button
                  className={`schema-version-card ${selectedId === schema.id ? 'schema-version-card-active' : ''}`}
                  key={schema.id}
                  onClick={() => {
                    if (!confirmDiscardDraft()) return;
                    setDraft(null);
                    setCreateOutcomeAmbiguous(false);
                    setSelectedId(schema.id);
                    setActionError(null);
                  }}
                  type="button"
                >
                  <SchemaVersionSummary schema={schema} />
                </button>
              ))}
            </div>
          )}
        </aside>

        <main className="schema-admin-main">
          {draft ? (
            <SchemaDraftEditor
              draft={draft}
              issues={issues}
              createOutcomeAmbiguous={createOutcomeAmbiguous}
              onCancel={() => {
                if (!confirmDiscardDraft()) return;
                setCreateOutcomeAmbiguous(false);
                setDraft(null);
              }}
              onConfirmRetry={() => {
                setCreateOutcomeAmbiguous(false);
                setActionError(null);
                setSuccess(
                  'Schema draft retry re-enabled after operator verification.',
                );
              }}
              onDraft={setDraft}
              onSave={() => void saveDraft()}
              saving={pending === 'save'}
            />
          ) : selected ? (
            <CanonicalSchemaDetail
              busy={pending !== null}
              onDuplicate={() => startDuplicate(selected)}
              onPublish={() => void publish(selected)}
              schema={selected}
            />
          ) : schemas?.length === 0 ? (
            <section className="panel empty-state">
              <h2>Create the first Inspection schema</h2>
              <p>
                Start with a visual draft, add Unit/Space sections and fields,
                preview the result, then save and publish.
              </p>
              <button className="button-primary" onClick={startNew} type="button">
                Open Schema Builder
              </button>
            </section>
          ) : (
            <section className="panel">
              <p className="muted">Select a schema version.</p>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
