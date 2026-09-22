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
import {
  InspectionOrchestrationPanel,
  type InspectionOrchestrationWriteGate,
} from './InspectionOrchestrationPanel.js';
import { assertUnitInspectionListOwner } from './inspection-orchestration-owner.js';

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

export function inspectionSectionOperationKey(
  inspectionId: string,
  sectionId: string,
): string {
  return `${inspectionId}:${sectionId}`;
}

export function withInspectionOperationStarted(
  current: ReadonlySet<string>,
  key: string,
): ReadonlySet<string> {
  if (current.has(key)) return current;
  const next = new Set(current);
  next.add(key);
  return next;
}

export function withInspectionOperationFinished(
  current: ReadonlySet<string>,
  key: string,
): ReadonlySet<string> {
  if (!current.has(key)) return current;
  const next = new Set(current);
  next.delete(key);
  return next;
}

export function canEditInspectionSection(
  status: InspectionResponseDto['status'],
  inFlightSectionSaves: ReadonlySet<string>,
  inspectionId: string,
  sectionId: string,
): boolean {
  return (
    status === 'in_progress' &&
    !inFlightSectionSaves.has(
      inspectionSectionOperationKey(inspectionId, sectionId),
    )
  );
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
  const [inspectionsOwnerUnitId, setInspectionsOwnerUnitId] =
    useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [listRevision, setListRevision] = useState(0);
  const [bundleRevision, setBundleRevision] = useState(0);
  const [bundle, setBundle] = useState<InspectionBundleResponse | null>(null);
  const [bundleError, setBundleError] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftByItem>({});
  const [touched, setTouched] = useState<TouchedByItem>({});
  const [inFlightSectionSaves, setInFlightSectionSaves] =
    useState<ReadonlySet<string>>(() => new Set());
  const inFlightSectionSavesRef = useRef<Set<string>>(new Set());
  const [inFlightStarts, setInFlightStarts] =
    useState<ReadonlySet<string>>(() => new Set());
  const inFlightStartsRef = useRef<Set<string>>(new Set());
  const [saveError, setSaveError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [orchestrationPending, setOrchestrationPending] = useState(false);
  const orchestrationPendingRef = useRef(false);
  const activeInspectionIdRef = useRef(inspectionId);
  activeInspectionIdRef.current = inspectionId;

  useEffect(() => {
    const controller = new AbortController();
    setInspections(null);
    setInspectionsOwnerUnitId(null);
    setListError(null);

    void api
      .get(unitInspectionsPath(unitId), inspectionListResponseSchema, {
        signal: controller.signal,
      })
      .then((response) => {
        if (controller.signal.aborted) return;
        assertUnitInspectionListOwner(unitId, response.items);
        setInspectionsOwnerUnitId(unitId);
        setInspections(response.items);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setListError(
          cause instanceof Error
            ? cause.message
            : 'Inspections could not be loaded.',
        );
      });

    return () => controller.abort();
  }, [api, listRevision, unitId]);

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
  }, [api, bundleRevision, inspectionId, unitId]);

  const routeInspections =
    inspectionsOwnerUnitId === unitId ? inspections : null;

  const routeBundle =
    bundle !== null &&
    bundle.inspection.unitId === unitId &&
    bundle.inspection.id === inspectionId
      ? bundle
      : null;

  const selectedListInspection = useMemo(
    () =>
      routeInspections?.find(
        (inspection) => inspection.id === inspectionId,
      ) ?? null,
    [inspectionId, routeInspections],
  );

  const selectedSection = useMemo(() => {
    if (!routeBundle) return null;
    return (
      routeBundle.schema.sections.find(
        (section) => section.id === inspectionSectionId,
      ) ??
      routeBundle.schema.sections[0] ??
      null
    );
  }, [inspectionSectionId, routeBundle]);

  const activeSectionIdRef = useRef<string | undefined>(selectedSection?.id);
  activeSectionIdRef.current = selectedSection?.id;

  const selectedSectionRevision =
    routeBundle && selectedSection
      ? sectionRevision(routeBundle, selectedSection.id)
      : null;

  const draftResetKey =
    routeBundle && selectedSection
      ? inspectionDraftResetKey(routeBundle, selectedSection.id)
      : null;

  useEffect(() => {
    if (!routeBundle || !inspectionId || !selectedSection) return;
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
    routeBundle,
    inspectionId,
    inspectionSectionId,
    navigate,
    propertyId,
    selectedSection,
    unitId,
  ]);

  useEffect(() => {
    if (!routeBundle || !selectedSection || draftResetKey === null) {
      setDraft({});
      setTouched({});
      return;
    }
    setDraft(createDraft(selectedSection, routeBundle.responses));
    setTouched({});
    setSaveError(null);
    setConflict(false);
  }, [draftResetKey]);

  const localValues = useMemo(
    () =>
      routeBundle && selectedSection
        ? valuesByFieldKey(routeBundle, selectedSection, draft)
        : new Map<string, InspectionAnswerValue>(),
    [draft, routeBundle, selectedSection],
  );

  const currentRevision = selectedSectionRevision ?? 0;

  const patch =
    routeBundle && selectedSection
      ? buildInspectionSectionPatch(
          selectedSection,
          routeBundle.responses,
          draft,
          touched,
          currentRevision,
        )
      : null;

  const currentInspectionId = routeBundle?.inspection.id;
  const currentSectionId = selectedSection?.id;
  const currentSectionOperationKey =
    currentInspectionId !== undefined && currentSectionId !== undefined
      ? inspectionSectionOperationKey(
          currentInspectionId,
          currentSectionId,
        )
      : null;
  const starting =
    currentInspectionId !== undefined &&
    inFlightStarts.has(currentInspectionId);
  const saving =
    currentSectionOperationKey !== null &&
    inFlightSectionSaves.has(currentSectionOperationKey);
  const editable =
    routeBundle !== null &&
    currentInspectionId !== undefined &&
    currentSectionId !== undefined &&
    canEditInspectionSection(
      routeBundle.inspection.status,
      inFlightSectionSaves,
      currentInspectionId,
      currentSectionId,
    );
  const hasUnsavedChanges = patch !== null;

  const orchestrationWriteGate: InspectionOrchestrationWriteGate = {
    pending: orchestrationPending,
    tryStart: () => {
      if (
        orchestrationPendingRef.current ||
        inFlightStartsRef.current.size > 0 ||
        inFlightSectionSavesRef.current.size > 0
      ) {
        return false;
      }
      orchestrationPendingRef.current = true;
      setOrchestrationPending(true);
      return true;
    },
    finish: () => {
      orchestrationPendingRef.current = false;
      setOrchestrationPending(false);
    },
  };

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
    if (orchestrationPending) {
      setNavigationBlocker(() => false);
      return () => setNavigationBlocker(null);
    }

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
  }, [
    hasUnsavedChanges,
    orchestrationPending,
    setNavigationBlocker,
  ]);

  function changeItem(itemId: string, entry: DraftEntry) {
    setDraft((current) => ({ ...current, [itemId]: entry }));
    setTouched((current) => ({ ...current, [itemId]: true }));
    setSaveError(null);
  }

  async function startInspection() {
    if (!routeBundle) return;

    const targetInspectionId = routeBundle.inspection.id;
    if (
      orchestrationPendingRef.current ||
      inFlightStartsRef.current.has(targetInspectionId)
    ) {
      return;
    }

    const expectedVersion = routeBundle.inspection.version;
    inFlightStartsRef.current.add(targetInspectionId);
    setInFlightStarts((current) =>
      withInspectionOperationStarted(current, targetInspectionId),
    );
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
      inFlightStartsRef.current.delete(targetInspectionId);
      setInFlightStarts((current) =>
        withInspectionOperationFinished(current, targetInspectionId),
      );
    }
  }

  async function saveSection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!routeBundle || !selectedSection || !patch) return;

    const targetInspectionId = bundle.inspection.id;
    const targetSectionId = selectedSection.id;
    const targetKey = inspectionSectionOperationKey(
      targetInspectionId,
      targetSectionId,
    );
    if (
      orchestrationPendingRef.current ||
      inFlightSectionSavesRef.current.has(targetKey)
    ) {
      return;
    }

    const requestPatch = patch;
    inFlightSectionSavesRef.current.add(targetKey);
    setInFlightSectionSaves((current) =>
      withInspectionOperationStarted(current, targetKey),
    );
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
      inFlightSectionSavesRef.current.delete(targetKey);
      setInFlightSectionSaves((current) =>
        withInspectionOperationFinished(current, targetKey),
      );
    }
  }

  async function reloadAfterConflict() {
    if (!inspectionId || !selectedSection) return;

    const targetInspectionId = inspectionId;
    const targetSectionId = selectedSection.id;
    const targetKey = inspectionSectionOperationKey(
      targetInspectionId,
      targetSectionId,
    );
    if (inFlightSectionSavesRef.current.has(targetKey)) return;

    inFlightSectionSavesRef.current.add(targetKey);
    setInFlightSectionSaves((current) =>
      withInspectionOperationStarted(current, targetKey),
    );
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
      inFlightSectionSavesRef.current.delete(targetKey);
      setInFlightSectionSaves((current) =>
        withInspectionOperationFinished(current, targetKey),
      );
    }
  }

  return (
    <div className="inspection-workspace">
      {routeInspections ? (
        <InspectionOrchestrationPanel
          api={api}
          asOf={asOf}
          inspections={routeInspections}
          navigate={navigate}
          onCanonicalReload={() => {
            setListRevision((revision) => revision + 1);
            setBundleRevision((revision) => revision + 1);
          }}
          onCreated={(created) => {
            setInspections((current) =>
              current
                ? [
                    ...current.filter((item) => item.id !== created.id),
                    created,
                  ]
                : [created],
            );
            navigate(
              unitRoute(propertyId, unitId, asOf, 'inspections', {
                inspectionId: created.id,
              }),
            );
          }}
          onUpdated={(updated) => {
            setInspections((current) =>
              current?.map((item) =>
                item.id === updated.id ? updated : item,
              ) ?? current,
            );
            setBundle((current) =>
              current?.inspection.id === updated.id
                ? { ...current, inspection: updated }
                : current,
            );
          }}
          propertyId={propertyId}
          selectedInspection={
            routeBundle?.inspection ?? selectedListInspection
          }
          unitId={unitId}
          writeGate={orchestrationWriteGate}
          key={unitId}
        />
      ) : null}

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
        {!listError && routeInspections === null ? (
          <p className="muted" aria-live="polite">Loading Inspections…</p>
        ) : null}
        {routeInspections?.length === 0 ? (
          <p className="muted">No Inspections are assigned to this Unit.</p>
        ) : null}

        {routeInspections && routeInspections.length > 0 ? (
          <div className="inspection-list">
            {routeInspections.map((inspection) => (
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

      {inspectionId && !bundleError && routeBundle === null ? (
        <section className="panel state-panel" aria-live="polite">
          <h2>Loading Inspection…</h2>
        </section>
      ) : null}

      {routeBundle ? (
        <section className="panel inspection-editor">
          <div className="inspection-editor-header">
            <div>
              <p className="eyebrow">
                {formatDetailKey(routeBundle.inspection.inspectionType)}
              </p>
              <h2>{routeBundle.inspection.code}</h2>
              <p className="muted">
                {routeBundle.schema.title} · lifecycle v{routeBundle.inspection.version} ·
                content r{routeBundle.inspection.contentRevision}
              </p>
            </div>
            <span className="status-chip">{routeBundle.inspection.status}</span>
          </div>

          {routeBundle.inspection.status === 'draft' ? (
            <div className="inspection-start-callout">
              <div>
                <strong>Ready to begin field work</strong>
                <span>Start the Inspection before editing responses.</span>
              </div>
              <button
                className="button-secondary"
                disabled={starting || orchestrationPending}
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
              {routeBundle.schema.sections.map((section) => (
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
                      inspectionId: routeBundle.inspection.id,
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
                        disabled={!editable || saving || orchestrationPending}
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
                    disabled={
                      !editable ||
                      !patch ||
                      saving ||
                      orchestrationPending
                    }
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
