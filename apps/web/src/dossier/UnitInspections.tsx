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
import { propertyRoute, unitRoute } from '../navigation/workspace-route.js';
import type {
  NavigateWorkspace,
  SetNavigationBlocker,
} from '../navigation/use-workspace-navigation.js';
import {
  formatDetailKey,
  formatSwissDate,
} from '../presentation/format.js';
import { InspectionCompletedOverview } from './InspectionCompletedOverview.js';
import { InspectionEvidenceOverview } from './InspectionEvidenceOverview.js';
import { InspectionFinalizationPanel } from './InspectionFinalizationPanel.js';
import {
  InspectionFindingsEvidence,
  type StableUpload,
  type StoredOnlyEvidenceVersion,
} from './InspectionFindingsEvidence.js';
import { InspectionOrchestrationPanel } from './InspectionOrchestrationPanel.js';
import { InspectionWorkflowStepper } from './InspectionWorkflowStepper.js';
import {
  inspectionWorkflowCurrentStep,
  inspectionWorkflowStageAvailable,
  type InspectionWorkflowStepId,
} from './inspection-workflow.js';
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

interface InspectionContinueIntent {
  readonly inspectionId: string;
  readonly sourceSectionId: string;
  readonly destinationSectionId: string;
  readonly sourceRevision: number;
  readonly draftRevision: number;
  readonly requiresAcknowledgedSave: boolean;
}

export interface InspectionContinueProgress {
  readonly sourceInspectionId: string | undefined;
  readonly sourceSectionId: string | undefined;
  readonly sectionRevision: number;
  readonly draftRevision: number;
  readonly hasUnsavedChanges: boolean;
  readonly sectionWritePending: boolean;
  readonly inspectionWritePending: boolean;
  readonly conflict: boolean;
  readonly saveError: string | null;
}

/**
 * A navigation decision is never a substitute for the canonical section
 * PATCH acknowledgement. The server revision must advance after a dirty
 * Save & continue request; current local draft must then match canonical data.
 */
export function inspectionContinueDecision(
  intent: InspectionContinueIntent,
  state: InspectionContinueProgress,
): 'wait' | 'abort' | 'advance' {
  if (
    state.sourceInspectionId !== intent.inspectionId ||
    state.sourceSectionId !== intent.sourceSectionId ||
    state.draftRevision !== intent.draftRevision ||
    state.conflict ||
    state.saveError !== null
  ) {
    return 'abort';
  }
  if (state.sectionWritePending || state.inspectionWritePending) return 'wait';
  if (intent.requiresAcknowledgedSave) {
    if (state.sectionRevision <= intent.sourceRevision) return 'wait';
    // A PATCH was acknowledged but its response could not reconcile the
    // local draft. Keep the section visible, never leave pending forever.
    if (state.hasUnsavedChanges) return 'abort';
  }
  return state.hasUnsavedChanges ? 'wait' : 'advance';
}

export const INSPECTION_AUTOSAVE_DELAY_MS = 1500;

export interface InspectionSaveStatusState {
  readonly conflict: boolean;
  readonly saveError: string | null;
  readonly autosaveBlockedChangeRevision: number | null;
  readonly draftChangeRevision: number;
  readonly saving: boolean;
  readonly hasUnsavedChanges: boolean;
}

/** Presentation only: no save or server authority is derived from this label. */
export function inspectionAutosaveMessage(state: InspectionSaveStatusState): string {
  if (state.conflict) {
    return 'Autosave paused · resolve the server conflict';
  }
  if (
    state.saveError &&
    state.autosaveBlockedChangeRevision === state.draftChangeRevision
  ) {
    return 'Autosave paused after save failure · use Save now to retry';
  }
  if (state.saving) return 'Saving section…';
  if (state.hasUnsavedChanges) return 'Unsaved changes · autosave pending';
  return 'All section changes saved';
}

export function InspectionSaveStatus({
  message,
}: {
  readonly message: string;
}) {
  return (
    <span
      aria-atomic="true"
      aria-live="polite"
      className="inspection-field-save-status"
      data-inspection-field-save-status
      role="status"
    >
      {message}
    </span>
  );
}

interface UnitInspectionsProps {
  readonly api: PortfolioApi;
  readonly propertyId: string;
  readonly unitId: string;
  readonly unitLabel: string;
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


/**
 * A schema item has one visible question label bound to its answer control.
 * The field ID includes the frozen SectionInstance identity so repeated
 * room items never share a DOM label target.
 */
export function InspectionQuestionField({
  item,
  entry,
  disabled,
  required,
  requiredMissing,
  fieldId,
  onChange,
}: {
  readonly item: SchemaItem;
  readonly entry: DraftEntry;
  readonly disabled: boolean;
  readonly required: boolean;
  readonly requiredMissing: boolean;
  readonly fieldId: string;
  readonly onChange: (entry: DraftEntry) => void;
}) {
  const updateValue = (value: InspectionAnswerValue | undefined) =>
    onChange({ ...entry, value });
  const requiredMessageId = fieldId + '-required';
  const answerAccessibility = {
    id: fieldId,
    'aria-required': required || undefined,
    'aria-invalid': requiredMissing || undefined,
    'aria-describedby': requiredMissing ? requiredMessageId : undefined,
  };
  const questionTitle = (
    <>
      <span>
        {item.label}
        {required ? (
          <>
            <strong aria-hidden="true" className="inspection-required">
              {' '}*
            </strong>
            {item.type === 'multiselect' ? (
              <span className="inspection-required-screen-reader">
                {' '}(required)
              </span>
            ) : null}
          </>
        ) : null}
      </span>
      <small>{formatDetailKey(item.type)}</small>
    </>
  );

  let control;
  switch (item.type) {
    case 'textarea':
      control = (
        <textarea
          {...answerAccessibility}
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
          {...answerAccessibility}
          disabled={disabled}
          onChange={(event) => {
            const value = event.currentTarget.value;
            updateValue(value === '' ? undefined : value === 'true');
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
          {...answerAccessibility}
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
        <fieldset
          aria-describedby={requiredMissing ? requiredMessageId : undefined}
          className="inspection-multiselect"
        >
          <legend className="inspection-item-label">{questionTitle}</legend>
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
        </fieldset>
      );
      break;
    }
    case 'date':
      control = (
        <input
          {...answerAccessibility}
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
          {...answerAccessibility}
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
          {...answerAccessibility}
          disabled={disabled}
          onChange={(event) => updateValue(event.currentTarget.value)}
          type="text"
          value={typeof entry.value === 'string' ? entry.value : ''}
        />
      );
      break;
  }

  return (
    <>
      {item.type === 'multiselect' ? null : (
        <label className="inspection-item-label" htmlFor={fieldId}>
          {questionTitle}
        </label>
      )}
      <div className="inspection-field">
        {control}
        <label className="inspection-comment">
          Comment for {item.label}
          <textarea
            disabled={
              disabled ||
              normalizedInspectionAnswer(item, entry.value) === undefined
            }
            onChange={(event) =>
              onChange({ ...entry, comment: event.currentTarget.value })
            }
            rows={2}
            value={entry.comment}
          />
        </label>
      </div>
      {requiredMissing ? (
        <small
          className="inspection-required-message"
          id={requiredMessageId}
        >
          Required response missing
        </small>
      ) : null}
    </>
  );
}

function inspectionListActionLabel(
  inspection: InspectionResponseDto,
): string {
  switch (inspection.status) {
    case 'draft':
      return 'Prepare';
    case 'in_progress':
      return 'Continue';
    case 'locked':
      return 'Review';
    case 'finalized':
    case 'cancelled':
      return 'View';
  }
}

export function UnitInspections({
  api,
  propertyId,
  unitId,
  unitLabel,
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
  // Multiple verified but unlinked exact versions may belong to one room.
  // Preserve each version across room remounts; no persisted Evidence relation
  // or binary content is created by this in-memory recovery ledger.
  const [storedOnlyBySection, setStoredOnlyBySection] =
    useState<Readonly<Record<string, readonly StoredOnlyEvidenceVersion[]>>>({});
  // A room remount must not mint a new idempotency key for a binary whose
  // outcome is still ambiguous. File bytes stay only in this mounted session.
  const unresolvedEvidenceUploadsRef =
    useRef<Record<string, StableUpload>>({});
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
  const [continueIntent, setContinueIntent] = useState<InspectionContinueIntent | null>(null);
  const [stageSelection, setStageSelection] = useState<{
    readonly inspectionId: string;
    readonly sectionInstanceId: string | undefined;
    readonly status: InspectionResponseDto['status'];
    readonly lifecycleVersion: number;
    readonly stage: InspectionWorkflowStepId;
  } | null>(null);
  const continueIntentRef = useRef<InspectionContinueIntent | null>(null);
  // Only explicit phase clicks request focus. Browser/section route changes
  // continue to use their own established focus handling.
  const pendingStageFocusRef = useRef<{
    readonly inspectionId: string;
    readonly sectionInstanceId: string | undefined;
    readonly stage: InspectionWorkflowStepId;
  } | null>(null);
  const presentedLifecycleRef = useRef<{
    readonly inspectionId: string;
    readonly status: InspectionResponseDto['status'];
  } | null>(null);
  const inspectionWritePendingRef = useRef(false);
  const activeInspectionIdRef = useRef(inspectionId);
  activeInspectionIdRef.current = inspectionId;

  useEffect(() => {
    // Reuse is allowed only inside this mounted Inspection workspace.
    // Never pass an unlinked version from one Inspection to a different owner.
    setStoredOnlyBySection({});
    unresolvedEvidenceUploadsRef.current = {};
  }, [inspectionId, unitId]);

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

  const activeStage =
    routeBundle === null
      ? null
      : stageSelection?.inspectionId === routeBundle.inspection.id &&
          stageSelection.sectionInstanceId === inspectionSectionInstanceId &&
          stageSelection.status === routeBundle.inspection.status &&
          stageSelection.lifecycleVersion === routeBundle.inspection.version &&
          inspectionWorkflowStageAvailable(
            routeBundle.inspection.status,
            stageSelection.stage,
          )
        ? stageSelection.stage
        : inspectionWorkflowCurrentStep(routeBundle.inspection.status);

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

  const selectedSectionIndex = selectedSectionInstance
    ? orderedSectionInstances.findIndex(
        (instance) => instance.id === selectedSectionInstance.id,
      )
    : -1;
  const previousSectionInstance =
    selectedSectionIndex > 0
      ? orderedSectionInstances[selectedSectionIndex - 1] ?? null
      : null;
  const nextSectionInstance =
    selectedSectionIndex >= 0 &&
    selectedSectionIndex < orderedSectionInstances.length - 1
      ? orderedSectionInstances[selectedSectionIndex + 1] ?? null
      : null;

  const activeSectionIdRef = useRef<string | undefined>(
    selectedSectionInstance?.id,
  );
  activeSectionIdRef.current = selectedSectionInstance?.id;

  const activeSectionHeadingRef = useRef<HTMLHeadingElement>(null);
  const firstInspectionIdRef = useRef(inspectionId);
  const lastPresentedSectionKeyRef = useRef<string | null>(null);
  const hasPresentedFirstSectionRef = useRef(false);
  const activeSectionFocusKey =
    routeBundle && selectedSection && selectedSectionInstance
      ? inspectionSectionOperationKey(
          routeBundle.inspection.id,
          selectedSectionInstance.id,
        )
      : null;

  useEffect(() => {
    if (
      activeSectionFocusKey &&
      inspectionSectionInstanceId !== selectedSectionInstance?.id
    ) {
      // Wait for the existing route canonicalizer before focusing a
      // missing/stale SectionInstance fallback.
      return;
    }
    if (!activeSectionFocusKey) {
      // Returning to the list must allow a later selection of the same
      // Inspection/room to receive focus again.
      if (!inspectionId) lastPresentedSectionKeyRef.current = null;
      return;
    }
    // Evidence overview can select a different canonical room while staying
    // in Evidence. Do not steal focus into the hidden Inspect form.
    if (activeStage !== 'inspect') return;

    const previousKey = lastPresentedSectionKeyRef.current;
    lastPresentedSectionKeyRef.current = activeSectionFocusKey;
    if (previousKey === activeSectionFocusKey) return;

    // The outer application shell already focuses its h1 for an initial
    // direct-link load. Do not steal it after the bundle fetch resolves.
    if (!hasPresentedFirstSectionRef.current) {
      hasPresentedFirstSectionRef.current = true;
      if (inspectionId === firstInspectionIdRef.current) return;
    }

    const frame = window.requestAnimationFrame(() => {
      if (
        activeInspectionIdRef.current !== inspectionId ||
        activeSectionIdRef.current !== selectedSectionInstance?.id
      ) {
        return;
      }
      // A route change is the only trigger: PATCH responses, autosave,
      // ordinary keystrokes and a blocked navigation keep focus unchanged.
      activeSectionHeadingRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [
    activeSectionFocusKey,
    activeStage,
    inspectionId,
    inspectionSectionInstanceId,
    selectedSectionInstance?.id,
  ]);

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
  const autosaveStatus = inspectionAutosaveMessage({
    conflict,
    saveError,
    autosaveBlockedChangeRevision,
    draftChangeRevision,
    saving,
    hasUnsavedChanges,
  });

  // Phase changes only move focus; mounted forms and write state stay intact.
  const stageNavigationBlocked =
    hasUnsavedChanges ||
    sectionWritePending ||
    inspectionWritePending ||
    continueIntent !== null ||
    conflict ||
    saveError !== null;

  function selectInspectionStage(stage: InspectionWorkflowStepId) {
    if (
      !routeBundle ||
      !inspectionWorkflowStageAvailable(routeBundle.inspection.status, stage) ||
      (stageNavigationBlocked && stage !== activeStage)
    ) return;
    const target = document.querySelector<HTMLElement>(
      '[data-inspection-stage-target="' + stage + '"]',
    );
    if (!target) return;
    if (activeStage === stage) {
      target.focus({ preventScroll: true });
      target.scrollIntoView({ block: 'start' });
      return;
    }
    pendingStageFocusRef.current = {
      inspectionId: routeBundle.inspection.id,
      sectionInstanceId: inspectionSectionInstanceId,
      stage,
    };
    setStageSelection({
      inspectionId: routeBundle.inspection.id,
      sectionInstanceId: inspectionSectionInstanceId,
      status: routeBundle.inspection.status,
      lifecycleVersion: routeBundle.inspection.version,
      stage,
    });
  }

  useEffect(() => {
    const request = pendingStageFocusRef.current;
    if (
      !request ||
      routeBundle?.inspection.id !== request.inspectionId ||
      inspectionSectionInstanceId !== request.sectionInstanceId ||
      activeStage !== request.stage
    ) return;

    // Wait until React has exposed the selected phase. Focusing a still
    // hidden heading synchronously would silently lose keyboard focus.
    pendingStageFocusRef.current = null;
    const target = document.querySelector<HTMLElement>(
      '[data-inspection-stage-panel="' + request.stage + '"]:not([hidden]) ' +
        '[data-inspection-stage-target="' + request.stage + '"]',
    );
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ block: 'start' });
  }, [activeStage, routeBundle?.inspection.id, inspectionSectionInstanceId]);

  useEffect(() => {
    const current = routeBundle?.inspection;
    if (!current) {
      presentedLifecycleRef.current = null;
      return;
    }
    const previous = presentedLifecycleRef.current;
    presentedLifecycleRef.current = {
      inspectionId: current.id,
      status: current.status,
    };
    if (
      !previous ||
      previous.inspectionId !== current.id ||
      previous.status === current.status ||
      pendingStageFocusRef.current !== null ||
      activeStage === null
    ) return;

    // On a real canonical lifecycle transition the previously focused
    // command can disappear (Start, Lock, Unlock, Finalize). Restore focus
    // to the visible task heading, never on ordinary PATCH/review rerenders.
    const target = document.querySelector<HTMLElement>(
      '[data-inspection-stage-panel="' + activeStage + '"]:not([hidden]) ' +
        '[data-inspection-stage-target="' + activeStage + '"]',
    );
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ block: 'start' });
  }, [routeBundle?.inspection.id, routeBundle?.inspection.status, activeStage]);

  function openEvidenceRoom(sectionInstanceId: string) {
    if (
      !routeBundle ||
      routeBundle.inspection.status !== 'in_progress' ||
      stageNavigationBlocked ||
      !orderedSectionInstances.some((instance) => instance.id === sectionInstanceId)
    ) return;

    if (selectedSectionInstance?.id === sectionInstanceId) {
      const heading = document.querySelector<HTMLElement>(
        '[data-inspection-stage-panel="evidence"] .inspection-content-heading h3',
      );
      heading?.focus({ preventScroll: true });
      heading?.scrollIntoView({ block: 'start' });
      return;
    }
    // This is presentation navigation, never an Evidence write. Preserve
    // the canonical Inspection/SectionInstance route, then reveal its already
    // mounted Evidence editor without resetting the task stage to Inspect.
    setStageSelection({
      inspectionId: routeBundle.inspection.id,
      sectionInstanceId,
      status: routeBundle.inspection.status,
      lifecycleVersion: routeBundle.inspection.version,
      stage: 'evidence',
    });
    pendingStageFocusRef.current = {
      inspectionId: routeBundle.inspection.id,
      sectionInstanceId,
      stage: 'evidence',
    };
    navigate(
      unitRoute(propertyId, unitId, asOf, 'inspections', {
        inspectionId: routeBundle.inspection.id,
        inspectionSectionInstanceId: sectionInstanceId,
      }),
    );
  }

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
    if (inspectionWritePending || sectionWritePending || continueIntent !== null) {
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
    continueIntent,
    setNavigationBlocker,
  ]);

  function changeItem(itemId: string, entry: DraftEntry) {
    if (continueIntentRef.current !== null) return;
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

  function saveAndContinueToNextSection() {
    if (
      !routeBundle ||
      !selectedSectionInstance ||
      !nextSectionInstance ||
      continueIntentRef.current !== null ||
      inspectionWritePendingRef.current ||
      conflict ||
      saveError !== null
    ) {
      return;
    }

    const sourceInspectionId = routeBundle.inspection.id;
    const sourceSectionId = selectedSectionInstance.id;
    const sourceKey = inspectionSectionOperationKey(
      sourceInspectionId,
      sourceSectionId,
    );
    const currentSavePending = inFlightSectionSavesRef.current.has(sourceKey);
    if (inFlightSectionSavesRef.current.size > 0 && !currentSavePending) return;
    if (patch !== null && !editable && !currentSavePending) return;

    if (patch === null && !currentSavePending) {
      // A clean section is already canonically saved, so no PATCH is needed.
      navigate(
        unitRoute(propertyId, unitId, asOf, 'inspections', {
          inspectionId: sourceInspectionId,
          inspectionSectionInstanceId: nextSectionInstance.id,
        }),
      );
      return;
    }

    const intent: InspectionContinueIntent = {
      inspectionId: sourceInspectionId,
      sourceSectionId,
      destinationSectionId: nextSectionInstance.id,
      sourceRevision: currentRevision,
      draftRevision: draftChangeRevision,
      requiresAcknowledgedSave: true,
    };
    // Synchronous gate against double click and background navigation before
    // React renders the disabled controls and the pending navigation blocker.
    continueIntentRef.current = intent;
    setNavigationBlocker(() => false);
    setContinueIntent(intent);
    if (!currentSavePending && patch) {
      void persistSection(patch, draftChangeRevision);
    }
  }

  useEffect(() => {
    if (continueIntent === null) return;
    const decision = inspectionContinueDecision(continueIntent, {
      sourceInspectionId: currentInspectionId,
      sourceSectionId: currentSectionId,
      sectionRevision: currentRevision,
      draftRevision: draftChangeRevision,
      hasUnsavedChanges,
      sectionWritePending,
      inspectionWritePending,
      conflict,
      saveError,
    });
    if (decision === 'wait') return;
    continueIntentRef.current = null;
    setContinueIntent(null);
    if (decision === 'abort') {
      if (
        !saveError &&
        !conflict &&
        continueIntent.requiresAcknowledgedSave &&
        currentRevision > continueIntent.sourceRevision &&
        hasUnsavedChanges
      ) {
        setSaveError(
          'The server save could not be reconciled with your local answers. ' +
            'Your answers remain here; refresh the canonical section before continuing.',
        );
      }
      return;
    }

    // The only navigation path for dirty Save & continue: a matching
    // acknowledged section revision, no pending request and a clean draft.
    setNavigationBlocker(null);
    navigate(
      unitRoute(propertyId, unitId, asOf, 'inspections', {
        inspectionId: continueIntent.inspectionId,
        inspectionSectionInstanceId: continueIntent.destinationSectionId,
      }),
    );
  }, [
    continueIntent,
    currentInspectionId,
    currentSectionId,
    currentRevision,
    draftChangeRevision,
    hasUnsavedChanges,
    sectionWritePending,
    inspectionWritePending,
    conflict,
    saveError,
    navigate,
    propertyId,
    unitId,
    asOf,
    setNavigationBlocker,
  ]);

  useEffect(() => {
    if (
      !patch ||
      !editable ||
      saving ||
      inspectionWritePending ||
      continueIntent !== null ||
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
    continueIntent,
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
    <div className={'inspection-workspace' + (!inspectionId ? ' inspection-workspace-list' : '')}>
      {inspectionId ? (
        <div className="inspection-detail-navigation">
          <nav aria-label="Inspection context" className="inspection-context-trail">
            <WorkspaceLink
              className="inspection-context-link"
              navigate={navigate}
              route={propertyRoute(propertyId, asOf)}
            >
              Property
            </WorkspaceLink>
            <span aria-hidden="true">›</span>
            <WorkspaceLink
              className="inspection-context-link"
              navigate={navigate}
              route={unitRoute(propertyId, unitId, asOf, 'overview')}
            >
              {unitLabel}
            </WorkspaceLink>
            <span aria-hidden="true">›</span>
            <strong aria-current="page">
              {routeBundle?.inspection.code ?? selectedListInspection?.code ?? 'Inspection'}
            </strong>
          </nav>
          <WorkspaceLink
            className="back-link"
            navigate={navigate}
            route={unitRoute(propertyId, unitId, asOf, 'inspections')}
          >
            ← All Inspections
          </WorkspaceLink>
        </div>
      ) : null}

      {!inspectionId ? (
        <section className="panel inspection-yepp-list" data-inspection-yepp-list>
          <div className="inspection-yepp-list-heading">
            <div>
              <h2>Inspections</h2>
              <p className="muted">
                Current Inspection lifecycle · not rewound by the reporting date.
              </p>
            </div>
            <strong aria-label="Inspection count" className="inspection-yepp-count">
              {routeInspections === null ? '—' : routeInspections.length}
            </strong>
          </div>
          {listError ? <p className="form-error" role="alert">{listError}</p> : null}
          {!listError && routeInspections === null ? (
            <p className="muted" aria-live="polite">Loading Inspections…</p>
          ) : null}
          {routeInspections?.length === 0 ? (
            <p className="muted">No Inspections are assigned to this Unit.</p>
          ) : null}
          {routeInspections && routeInspections.length > 0 ? (
            <div
              aria-label="Current Unit Inspections — scroll sideways for more columns on mobile"
              className="inspection-yepp-table-scroll"
              role="region"
              tabIndex={0}
            >
              <table className="inspection-yepp-table">
                <caption>Current Unit Inspection list</caption>
                <thead>
                  <tr>
                    <th scope="col">Inspection</th>
                    <th scope="col">Type</th>
                    <th scope="col">Scheduled</th>
                    <th scope="col">Status</th>
                    <th scope="col">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {routeInspections.map((inspection) => (
                    <tr data-inspection-yepp-row={inspection.id} key={inspection.id}>
                      <td>
                        <strong>{inspection.code}</strong>
                      </td>
                      <td>{formatDetailKey(inspection.inspectionType)}</td>
                      <td>
                        {inspection.scheduledFor
                          ? formatSwissDate(inspection.scheduledFor)
                          : 'Unscheduled'}
                      </td>
                      <td>
                        <span className="status-chip">{formatDetailKey(inspection.status)}</span>
                      </td>
                      <td>
                        <WorkspaceLink
                          ariaLabel={inspectionListActionLabel(inspection) + ' Inspection ' + inspection.code}
                          className="button-secondary inspection-yepp-row-action"
                          navigate={navigate}
                          route={unitRoute(
                            propertyId,
                            unitId,
                            asOf,
                            'inspections',
                            { inspectionId: inspection.id },
                          )}
                        >
                          {inspectionListActionLabel(inspection)}
                        </WorkspaceLink>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      ) : null}

      {routeInspections ? (
        <InspectionOrchestrationPanel
          api={api}
          inspections={routeInspections}
          createBlockedByDirtySection={hasUnsavedChanges}
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
          selectedInspection={
            routeBundle?.inspection ?? selectedListInspection
          }
          showCreate={!inspectionId}
          showDraftOrchestration={Boolean(inspectionId)}
          unitId={unitId}
          writeGate={inspectionWriteGate}
          key={unitId}
        />
      ) : null}

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
              <h2
                data-inspection-stage-target={
                  routeBundle.inspection.status === 'draft' ? 'setup' : undefined
                }
                tabIndex={-1}
              >
                {routeBundle.inspection.code}
              </h2>
              <p className="muted">{routeBundle.schema.title}</p>
            </div>
            <span className="status-chip">{routeBundle.inspection.status}</span>
          </div>

          <InspectionWorkflowStepper
            navigationBlocked={stageNavigationBlocked}
            onSelectStage={selectInspectionStage}
            selectedStage={activeStage}
            status={routeBundle.inspection.status}
          />

          <details className="inspection-technical-details">
            <summary>Technical details</summary>
            <span>
              lifecycle v{routeBundle.inspection.version} · content r
              {routeBundle.inspection.contentRevision}
            </span>
          </details>

          <div
            className="inspection-stage-panel"
            data-inspection-stage-panel="setup"
            hidden={activeStage !== 'setup'}
          >
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
          </div>

          {routeBundle.inspection.status !== 'finalized' ? (
            <>
          {requiredProgress ? (
            <div
              className="inspection-stage-progress"
              hidden={activeStage !== 'inspect' && routeBundle.inspection.status !== 'cancelled'}
            >
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
            </div>
          ) : null}

          <div
            className={`inspection-layout ${activeStage === 'evidence' ? 'inspection-layout-evidence' : ''}`}
            hidden={
              activeStage !== 'inspect' &&
              activeStage !== 'evidence' &&
              routeBundle.inspection.status !== 'cancelled'
            }
          >
            <nav
              aria-label="Inspection sections"
              className="inspection-sections"
              hidden={activeStage !== 'inspect' && routeBundle.inspection.status !== 'cancelled'}
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

            <div className="inspection-active-section-column">
            <div
              className="inspection-stage-panel"
              data-inspection-stage-panel="inspect"
              hidden={activeStage !== 'inspect' && routeBundle.inspection.status !== 'cancelled'}
            >
            {selectedSection && selectedSectionInstance ? (
              <form className="inspection-section-form" onSubmit={saveSection}>
                <div
                  className="inspection-field-toolbar"
                  data-inspection-field-toolbar
                >
                  <div className="inspection-field-navigation">
                    {previousSectionInstance ? (
                      <WorkspaceLink
                        className="inspection-field-navigation-link"
                        navigate={navigate}
                        route={unitRoute(
                          propertyId,
                          unitId,
                          asOf,
                          'inspections',
                          {
                            inspectionId: routeBundle.inspection.id,
                            inspectionSectionInstanceId:
                              previousSectionInstance.id,
                          },
                        )}
                      >
                        ← Previous
                      </WorkspaceLink>
                    ) : (
                      <span
                        aria-disabled="true"
                        className="inspection-field-navigation-link inspection-field-navigation-link-disabled"
                      >
                        ← Previous
                      </span>
                    )}
                    <strong className="inspection-field-position">
                      Section {selectedSectionIndex + 1} of{' '}
                      {orderedSectionInstances.length}
                    </strong>
                    {nextSectionInstance ? (
                      <button
                        className="inspection-field-navigation-link inspection-continue-button"
                        data-inspection-save-continue
                        disabled={
                          continueIntent !== null ||
                          inspectionWritePending ||
                          conflict ||
                          saveError !== null ||
                          (hasUnsavedChanges && !editable && !saving)
                        }
                        onClick={saveAndContinueToNextSection}
                        type="button"
                      >
                        {continueIntent ? 'Speichern…' : 'Speichern und weiter →'}
                      </button>
                    ) : (
                      <span
                        aria-disabled="true"
                        className="inspection-field-navigation-link inspection-field-navigation-link-disabled"
                      >
                        Next →
                      </span>
                    )}
                  </div>
                  <InspectionSaveStatus message={autosaveStatus} />
                </div>

                <div className="section-heading">
                  <div>
                    <p className="eyebrow">
                      Section revision {currentRevision}
                    </p>
                    <h3
                      className="inspection-active-section-heading"
                      data-inspection-active-section-heading
                      data-inspection-stage-target="inspect"
                      ref={activeSectionHeadingRef}
                      tabIndex={-1}
                    >
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
                      <InspectionQuestionField
                        disabled={!editable || saving || inspectionWritePending || conflict || continueIntent !== null}
                        entry={entry}
                        fieldId={
                          'inspection-answer-' +
                          routeBundle.inspection.id + '-' +
                          selectedSectionInstance.id + '-' + item.id
                        }
                        item={item}
                        onChange={(next) => changeItem(item.id, next)}
                        required={required}
                        requiredMissing={requiredMissing}
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
                  <span
                    aria-hidden="true"
                    className="muted"
                    data-inspection-autosave-status
                  >
                    {autosaveStatus}
                  </span>
                  <button
                    disabled={
                      !editable ||
                      !patch ||
                      saving ||
                      inspectionWritePending ||
                      continueIntent !== null ||
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

            <div
              className="inspection-stage-panel inspection-stage-panel-evidence"
              data-inspection-stage-panel="evidence"
              hidden={activeStage !== 'evidence' && routeBundle.inspection.status !== 'cancelled'}
            >
              <h3
                className="inspection-stage-evidence-heading"
                data-inspection-stage-target="evidence"
                tabIndex={-1}
              >
                Fotos und Nachweise
              </h3>
              <p className="muted">
                Verknüpfte Nachweise aller Räume oben prüfen, danach
                Nachweise im ausgewählten Raum hinzufügen oder bearbeiten.
              </p>
              <InspectionEvidenceOverview
                active={activeStage === 'evidence'}
                api={api}
                bundle={routeBundle}
                navigationBlocked={stageNavigationBlocked}
                onOpenRoom={openEvidenceRoom}
                orderedSectionInstances={orderedSectionInstances}
                selectedSectionInstanceId={selectedSectionInstance?.id ?? null}
              />
            {selectedSection && selectedSectionInstance ? (
              <InspectionFindingsEvidence
                api={api}
                blockedByDirtySection={hasUnsavedChanges}
                bundle={routeBundle}
                key={`${routeBundle.inspection.id}:${selectedSectionInstance.id}`}
                unresolvedUpload={
                  unresolvedEvidenceUploadsRef.current[
                    `${routeBundle.inspection.id}:${selectedSectionInstance.id}`
                  ] ?? null
                }
                onUnresolvedUpload={(upload) => {
                  if (activeInspectionIdRef.current !== routeBundle.inspection.id) return;
                  const ownerKey =
                    `${routeBundle.inspection.id}:${selectedSectionInstance.id}`;
                  if (upload) {
                    unresolvedEvidenceUploadsRef.current[ownerKey] = upload;
                  } else {
                    delete unresolvedEvidenceUploadsRef.current[ownerKey];
                  }
                }}
                storedOnlyVersions={
                  storedOnlyBySection[
                    `${routeBundle.inspection.id}:${selectedSectionInstance.id}`
                  ] ?? []
                }
                onStoredOnlyVersion={(version) => {
                  if (activeInspectionIdRef.current !== routeBundle.inspection.id) return;
                  const ownerKey =
                    `${routeBundle.inspection.id}:${selectedSectionInstance.id}`;
                  setStoredOnlyBySection((current) => {
                    const versions = current[ownerKey] ?? [];
                    if (versions.some((item) => item.versionId === version.versionId)) {
                      return current;
                    }
                    return {
                      ...current,
                      [ownerKey]: [...versions, version],
                    };
                  });
                }}
                onStoredOnlyAttached={(versionId) => {
                  if (activeInspectionIdRef.current !== routeBundle.inspection.id) return;
                  const ownerKey =
                    `${routeBundle.inspection.id}:${selectedSectionInstance.id}`;
                  setStoredOnlyBySection((current) => {
                    const previous = current[ownerKey] ?? [];
                    if (!previous.some((item) => item.versionId === versionId)) {
                      return current;
                    }
                    const remaining = previous.filter((item) => item.versionId !== versionId);
                    const next = { ...current };
                    if (remaining.length > 0) {
                      next[ownerKey] = remaining;
                    } else {
                      delete next[ownerKey];
                    }
                    return next;
                  });
                }}
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
            ) : (
              <p className="muted">No SectionInstance available for evidence.</p>
            )}
            </div>
            </div>
          </div>
            </>
          ) : null}

          <div
            className="inspection-stage-panel"
            data-inspection-stage-panel={
              routeBundle.inspection.status === 'finalized' ? 'report' : 'review_sign'
            }
            hidden={
              routeBundle.inspection.status !== 'cancelled' &&
              activeStage !== (
                routeBundle.inspection.status === 'finalized' ? 'report' : 'review_sign'
              )
            }
          >
            {routeBundle.inspection.status === 'finalized' ? (
              <>
                <InspectionCompletedOverview bundle={routeBundle} />
                <InspectionEvidenceOverview
                  active={activeStage === 'report'}
                  api={api}
                  bundle={routeBundle}
                  navigationBlocked
                  orderedSectionInstances={orderedSectionInstances}
                  readOnly
                  selectedSectionInstanceId={null}
                />
              </>
            ) : null}
          <InspectionFinalizationPanel
            api={api}
            blockedByDirtySection={hasUnsavedChanges}
            bundle={routeBundle}
            key={`${routeBundle.inspection.id}:finalization`}
            onEditSectionInstance={(sectionInstanceId) => {
              if (stageNavigationBlocked) return;
              // Review may request a fix in the currently selected room.
              // Navigating to that same URL is a no-op, so explicitly reveal
              // the Inspect surface, without discarding the Review component.
              setStageSelection({
                inspectionId: routeBundle.inspection.id,
                sectionInstanceId,
                status: routeBundle.inspection.status,
                lifecycleVersion: routeBundle.inspection.version,
                stage: 'inspect',
              });
              pendingStageFocusRef.current = {
                inspectionId: routeBundle.inspection.id,
                sectionInstanceId,
                stage: 'inspect',
              };
              navigate(
                unitRoute(
                  propertyId,
                  unitId,
                  asOf,
                  'inspections',
                  {
                    inspectionId: routeBundle.inspection.id,
                    inspectionSectionInstanceId: sectionInstanceId,
                  },
                ),
              );
            }}
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
          </div>
        </section>
      ) : null}
    </div>
  );
}
