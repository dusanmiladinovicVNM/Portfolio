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
  inspectionSectionInstancePath,
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
import {
  formatDetailKey,
  formatSwissDate,
} from '../presentation/format.js';
import { InspectionFinalizationPanel } from './InspectionFinalizationPanel.js';
import { InspectionFindingsEvidence } from './InspectionFindingsEvidence.js';
import { InspectionOrchestrationPanel } from './InspectionOrchestrationPanel.js';
import { assertInspectionBundleOwner } from './inspection-content-owner.js';
import {
  buildInspectionRequiredProgress,
  inspectionAnswerPresent,
  inspectionValuesByFieldKey,
} from './inspection-progress.js';
import type { InspectionWriteGate } from './inspection-write-gate.js';
import { assertUnitInspectionListOwner } from './inspection-orchestration-owner.js';

type SchemaSection = InspectionBundleResponse['schema']['sections'][number];
type SectionInstance = InspectionBundleResponse['sectionInstances'][number];
type SchemaItem = SchemaSection['items'][number];

interface DraftEntry {
  readonly value: InspectionAnswerValue | undefined;
  readonly comment: string;
}

type DraftByItem = Readonly<Record<string, DraftEntry>>;
type TouchedByItem = Readonly<Record<string, boolean>>;

export const INSPECTION_AUTOSAVE_DELAY_MS = 1500;

interface UnitInspectionsProps {
  readonly api: PortfolioApi;
  readonly propertyId: string;
  readonly unitId: string;
  readonly asOf: string;
  readonly inspectionId?: string | undefined;
  readonly inspectionSectionInstanceId?: string | undefined;
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
  sectionInstanceId: string,
): ReadonlyMap<string, InspectionItemResponse> {
  return new Map(
    responses
      .filter(
        (response) => response.sectionInstanceId === sectionInstanceId,
      )
      .map((response) => [response.itemId, response]),
  );
}

function createDraft(
  section: SchemaSection,
  sectionInstanceId: string,
  responses: readonly InspectionItemResponse[],
): DraftByItem {
  const canonical = responseByItem(responses, sectionInstanceId);
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
  sectionInstance: SectionInstance,
  draft: DraftByItem,
): ReadonlyMap<string, InspectionAnswerValue> {
  const values = new Map(
    inspectionValuesByFieldKey(bundle, sectionInstance),
  );

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

function sectionInstanceTitle(
  section: SchemaSection,
  instance: SectionInstance,
): string {
  return instance.scope === 'space'
    ? instance.spaceName ?? 'Space'
    : section.title;
}

export function buildInspectionSectionPatch(
  section: SchemaSection,
  sectionInstanceId: string,
  responses: readonly InspectionItemResponse[],
  draft: DraftByItem,
  touched: TouchedByItem,
  expectedRevision: number,
): SaveInspectionSectionRequest | null {
  const canonical = responseByItem(responses, sectionInstanceId);
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
  sectionInstanceId: string,
): number {
  return (
    bundle.sectionStates.find(
      (state) => state.sectionInstanceId === sectionInstanceId,
    )?.revision ?? 0
  );
}

export function inspectionDraftResetKey(
  bundle: InspectionBundleResponse,
  sectionInstanceId: string,
): string {
  return `${bundle.inspection.id}:${sectionInstanceId}:${sectionRevision(bundle, sectionInstanceId)}`;
}

export function inspectionSectionOperationKey(
  inspectionId: string,
  sectionInstanceId: string,
): string {
  return `${inspectionId}:${sectionInstanceId}`;
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
  targetSectionInstanceId: string,
  expectedRevision: number,
  saved: SaveInspectionSectionResponse,
): InspectionBundleResponse {
  if (
    current.inspection.id !== targetInspectionId ||
    sectionRevision(current, targetSectionInstanceId) !== expectedRevision
  ) {
    return current;
  }

  for (const response of saved.responses) {
    if (
      response.inspectionId !== targetInspectionId ||
      response.sectionInstanceId !== targetSectionInstanceId
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
      state.sectionInstanceId === targetSectionInstanceId
        ? { ...state, revision: saved.revision }
        : state,
    ),
    responses: [
      ...current.responses.filter(
        (response) =>
          response.sectionInstanceId !== targetSectionInstanceId ||
          !changedIds.has(response.itemId),
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
  inspectionSectionInstanceId,
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
  const [draftChangeRevision, setDraftChangeRevision] = useState(0);
  const [
    autosaveBlockedChangeRevision,
    setAutosaveBlockedChangeRevision,
  ] = useState<number | null>(null);
  const [inspectionWritePending, setInspectionWritePending] = useState(false);
  const inspectionWritePendingRef = useRef(false);
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
    assertInspectionBundleOwner(id, unitId, result);
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

  const orderedSectionInstances = useMemo(() => {
    if (!routeBundle) return [];
    const sectionById = new Map(
      routeBundle.schema.sections.map((section) => [section.id, section] as const),
    );
    return [...routeBundle.sectionInstances].sort((left, right) => {
      const leftSection = sectionById.get(left.sectionId);
      const rightSection = sectionById.get(right.sectionId);
      return (
        (leftSection?.sortOrder ?? 0) - (rightSection?.sortOrder ?? 0) ||
        (left.spaceSortOrder ?? -1) - (right.spaceSortOrder ?? -1) ||
        (left.spaceName ?? '').localeCompare(right.spaceName ?? '') ||
        left.id.localeCompare(right.id)
      );
    });
  }, [routeBundle]);

  const requiredProgress = useMemo(
    () =>
      routeBundle
        ? buildInspectionRequiredProgress(routeBundle)
        : null,
    [routeBundle],
  );
  const requiredProgressBySectionInstance = useMemo(
    () =>
      new Map(
        (requiredProgress?.sections ?? []).map((section) => [
          section.sectionInstanceId,
          section,
        ] as const),
      ),
    [requiredProgress],
  );

  const selectedSectionInstance = useMemo(() => {
    if (!routeBundle) return null;
    return (
      orderedSectionInstances.find(
        (instance) => instance.id === inspectionSectionInstanceId,
      ) ??
      orderedSectionInstances[0] ??
      null
    );
  }, [inspectionSectionInstanceId, orderedSectionInstances, routeBundle]);

  const selectedSection = useMemo(() => {
    if (!routeBundle || !selectedSectionInstance) return null;
    return (
      routeBundle.schema.sections.find(
        (section) => section.id === selectedSectionInstance.sectionId,
      ) ?? null
    );
  }, [routeBundle, selectedSectionInstance]);

  const activeSectionIdRef = useRef<string | undefined>(
    selectedSectionInstance?.id,
  );
  activeSectionIdRef.current = selectedSectionInstance?.id;

  const selectedSectionRevision =
    routeBundle && selectedSectionInstance
      ? sectionRevision(routeBundle, selectedSectionInstance.id)
      : null;

  const draftResetKey =
    routeBundle && selectedSectionInstance
      ? inspectionDraftResetKey(routeBundle, selectedSectionInstance.id)
      : null;

  useEffect(() => {
    if (
      !routeBundle ||
      !inspectionId ||
      !selectedSectionInstance ||
      !selectedSection
    ) {
      return;
    }
    if (inspectionSectionInstanceId === selectedSectionInstance.id) return;

    navigate(
      unitRoute(propertyId, unitId, asOf, 'inspections', {
        inspectionId,
        inspectionSectionInstanceId: selectedSectionInstance.id,
      }),
      { replace: true },
    );
  }, [
    asOf,
    routeBundle,
    inspectionId,
    inspectionSectionInstanceId,
    navigate,
    propertyId,
    selectedSection,
    selectedSectionInstance,
    unitId,
  ]);

  useEffect(() => {
    if (
      !routeBundle ||
      !selectedSection ||
      !selectedSectionInstance ||
      draftResetKey === null
    ) {
      setDraft({});
      setTouched({});
      return;
    }
    setDraft(
      createDraft(
        selectedSection,
        selectedSectionInstance.id,
        routeBundle.responses,
      ),
    );
    setTouched({});
    setSaveError(null);
    setConflict(false);
    setAutosaveBlockedChangeRevision(null);
  }, [draftResetKey]);

  const localValues = useMemo(
    () =>
      routeBundle && selectedSection && selectedSectionInstance
        ? valuesByFieldKey(
            routeBundle,
            selectedSection,
            selectedSectionInstance,
            draft,
          )
        : new Map<string, InspectionAnswerValue>(),
    [draft, routeBundle, selectedSection, selectedSectionInstance],
  );

  const currentRevision = selectedSectionRevision ?? 0;

  const patch = useMemo(
    () =>
      routeBundle && selectedSection && selectedSectionInstance
        ? buildInspectionSectionPatch(
            selectedSection,
            selectedSectionInstance.id,
            routeBundle.responses,
            draft,
            touched,
            currentRevision,
          )
        : null,
    [
      currentRevision,
      draft,
      routeBundle,
      selectedSection,
      selectedSectionInstance,
      touched,
    ],
  );

  const currentInspectionId = routeBundle?.inspection.id;
  const currentSectionId = selectedSectionInstance?.id;
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
  const sectionWritePending = inFlightSectionSaves.size > 0;

  const inspectionWriteGate: InspectionWriteGate = {
    pending: inspectionWritePending,
    tryStart: () => {
      if (
        inspectionWritePendingRef.current ||
        inFlightStartsRef.current.size > 0 ||
        inFlightSectionSavesRef.current.size > 0
      ) {
        return false;
      }
      inspectionWritePendingRef.current = true;
      setNavigationBlocker(() => false);
      setInspectionWritePending(true);
      return true;
    },
    finish: () => {
      inspectionWritePendingRef.current = false;
      setNavigationBlocker(null);
      setInspectionWritePending(false);
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
    if (inspectionWritePending || sectionWritePending) {
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
    inspectionWritePending,
    sectionWritePending,
    setNavigationBlocker,
  ]);

  function changeItem(itemId: string, entry: DraftEntry) {
    setDraft((current) => ({ ...current, [itemId]: entry }));
    setTouched((current) => ({ ...current, [itemId]: true }));
    setDraftChangeRevision((current) => current + 1);
    if (!conflict) setSaveError(null);
  }

  async function startInspection() {
    if (!routeBundle) return;

    const targetInspectionId = routeBundle.inspection.id;
    if (
      inspectionWritePendingRef.current ||
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

  async function persistSection(
    requestPatch: SaveInspectionSectionRequest,
    requestChangeRevision: number,
  ) {
    if (!routeBundle || !selectedSectionInstance) return;

    const targetInspectionId = routeBundle.inspection.id;
    const targetSectionId = selectedSectionInstance.id;
    const targetKey = inspectionSectionOperationKey(
      targetInspectionId,
      targetSectionId,
    );
    if (
      inspectionWritePendingRef.current ||
      inFlightSectionSavesRef.current.has(targetKey)
    ) {
      return;
    }

    inFlightSectionSavesRef.current.add(targetKey);
    setInFlightSectionSaves((current) =>
      withInspectionOperationStarted(current, targetKey),
    );
    setSaveError(null);
    setConflict(false);
    setAutosaveBlockedChangeRevision(null);

    try {
      const saved = await api.patch(
        inspectionSectionInstancePath(targetInspectionId, targetSectionId),
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

      setAutosaveBlockedChangeRevision(requestChangeRevision);
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

  async function saveSection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!patch || conflict) return;
    await persistSection(patch, draftChangeRevision);
  }

  useEffect(() => {
    if (
      !patch ||
      !editable ||
      saving ||
      inspectionWritePending ||
      conflict ||
      autosaveBlockedChangeRevision === draftChangeRevision
    ) {
      return;
    }

    const requestPatch = patch;
    const requestChangeRevision = draftChangeRevision;
    const timeout = window.setTimeout(() => {
      void persistSection(requestPatch, requestChangeRevision);
    }, INSPECTION_AUTOSAVE_DELAY_MS);

    return () => window.clearTimeout(timeout);
  }, [
    autosaveBlockedChangeRevision,
    conflict,
    draftChangeRevision,
    editable,
    inspectionWritePending,
    patch,
    saving,
  ]);

  async function reloadAfterConflict() {
    if (!inspectionId || !selectedSection || !selectedSectionInstance) return;

    const targetInspectionId = inspectionId;
    const targetSectionId = selectedSectionInstance.id;
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

      const freshInstance = fresh.sectionInstances.find(
        (instance) => instance.id === targetSectionId,
      );
      const freshSection = freshInstance
        ? fresh.schema.sections.find(
            (section) => section.id === freshInstance.sectionId,
          )
        : null;
      if (!freshInstance || !freshSection) {
        throw new Error(
          'Canonical Inspection no longer contains the active section instance.',
        );
      }

      // This action explicitly means "discard local edits". Do not rely on
      // draftResetKey changing: a rejected CAS write can legitimately reread
      // the same server section revision while the local draft is still dirty.
      setBundle(fresh);
      setDraft(createDraft(freshSection, freshInstance.id, fresh.responses));
      setTouched({});
      setConflict(false);
      setAutosaveBlockedChangeRevision(null);
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
          createBlockedByDirtySection={hasUnsavedChanges}
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
          writeGate={inspectionWriteGate}
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
            Debounced autosave · explicit retry · offline comes later
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
                  <small>{inspection.scheduledFor ? formatSwissDate(inspection.scheduledFor) : 'Unscheduled'}</small>
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
                disabled={starting || inspectionWritePending}
                onClick={startInspection}
                type="button"
              >
                {starting ? 'Starting…' : 'Start Inspection'}
              </button>
            </div>
          ) : null}

          {requiredProgress ? (
            <div
              className={`inspection-progress-card ${
                requiredProgress.complete
                  ? 'inspection-progress-card-complete'
                  : 'inspection-progress-card-incomplete'
              }`}
              data-inspection-required-progress
            >
              <div className="inspection-progress-heading">
                <div>
                  <strong>Required response progress</strong>
                  <small>Canonical saved responses only</small>
                </div>
                <span className="inspection-progress-count">
                  {requiredProgress.requiredAnswered} / {requiredProgress.requiredTotal} saved
                </span>
              </div>
              <progress
                aria-label="Saved required Inspection responses"
                max={requiredProgress.requiredTotal === 0 ? 1 : requiredProgress.requiredTotal}
                value={
                  requiredProgress.requiredTotal === 0
                    ? 1
                    : requiredProgress.requiredAnswered
                }
              />
              <small>
                {requiredProgress.complete
                  ? requiredProgress.requiredTotal === 0
                    ? 'This Inspection schema has no required responses.'
                    : 'All saved required responses are complete.'
                  : `${requiredProgress.missingRequired} required ${
                      requiredProgress.missingRequired === 1
                        ? 'response is'
                        : 'responses are'
                    } still missing from canonical saved state.`}
              </small>
            </div>
          ) : null}

          <div className="inspection-layout">
            <nav
              aria-label="Inspection sections"
              className="inspection-sections"
            >
              {orderedSectionInstances.map((instance) => {
                const section = routeBundle.schema.sections.find(
                  (candidate) => candidate.id === instance.sectionId,
                );
                if (!section) return null;
                const title = sectionInstanceTitle(section, instance);
                const progress =
                  requiredProgressBySectionInstance.get(instance.id);
                const progressState =
                  progress?.requiredTotal === 0
                    ? 'optional'
                    : progress?.complete
                      ? 'complete'
                      : 'missing';
                return (
                  <WorkspaceLink
                    ariaCurrent={
                      selectedSectionInstance?.id === instance.id
                        ? 'page'
                        : undefined
                    }
                    className={`inspection-section-link ${
                      selectedSectionInstance?.id === instance.id
                        ? 'inspection-section-link-active'
                        : ''
                    }`}
                    key={instance.id}
                    navigate={navigate}
                    route={unitRoute(
                      propertyId,
                      unitId,
                      asOf,
                      'inspections',
                      {
                        inspectionId: routeBundle.inspection.id,
                        inspectionSectionInstanceId: instance.id,
                      },
                    )}
                  >
                    <strong>{title}</strong>
                    <span
                      className={`inspection-section-progress inspection-section-progress-${progressState}`}
                    >
                      {progress?.requiredTotal === 0
                        ? 'No required responses'
                        : progress?.complete
                          ? `${progress.requiredAnswered}/${progress.requiredTotal} required · complete`
                          : `${progress?.requiredAnswered ?? 0}/${progress?.requiredTotal ?? 0} required · ${progress?.missingRequired ?? 0} missing`}
                    </span>
                    <small>
                      {instance.scope === 'space'
                        ? `${formatDetailKey(instance.spaceType ?? 'space')} · `
                        : ''}
                      revision {sectionRevision(routeBundle, instance.id)}
                    </small>
                  </WorkspaceLink>
                );
              })}
            </nav>

            {selectedSection ? (
              <form className="inspection-section-form" onSubmit={saveSection}>
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">
                      Section revision {currentRevision}
                    </p>
                    <h3>
                      {selectedSectionInstance
                        ? sectionInstanceTitle(
                            selectedSection,
                            selectedSectionInstance,
                          )
                        : selectedSection.title}
                    </h3>
                    {selectedSectionInstance?.scope === 'space' ? (
                      <p className="muted">
                        {selectedSection.title}
                        {selectedSectionInstance.spaceCode
                          ? ` · ${selectedSectionInstance.spaceCode}`
                          : ''}
                      </p>
                    ) : null}
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
                  const requiredMissing =
                    required &&
                    !inspectionAnswerPresent(
                      normalizedInspectionAnswer(item, entry.value),
                    );

                  return (
                    <div
                      className={`inspection-item ${
                        requiredMissing ? 'inspection-item-missing' : ''
                      }`}
                      key={item.id}
                    >
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
                        disabled={!editable || saving || inspectionWritePending || conflict}
                        entry={entry}
                        item={item}
                        onChange={(next) => changeItem(item.id, next)}
                      />
                      {requiredMissing ? (
                        <small className="inspection-required-message">
                          Required response missing
                        </small>
                      ) : null}
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
                  <span
                    className="muted"
                    data-inspection-autosave-status
                  >
                    {conflict
                      ? 'Autosave paused · resolve the server conflict'
                      : saveError &&
                          autosaveBlockedChangeRevision === draftChangeRevision
                        ? 'Autosave paused after save failure · use Save now to retry'
                        : saving
                          ? 'Saving section…'
                          : patch
                            ? 'Unsaved changes · autosave pending'
                            : 'All section changes saved'}
                  </span>
                  <button
                    disabled={
                      !editable ||
                      !patch ||
                      saving ||
                      inspectionWritePending ||
                      conflict
                    }
                    type="submit"
                  >
                    {saving ? 'Saving…' : 'Save now'}
                  </button>
                </div>
              </form>
            ) : (
              <p className="muted">This Inspection schema has no sections.</p>
            )}
          </div>

          {selectedSection && selectedSectionInstance ? (
            <InspectionFindingsEvidence
              api={api}
              blockedByDirtySection={hasUnsavedChanges}
              bundle={routeBundle}
              key={`${routeBundle.inspection.id}:${selectedSectionInstance.id}`}
              onCanonicalBundle={(targetInspectionId, canonical) => {
                if (activeInspectionIdRef.current !== targetInspectionId) return;
                assertInspectionBundleOwner(targetInspectionId, unitId, canonical);
                setBundle(canonical);
                setInspections((current) =>
                  current?.map((item) =>
                    item.id === canonical.inspection.id
                      ? canonical.inspection
                      : item,
                  ) ?? current,
                );
              }}
              selectedSectionInstanceId={selectedSectionInstance.id}
              writeGate={inspectionWriteGate}
            />
          ) : null}

          <InspectionFinalizationPanel
            api={api}
            blockedByDirtySection={hasUnsavedChanges}
            bundle={routeBundle}
            key={`${routeBundle.inspection.id}:finalization`}
            missingRequiredResponses={requiredProgress?.missingRequired ?? 0}
            requiredResponsesComplete={requiredProgress?.complete ?? false}
            onCanonicalBundle={(targetInspectionId, canonical) => {
              if (activeInspectionIdRef.current !== targetInspectionId) return;
              assertInspectionBundleOwner(targetInspectionId, unitId, canonical);
              setBundle(canonical);
              setInspections((current) =>
                current?.map((item) =>
                  item.id === canonical.inspection.id
                    ? canonical.inspection
                    : item,
                ) ?? current,
              );
            }}
            writeGate={inspectionWriteGate}
          />
        </section>
      ) : null}
    </div>
  );
}
