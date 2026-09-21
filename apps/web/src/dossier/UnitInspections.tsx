import {
  inspectionBundleResponseSchema,
  inspectionListResponseSchema,
  inspectionResponseSchema,
  saveInspectionSectionResponseSchema,
  type InspectionBundleResponse,
  type InspectionItemResponse,
  type InspectionResponseDto,
  type SaveInspectionSectionRequest,
  type SaveInspectionSectionResponse,
} from '@portfolio/contracts';
import {
  evaluateInspectionCondition,
  type InspectionAnswerValue,
} from '@portfolio/domain';
import {
  type FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
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
import type {
  NavigateWorkspace,
  SetNavigationBlocker,
} from '../navigation/use-workspace-navigation.js';
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
  readonly setNavigationBlocker: SetNavigationBlocker;
}

function answerEqual(
  left: InspectionAnswerValue | undefined,
  right: InspectionAnswerValue | undefined,
): boolean {
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right)) return false;
    if (left.length !== right.length) return false;
    const rightValues = new Set(right);
    return left.every((value) => rightValues.has(value));
  }
  return left === right;
}

export function normalizedInspectionAnswer(
  _item: SchemaItem,
  value: InspectionAnswerValue | undefined,
): InspectionAnswerValue | undefined {
  if (value === undefined) return undefined;
  if (Array.isArray(value)) return value.length === 0 ? undefined : value;
  if (typeof value === 'string') {
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
    const value = normalizedInspectionAnswer(item, draft[item.id]?.value);
    if (value === undefined) {
      values.delete(item.key.toLowerCase());
    } else {
      values.set(item.key.toLowerCase(), value);
    }
  }

  return values;
}

export function buildInspectionSectionPatch(
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
    const nextValue = normalizedInspectionAnswer(item, entry.value);
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
      value:
        typeof nextValue === 'string' || typeof nextValue === 'boolean'
          ? nextValue
          : [...nextValue],
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

export function inspectionDraftResetKey(
  bundle: InspectionBundleResponse,
  sectionId: string,
): string {
  return `${bundle.inspection.id}:${sectionId}:${sectionRevision(bundle, sectionId)}`;
}

export function mergeInspectionStart(
  current: InspectionBundleResponse,
  targetInspectionId: string,
  expectedVersion: number,
  inspection: InspectionResponseDto,
): InspectionBundleResponse {
  if (inspection.id !== targetInspectionId) {
    throw new Error(
      'Inspection start response crossed its aggregate ownership boundary.',
    );
  }
  if (
    current.inspection.id !== targetInspectionId ||
    current.inspection.version !== expectedVersion
  ) {
    return current;
  }
  return { ...current, inspection };
}

export function mergeInspectionSectionSave(
  current: InspectionBundleResponse,
  targetInspectionId: string,
  targetSectionId: string,
  expectedRevision: number,
  saved: SaveInspectionSectionResponse,
): InspectionBundleResponse {
  if (
    current.inspection.id !== targetInspectionId ||
    sectionRevision(current, targetSectionId) !== expectedRevision
  ) {
    return current;
  }

  for (const response of saved.responses) {
    if (
      response.inspectionId !== targetInspectionId ||
      response.sectionId !== targetSectionId
    ) {
      throw new Error(
        'Inspection section save response crossed its aggregate ownership boundary.',
      );
    }
  }

  const changedIds = new Set([
    ...saved.responses.map((response) => response.itemId),
    ...saved.clearedItemIds,
  ]);

  return {
    ...current,
    inspection: {
      ...current.inspection,
      contentRevision: Math.max(
        current.inspection.contentRevision,
        saved.contentRevision,
      ),
    },
    sectionStates: current.sectionStates.map((state) =>
      state.sectionId === targetSectionId
        ? { ...state, revision: saved.revision }
        : state,
    ),
    responses: [
      ...current.responses.filter(
        (response) => !changedIds.has(response.itemId),
      ),
      ...saved.responses,
    ],
  };
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
          disabled={disabled || normalizedInspectionAnswer(item, entry.value) === undefined}
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
  setNavigationBlocker,
}: UnitInspectionsProps) {
  const [inspections, setInspections] =
    useState<readonly InspectionResponseDto[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [bundle, setBundle] = useState<InspectionBundleResponse | null>(null);
  const [bundleError, setBundleError] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftByItem>({});
  const [touched, setTouched] = useState<TouchedByItem>({});
  const [savingTarget, setSavingTarget] = useState<{
    readonly inspectionId: string;
    readonly sectionId: string;
  } | null>(null);
  const [startingInspectionId, setStartingInspectionId] =
    useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const activeInspectionIdRef = useRef(inspectionId);
  activeInspectionIdRef.current = inspectionId;

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
    if (result.inspection.id !== id) {
      throw new Error(
        'Inspection endpoint returned a different aggregate identity.',
      );
    }
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

  const activeSectionIdRef = useRef<string | undefined>(selectedSection?.id);
  activeSectionIdRef.current = selectedSection?.id;

  const selectedSectionRevision =
    bundle && selectedSection
      ? sectionRevision(bundle, selectedSection.id)
      : null;

  const draftResetKey =
    bundle && selectedSection
      ? inspectionDraftResetKey(bundle, selectedSection.id)
      : null;

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
    if (!bundle || !selectedSection || draftResetKey === null) {
      setDraft({});
      setTouched({});
      return;
    }
    setDraft(createDraft(selectedSection, bundle.responses));
    setTouched({});
    setSaveError(null);
    setConflict(false);
  }, [draftResetKey]);

  const localValues = useMemo(
    () =>
      bundle && selectedSection
        ? valuesByFieldKey(bundle, selectedSection, draft)
        : new Map<string, InspectionAnswerValue>(),
    [bundle, draft, selectedSection],
  );

  const currentRevision = selectedSectionRevision ?? 0;

  const patch =
    bundle && selectedSection
      ? buildInspectionSectionPatch(
          selectedSection,
          bundle.responses,
          draft,
          touched,
          currentRevision,
        )
      : null;

  const editable = bundle?.inspection.status === 'in_progress';
  const currentInspectionId = bundle?.inspection.id;
  const currentSectionId = selectedSection?.id;
  const starting =
    currentInspectionId !== undefined &&
    startingInspectionId === currentInspectionId;
  const saving =
    currentInspectionId !== undefined &&
    currentSectionId !== undefined &&
    savingTarget?.inspectionId === currentInspectionId &&
    savingTarget.sectionId === currentSectionId;
  const hasUnsavedChanges = patch !== null;

  function isActiveInspection(targetInspectionId: string): boolean {
    return activeInspectionIdRef.current === targetInspectionId;
  }

  function isActiveEditorTarget(
    targetInspectionId: string,
    targetSectionId: string,
  ): boolean {
    return (
      activeInspectionIdRef.current === targetInspectionId &&
      activeSectionIdRef.current === targetSectionId
    );
  }

  useEffect(() => {
    if (!hasUnsavedChanges) {
      setNavigationBlocker(null);
      return;
    }

    setNavigationBlocker(() =>
      window.confirm(
        'This Inspection section has unsaved changes. Leave and discard them?',
      ),
    );

    return () => setNavigationBlocker(null);
  }, [hasUnsavedChanges, setNavigationBlocker]);

  function changeItem(itemId: string, entry: DraftEntry) {
    setDraft((current) => ({ ...current, [itemId]: entry }));
    setTouched((current) => ({ ...current, [itemId]: true }));
    setSaveError(null);
  }

  async function startInspection() {
    if (!bundle || starting) return;

    const targetInspectionId = bundle.inspection.id;
    const expectedVersion = bundle.inspection.version;
    setStartingInspectionId(targetInspectionId);
    setSaveError(null);

    try {
      const inspection = await api.post(
        inspectionStartPath(targetInspectionId),
        { expectedVersion },
        inspectionResponseSchema,
      );
      setBundle((current) =>
        current
          ? mergeInspectionStart(
              current,
              targetInspectionId,
              expectedVersion,
              inspection,
            )
          : current,
      );
      setInspections((current) =>
        current?.map((item) =>
          item.id === inspection.id ? inspection : item,
        ) ?? current,
      );
    } catch (cause) {
      if (!isActiveInspection(targetInspectionId)) return;
      setSaveError(
        cause instanceof Error ? cause.message : 'Inspection could not start.',
      );
    } finally {
      setStartingInspectionId((current) =>
        current === targetInspectionId ? null : current,
      );
    }
  }

  async function saveSection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!bundle || !selectedSection || !patch || saving) return;

    const targetInspectionId = bundle.inspection.id;
    const targetSectionId = selectedSection.id;
    const requestPatch = patch;

    setSavingTarget({
      inspectionId: targetInspectionId,
      sectionId: targetSectionId,
    });
    setSaveError(null);
    setConflict(false);

    try {
      const saved = await api.patch(
        inspectionSectionPath(targetInspectionId, targetSectionId),
        requestPatch,
        saveInspectionSectionResponseSchema,
      );

      setBundle((current) =>
        current
          ? mergeInspectionSectionSave(
              current,
              targetInspectionId,
              targetSectionId,
              requestPatch.expectedRevision,
              saved,
            )
          : current,
      );
    } catch (cause) {
      if (!isActiveEditorTarget(targetInspectionId, targetSectionId)) return;

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
      setSavingTarget((current) =>
        current?.inspectionId === targetInspectionId &&
        current.sectionId === targetSectionId
          ? null
          : current,
      );
    }
  }

  async function reloadAfterConflict() {
    if (!inspectionId || !selectedSection) return;

    const targetInspectionId = inspectionId;
    const targetSectionId = selectedSection.id;
    setSavingTarget({
      inspectionId: targetInspectionId,
      sectionId: targetSectionId,
    });
    setSaveError(null);

    try {
      const fresh = await loadBundle(targetInspectionId);
      if (!isActiveEditorTarget(targetInspectionId, targetSectionId)) return;
      setBundle(fresh);
      setConflict(false);
    } catch (cause) {
      if (!isActiveEditorTarget(targetInspectionId, targetSectionId)) return;
      setSaveError(
        cause instanceof Error
          ? cause.message
          : 'Inspection could not be reloaded.',
      );
    } finally {
      setSavingTarget((current) =>
        current?.inspectionId === targetInspectionId &&
        current.sectionId === targetSectionId
          ? null
          : current,
      );
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
