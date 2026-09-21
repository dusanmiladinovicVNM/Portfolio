import {
  inspectionBundleResponseSchema,
  inspectionListResponseSchema,
  inspectionResponseSchema,
  saveInspectionSectionResponseSchema,
  type InspectionBundleResponse,
  type InspectionItemResponse,
  type InspectionResponseDto,
  type SaveInspectionSectionRequest,
} from '@portfolio/contracts';
import {
  evaluateInspectionCondition,
  type InspectionAnswerValue,
} from '@portfolio/domain';
import { type FormEvent, useEffect, useMemo, useState } from 'react';
import {
  inspectionPath,
  inspectionSectionPath,
  inspectionStartPath,
  unitInspectionsPath,
} from '../api/paths.js';
import {
  PortfolioApiError,
  type PortfolioApi,
} from '../api/portfolio-api.js';
import { WorkspaceLink } from '../navigation/WorkspaceLink.js';
import { unitRoute } from '../navigation/workspace-route.js';
import type { NavigateWorkspace } from '../navigation/use-workspace-navigation.js';
import { formatDetailKey } from '../presentation/format.js';

type SchemaSection = InspectionBundleResponse['schema']['sections'][number];
type SchemaItem = SchemaSection['items'][number];

interface DraftEntry {
  readonly value: InspectionAnswerValue | undefined;
  readonly comment: string;
}

type DraftByItem = Readonly<Record<string, DraftEntry>>;
type TouchedByItem = Readonly<Record<string, boolean>>;

interface UnitInspectionsProps {
  readonly api: PortfolioApi;
  readonly propertyId: string;
  readonly unitId: string;
  readonly asOf: string;
  readonly inspectionId?: string | undefined;
  readonly inspectionSectionId?: string | undefined;
  readonly navigate: NavigateWorkspace;
}

function answerEqual(
  left: InspectionAnswerValue | undefined,
  right: InspectionAnswerValue | undefined,
): boolean {
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => value === right[index])
    );
  }
  return left === right;
}

function normalizedAnswer(
  item: SchemaItem,
  value: InspectionAnswerValue | undefined,
): InspectionAnswerValue | undefined {
  if (value === undefined) return undefined;
  if (Array.isArray(value)) return value.length === 0 ? undefined : value;
  if (typeof value === 'string') {
    if (item.type === 'text' || item.type === 'textarea') return value;
    return value.trim() === '' ? undefined : value;
  }
  return value;
}

function responseByItem(
  responses: readonly InspectionItemResponse[],
): ReadonlyMap<string, InspectionItemResponse> {
  return new Map(responses.map((response) => [response.itemId, response]));
}

function createDraft(
  section: SchemaSection,
  responses: readonly InspectionItemResponse[],
): DraftByItem {
  const canonical = responseByItem(responses);
  return Object.fromEntries(
    section.items.map((item) => {
      const response = canonical.get(item.id);
      return [
        item.id,
        {
          value: response?.value,
          comment: response?.comment ?? '',
        },
      ];
    }),
  );
}

function valuesByFieldKey(
  bundle: InspectionBundleResponse,
  section: SchemaSection,
  draft: DraftByItem,
): ReadonlyMap<string, InspectionAnswerValue> {
  const itemById = new Map(
    bundle.schema.sections.flatMap((candidate) =>
      candidate.items.map((item) => [item.id, item] as const),
    ),
  );
  const values = new Map<string, InspectionAnswerValue>();

  for (const response of bundle.responses) {
    const item = itemById.get(response.itemId);
    if (item) values.set(item.key.toLowerCase(), response.value);
  }

  for (const item of section.items) {
    const value = normalizedAnswer(item, draft[item.id]?.value);
    if (value === undefined) {
      values.delete(item.key.toLowerCase());
    } else {
      values.set(item.key.toLowerCase(), value);
    }
  }

  return values;
}

function buildPatch(
  section: SchemaSection,
  responses: readonly InspectionItemResponse[],
  draft: DraftByItem,
  touched: TouchedByItem,
  expectedRevision: number,
): SaveInspectionSectionRequest | null {
  const canonical = responseByItem(responses);
  const set: SaveInspectionSectionRequest['set'] = [];
  const clear: string[] = [];

  for (const item of section.items) {
    if (!touched[item.id]) continue;

    const before = canonical.get(item.id);
    const entry = draft[item.id] ?? { value: undefined, comment: '' };
    const nextValue = normalizedAnswer(item, entry.value);
    const nextComment = entry.comment.trim() || null;

    if (nextValue === undefined) {
      if (before) clear.push(item.id);
      continue;
    }

    if (
      before &&
      answerEqual(before.value, nextValue) &&
      (before.comment ?? null) === nextComment
    ) {
      continue;
    }

    set.push({
      itemId: item.id,
      value: Array.isArray(nextValue) ? [...nextValue] : nextValue,
      comment: nextComment,
    });
  }

  if (set.length === 0 && clear.length === 0) return null;
  return { expectedRevision, set, clear };
}

function sectionRevision(
  bundle: InspectionBundleResponse,
  sectionId: string,
): number {
  return (
    bundle.sectionStates.find((state) => state.sectionId === sectionId)
      ?.revision ?? 0
  );
}

function Field({
  item,
  entry,
  disabled,
  onChange,
}: {
  readonly item: SchemaItem;
  readonly entry: DraftEntry;
  readonly disabled: boolean;
  readonly onChange: (entry: DraftEntry) => void;
}) {
  const updateValue = (value: InspectionAnswerValue | undefined) =>
    onChange({ ...entry, value });

  let control;
  switch (item.type) {
    case 'textarea':
      control = (
        <textarea
          disabled={disabled}
          onChange={(event) => updateValue(event.currentTarget.value)}
          rows={4}
          value={typeof entry.value === 'string' ? entry.value : ''}
        />
      );
      break;
    case 'checkbox':
      control = (
        <select
          disabled={disabled}
          onChange={(event) => {
            const value = event.currentTarget.value;
            updateValue(
              value === '' ? undefined : value === 'true',
            );
          }}
          value={
            typeof entry.value === 'boolean'
              ? String(entry.value)
              : ''
          }
        >
          <option value="">Not answered</option>
          <option value="true">Yes</option>
          <option value="false">No</option>
        </select>
      );
      break;
    case 'select':
    case 'radio':
      control = (
        <select
          disabled={disabled}
          onChange={(event) =>
            updateValue(event.currentTarget.value || undefined)
          }
          value={typeof entry.value === 'string' ? entry.value : ''}
        >
          <option value="">Not answered</option>
          {item.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      );
      break;
    case 'multiselect': {
      const selected = Array.isArray(entry.value) ? entry.value : [];
      control = (
        <div className="inspection-multiselect">
          {item.options.map((option) => (
            <label key={option.value}>
              <input
                checked={selected.includes(option.value)}
                disabled={disabled}
                onChange={(event) => {
                  const next = event.currentTarget.checked
                    ? [...selected, option.value]
                    : selected.filter((value) => value !== option.value);
                  updateValue(next);
                }}
                type="checkbox"
              />
              {option.label}
            </label>
          ))}
        </div>
      );
      break;
    }
    case 'date':
      control = (
        <input
          disabled={disabled}
          onChange={(event) =>
            updateValue(event.currentTarget.value || undefined)
          }
          type="date"
          value={typeof entry.value === 'string' ? entry.value : ''}
        />
      );
      break;
    case 'number':
      control = (
        <input
          disabled={disabled}
          inputMode="decimal"
          onChange={(event) =>
            updateValue(event.currentTarget.value || undefined)
          }
          type="text"
          value={typeof entry.value === 'string' ? entry.value : ''}
        />
      );
      break;
    case 'text':
      control = (
        <input
          disabled={disabled}
          onChange={(event) => updateValue(event.currentTarget.value)}
          type="text"
          value={typeof entry.value === 'string' ? entry.value : ''}
        />
      );
      break;
  }

  return (
    <div className="inspection-field">
      {control}
      <label className="inspection-comment">
        Comment
        <textarea
          disabled={disabled || normalizedAnswer(item, entry.value) === undefined}
          onChange={(event) =>
            onChange({ ...entry, comment: event.currentTarget.value })
          }
          rows={2}
          value={entry.comment}
        />
      </label>
    </div>
  );
}

export function UnitInspections({
  api,
  propertyId,
  unitId,
  asOf,
  inspectionId,
  inspectionSectionId,
  navigate,
}: UnitInspectionsProps) {
  const [inspections, setInspections] =
    useState<readonly InspectionResponseDto[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [bundle, setBundle] = useState<InspectionBundleResponse | null>(null);
  const [bundleError, setBundleError] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftByItem>({});
  const [touched, setTouched] = useState<TouchedByItem>({});
  const [saving, setSaving] = useState(false);
  const [starting, setStarting] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setInspections(null);
    setListError(null);

    void api
      .get(unitInspectionsPath(unitId), inspectionListResponseSchema, {
        signal: controller.signal,
      })
      .then((response) => setInspections(response.items))
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setListError(
          cause instanceof Error
            ? cause.message
            : 'Inspections could not be loaded.',
        );
      });

    return () => controller.abort();
  }, [api, unitId]);

  async function loadBundle(id: string): Promise<InspectionBundleResponse> {
    const result = await api.get(
      inspectionPath(id),
      inspectionBundleResponseSchema,
    );
    if (result.inspection.unitId !== unitId) {
      throw new Error(
        'Inspection route does not belong to the Unit encoded in the URL.',
      );
    }
    return result;
  }

  useEffect(() => {
    setBundle(null);
    setBundleError(null);
    setSaveError(null);
    setConflict(false);
    if (!inspectionId) return;

    let active = true;
    void loadBundle(inspectionId)
      .then((result) => {
        if (active) setBundle(result);
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setBundleError(
          cause instanceof Error
            ? cause.message
            : 'Inspection could not be loaded.',
        );
      });

    return () => {
      active = false;
    };
  }, [api, inspectionId, unitId]);

  const selectedSection = useMemo(() => {
    if (!bundle) return null;
    return (
      bundle.schema.sections.find(
        (section) => section.id === inspectionSectionId,
      ) ??
      bundle.schema.sections[0] ??
      null
    );
  }, [bundle, inspectionSectionId]);

  useEffect(() => {
    if (!bundle || !inspectionId || !selectedSection) return;
    if (inspectionSectionId === selectedSection.id) return;

    navigate(
      unitRoute(propertyId, unitId, asOf, 'inspections', {
        inspectionId,
        inspectionSectionId: selectedSection.id,
      }),
      { replace: true },
    );
  }, [
    asOf,
    bundle,
    inspectionId,
    inspectionSectionId,
    navigate,
    propertyId,
    selectedSection,
    unitId,
  ]);

  useEffect(() => {
    if (!bundle || !selectedSection) {
      setDraft({});
      setTouched({});
      return;
    }
    setDraft(createDraft(selectedSection, bundle.responses));
    setTouched({});
    setSaveError(null);
    setConflict(false);
  }, [bundle, selectedSection?.id]);

  const localValues = useMemo(
    () =>
      bundle && selectedSection
        ? valuesByFieldKey(bundle, selectedSection, draft)
        : new Map<string, InspectionAnswerValue>(),
    [bundle, draft, selectedSection],
  );

  const currentRevision =
    bundle && selectedSection
      ? sectionRevision(bundle, selectedSection.id)
      : 0;

  const patch =
    bundle && selectedSection
      ? buildPatch(
          selectedSection,
          bundle.responses,
          draft,
          touched,
          currentRevision,
        )
      : null;

  const editable = bundle?.inspection.status === 'in_progress';

  function changeItem(itemId: string, entry: DraftEntry) {
    setDraft((current) => ({ ...current, [itemId]: entry }));
    setTouched((current) => ({ ...current, [itemId]: true }));
    setSaveError(null);
  }

  async function startInspection() {
    if (!bundle || starting) return;
    setStarting(true);
    setSaveError(null);
    try {
      const inspection = await api.post(
        inspectionStartPath(bundle.inspection.id),
        { expectedVersion: bundle.inspection.version },
        inspectionResponseSchema,
      );
      setBundle((current) =>
        current ? { ...current, inspection } : current,
      );
    } catch (cause) {
      setSaveError(
        cause instanceof Error ? cause.message : 'Inspection could not start.',
      );
    } finally {
      setStarting(false);
    }
  }

  async function saveSection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!bundle || !selectedSection || !patch || saving) return;

    setSaving(true);
    setSaveError(null);
    setConflict(false);

    try {
      const saved = await api.patch(
        inspectionSectionPath(bundle.inspection.id, selectedSection.id),
        patch,
        saveInspectionSectionResponseSchema,
      );

      const changedIds = new Set([
        ...saved.responses.map((response) => response.itemId),
        ...saved.clearedItemIds,
      ]);
      const responses = [
        ...bundle.responses.filter(
          (response) => !changedIds.has(response.itemId),
        ),
        ...saved.responses,
      ];

      setBundle({
        ...bundle,
        inspection: {
          ...bundle.inspection,
          contentRevision: saved.contentRevision,
        },
        sectionStates: bundle.sectionStates.map((state) =>
          state.sectionId === selectedSection.id
            ? { ...state, revision: saved.revision }
            : state,
        ),
        responses,
      });
    } catch (cause) {
      if (
        cause instanceof PortfolioApiError &&
        cause.code === 'INSPECTION_SECTION_REVISION_CONFLICT'
      ) {
        setConflict(true);
        setSaveError(
          'This section changed on the server. Your local answers are still visible.',
        );
      } else {
        setSaveError(
          cause instanceof Error
            ? cause.message
            : 'Inspection section could not be saved.',
        );
      }
    } finally {
      setSaving(false);
    }
  }

  async function reloadAfterConflict() {
    if (!inspectionId) return;
    setSaving(true);
    setSaveError(null);
    try {
      const fresh = await loadBundle(inspectionId);
      setBundle(fresh);
      setConflict(false);
    } catch (cause) {
      setSaveError(
        cause instanceof Error
          ? cause.message
          : 'Inspection could not be reloaded.',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="inspection-workspace">
      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Field workflow</p>
            <h2>Inspections</h2>
          </div>
          <span className="section-note">
            Online explicit save · offline comes later
          </span>
        </div>

        {listError ? <p className="form-error" role="alert">{listError}</p> : null}
        {!listError && inspections === null ? (
          <p className="muted" aria-live="polite">Loading Inspections…</p>
        ) : null}
        {inspections?.length === 0 ? (
          <p className="muted">No Inspections are assigned to this Unit.</p>
        ) : null}

        {inspections && inspections.length > 0 ? (
          <div className="inspection-list">
            {inspections.map((inspection) => (
              <WorkspaceLink
                ariaCurrent={inspection.id === inspectionId ? 'page' : undefined}
                className={`inspection-card ${
                  inspection.id === inspectionId
                    ? 'inspection-card-active'
                    : ''
                }`}
                key={inspection.id}
                navigate={navigate}
                route={unitRoute(
                  propertyId,
                  unitId,
                  asOf,
                  'inspections',
                  { inspectionId: inspection.id },
                )}
              >
                <div>
                  <strong>{inspection.code}</strong>
                  <span>{formatDetailKey(inspection.inspectionType)}</span>
                </div>
                <div>
                  <span className="status-chip">{inspection.status}</span>
                  <small>{inspection.scheduledFor ?? 'Unscheduled'}</small>
                </div>
              </WorkspaceLink>
            ))}
          </div>
        ) : null}
      </section>

      {bundleError ? (
        <section className="panel state-panel" role="alert">
          <h2>Inspection unavailable</h2>
          <p>{bundleError}</p>
        </section>
      ) : null}

      {inspectionId && !bundleError && bundle === null ? (
        <section className="panel state-panel" aria-live="polite">
          <h2>Loading Inspection…</h2>
        </section>
      ) : null}

      {bundle ? (
        <section className="panel inspection-editor">
          <div className="inspection-editor-header">
            <div>
              <p className="eyebrow">
                {formatDetailKey(bundle.inspection.inspectionType)}
              </p>
              <h2>{bundle.inspection.code}</h2>
              <p className="muted">
                {bundle.schema.title} · lifecycle v{bundle.inspection.version} ·
                content r{bundle.inspection.contentRevision}
              </p>
            </div>
            <span className="status-chip">{bundle.inspection.status}</span>
          </div>

          {bundle.inspection.status === 'draft' ? (
            <div className="inspection-start-callout">
              <div>
                <strong>Ready to begin field work</strong>
                <span>Start the Inspection before editing responses.</span>
              </div>
              <button
                className="button-secondary"
                disabled={starting}
                onClick={startInspection}
                type="button"
              >
                {starting ? 'Starting…' : 'Start Inspection'}
              </button>
            </div>
          ) : null}

          <div className="inspection-layout">
            <nav
              aria-label="Inspection sections"
              className="inspection-sections"
            >
              {bundle.schema.sections.map((section) => (
                <WorkspaceLink
                  ariaCurrent={
                    selectedSection?.id === section.id ? 'page' : undefined
                  }
                  className={`inspection-section-link ${
                    selectedSection?.id === section.id
                      ? 'inspection-section-link-active'
                      : ''
                  }`}
                  key={section.id}
                  navigate={navigate}
                  route={unitRoute(
                    propertyId,
                    unitId,
                    asOf,
                    'inspections',
                    {
                      inspectionId: bundle.inspection.id,
                      inspectionSectionId: section.id,
                    },
                  )}
                >
                  <strong>{section.title}</strong>
                  <small>
                    revision {sectionRevision(bundle, section.id)}
                  </small>
                </WorkspaceLink>
              ))}
            </nav>

            {selectedSection ? (
              <form className="inspection-section-form" onSubmit={saveSection}>
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">
                      Section revision {currentRevision}
                    </p>
                    <h3>{selectedSection.title}</h3>
                    {selectedSection.description ? (
                      <p className="muted">{selectedSection.description}</p>
                    ) : null}
                  </div>
                </div>

                {selectedSection.items.map((item) => {
                  const visible =
                    item.visibleWhen === null ||
                    evaluateInspectionCondition(
                      item.visibleWhen,
                      localValues,
                    );
                  if (!visible) return null;

                  const required =
                    item.required ||
                    (item.requiredWhen !== null &&
                      evaluateInspectionCondition(
                        item.requiredWhen,
                        localValues,
                      ));
                  const entry =
                    draft[item.id] ?? { value: undefined, comment: '' };

                  return (
                    <div className="inspection-item" key={item.id}>
                      <label className="inspection-item-label">
                        <span>
                          {item.label}
                          {required ? (
                            <strong
                              aria-label="Required"
                              className="inspection-required"
                            >
                              {' '}*
                            </strong>
                          ) : null}
                        </span>
                        <small>{formatDetailKey(item.type)}</small>
                      </label>
                      <Field
                        disabled={!editable || saving}
                        entry={entry}
                        item={item}
                        onChange={(next) => changeItem(item.id, next)}
                      />
                    </div>
                  );
                })}

                {saveError ? (
                  <div className="inspection-save-error" role="alert">
                    <p className="form-error">{saveError}</p>
                    {conflict ? (
                      <button
                        className="button-secondary"
                        disabled={saving}
                        onClick={reloadAfterConflict}
                        type="button"
                      >
                        Reload server version and discard local edits
                      </button>
                    ) : null}
                  </div>
                ) : null}

                <div className="inspection-save-bar">
                  <span className="muted">
                    {patch
                      ? 'Unsaved section changes'
                      : 'Section matches canonical server state'}
                  </span>
                  <button
                    disabled={!editable || !patch || saving}
                    type="submit"
                  >
                    {saving ? 'Saving…' : 'Save section'}
                  </button>
                </div>
              </form>
            ) : (
              <p className="muted">This Inspection schema has no sections.</p>
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}
