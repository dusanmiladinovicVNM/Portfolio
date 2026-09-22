import {
  assignedInspectionWorkListResponseSchema,
  createInspectionRequestSchema,
  inspectionBundleResponseSchema,
  inspectionListResponseSchema,
  inspectionResponseSchema,
  inspectionSchemaVersionListResponseSchema,
  inspectionStaffListResponseSchema,
  tenancyListResponseSchema,
  updateInspectionOrchestrationRequestSchema,
  type InspectionResponseDto,
  type InspectionSchemaVersionResponse,
  type InspectionStaffResponse,
  type TenancyResponse,
} from '@portfolio/contracts';
import {
  INSPECTION_TYPES,
  type InspectionType,
} from '@portfolio/domain';
import {
  type FormEvent,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  assignedInspectionsPath,
  inspectionOrchestrationPath,
  inspectionPath,
  inspectionSchemasPath,
  inspectionStaffPath,
  unitInspectionsPath,
  unitTenanciesPath,
} from '../api/paths.js';
import {
  isAmbiguousWriteFailure,
  type PortfolioApi,
} from '../api/portfolio-api.js';
import {
  contractErrorMessage,
  requiredString,
} from '../admin/form-utils.js';
import { unitRoute } from '../navigation/workspace-route.js';
import type { NavigateWorkspace } from '../navigation/use-workspace-navigation.js';
import { formatDetailKey } from '../presentation/format.js';
import type { InspectionWriteGate } from './inspection-write-gate.js';
import {
  assertAssignedInspectionWorkList,
  assertCreatedInspection,
  assertInspectionOrchestrationMutation,
  assertInspectionStaffList,
  assertUnitInspectionListOwner,
  findRecoveredCreatedInspection,
  isRecoveredInspectionOrchestration,
} from './inspection-orchestration-owner.js';

interface InspectionOrchestrationPanelProps {
  readonly api: PortfolioApi;
  readonly propertyId: string;
  readonly unitId: string;
  readonly asOf: string;
  readonly inspections: readonly InspectionResponseDto[];
  readonly selectedInspection: InspectionResponseDto | null;
  readonly createBlockedByDirtySection: boolean;
  readonly navigate: NavigateWorkspace;
  readonly writeGate: InspectionWriteGate;
  readonly onCreated: (inspection: InspectionResponseDto) => void;
  readonly onUpdated: (inspection: InspectionResponseDto) => void;
  readonly onCanonicalReload: () => void;
}

function inspectionError(cause: unknown, fallback: string): string {
  return cause instanceof Error ? cause.message : fallback;
}

function staffLabel(staff: InspectionStaffResponse): string {
  return staff.email
    ? `${staff.displayName} · ${staff.email} · ${staff.role}`
    : `${staff.displayName} · ${staff.role}`;
}

function tenancyLabel(tenancy: TenancyResponse): string {
  return `${tenancy.code} · ${formatDetailKey(tenancy.status)}`;
}

export function InspectionOrchestrationPanel({
  api,
  propertyId,
  unitId,
  asOf,
  inspections,
  selectedInspection,
  createBlockedByDirtySection,
  navigate,
  writeGate,
  onCreated,
  onUpdated,
  onCanonicalReload,
}: InspectionOrchestrationPanelProps) {
  const [schemas, setSchemas] =
    useState<readonly InspectionSchemaVersionResponse[] | null>(null);
  const [staff, setStaff] =
    useState<readonly InspectionStaffResponse[] | null>(null);
  const [tenancies, setTenancies] =
    useState<readonly TenancyResponse[] | null>(null);
  const [assignedWork, setAssignedWork] =
    useState<
      Awaited<
        ReturnType<
          typeof assignedInspectionWorkListResponseSchema.parse
        >
      >['items'] | null
    >(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [assignedWorkError, setAssignedWorkError] =
    useState<string | null>(null);
  const [writeError, setWriteError] = useState<string | null>(null);
  const [writeSuccess, setWriteSuccess] = useState<string | null>(null);
  const [inspectionType, setInspectionType] =
    useState<InspectionType>('move_in');
  const [workRevision, setWorkRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setSchemas(null);
    setStaff(null);
    setTenancies(null);
    setLoadError(null);

    void Promise.all([
      api.get(
        inspectionSchemasPath(),
        inspectionSchemaVersionListResponseSchema,
        { signal: controller.signal },
      ),
      api.get(
        inspectionStaffPath(),
        inspectionStaffListResponseSchema,
        { signal: controller.signal },
      ),
      api.get(
        unitTenanciesPath(unitId),
        tenancyListResponseSchema,
        { signal: controller.signal },
      ),
    ])
      .then(([schemaResponse, staffResponse, tenancyResponse]) => {
        if (controller.signal.aborted) return;
        assertInspectionStaffList(staffResponse.items);
        if (
          tenancyResponse.items.some(
            (tenancy) => tenancy.unitId !== unitId,
          )
        ) {
          throw new Error(
            'Inspection orchestration received a Tenancy from another Unit.',
          );
        }
        setSchemas(schemaResponse.items);
        setStaff(staffResponse.items);
        setTenancies(tenancyResponse.items);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setLoadError(
          inspectionError(
            cause,
            'Inspection orchestration context could not be loaded.',
          ),
        );
      });

    return () => controller.abort();
  }, [api, unitId]);

  useEffect(() => {
    const controller = new AbortController();
    setAssignedWork(null);
    setAssignedWorkError(null);

    void api
      .get(
        assignedInspectionsPath(),
        assignedInspectionWorkListResponseSchema,
        { signal: controller.signal },
      )
      .then((workResponse) => {
        if (controller.signal.aborted) return;
        assertAssignedInspectionWorkList(workResponse.items);
        setAssignedWork(workResponse.items);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setAssignedWorkError(
          inspectionError(
            cause,
            'Assigned Inspection work could not be loaded.',
          ),
        );
      });

    return () => controller.abort();
  }, [api, unitId, workRevision]);

  const publishedSchemas = useMemo(
    () =>
      (schemas ?? []).filter(
        (schema) =>
          schema.status === 'published' &&
          schema.inspectionType === inspectionType,
      ),
    [inspectionType, schemas],
  );

  async function reconcileCreate(
    preExistingIds: ReadonlySet<string>,
    expected: {
      readonly code: string;
      readonly inspectionType: InspectionType;
      readonly unitId: string;
      readonly tenancyId: string | null;
      readonly schemaVersionId: string;
      readonly assignedToUserId: string;
      readonly scheduledFor: string | null;
    },
  ): Promise<boolean> {
    try {
      const canonical = await api.get(
        unitInspectionsPath(unitId),
        inspectionListResponseSchema,
      );
      assertUnitInspectionListOwner(unitId, canonical.items);
      const recovered = findRecoveredCreatedInspection(
        canonical.items,
        preExistingIds,
        expected,
      );
      if (!recovered) return false;
      writeGate.finish();
      onCreated(recovered);
      setWorkRevision((revision) => revision + 1);
      return true;
    } catch {
      return false;
    }
  }

  async function createInspection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (createBlockedByDirtySection) {
      setWriteError(
        'Save or discard the current section before creating another Inspection.',
      );
      return;
    }

    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const expected = {
      code: requiredString(form, 'code'),
      inspectionType,
      unitId,
      tenancyId: requiredString(form, 'tenancyId') || null,
      schemaVersionId: requiredString(form, 'schemaVersionId'),
      assignedToUserId: requiredString(form, 'assignedToUserId'),
      scheduledFor: requiredString(form, 'scheduledFor') || null,
    };
    const parsed = createInspectionRequestSchema.safeParse({
      code: expected.code,
      inspectionType: expected.inspectionType,
      tenancyId: expected.tenancyId,
      schemaVersionId: expected.schemaVersionId,
      assignedToUserId: expected.assignedToUserId,
      scheduledFor: expected.scheduledFor,
    });
    if (!parsed.success) {
      setWriteError(contractErrorMessage());
      return;
    }
    if (!writeGate.tryStart()) return;

    const preExistingIds = new Set(
      inspections.map((inspection) => inspection.id),
    );
    setWriteError(null);
    setWriteSuccess(null);

    try {
      const created = await api.post(
        unitInspectionsPath(unitId),
        parsed.data,
        inspectionResponseSchema,
      );
      assertCreatedInspection(expected, created);
      formElement.reset();
      setInspectionType('move_in');
      writeGate.finish();
      onCreated(created);
      setWorkRevision((revision) => revision + 1);
      setWriteSuccess('Inspection created from canonical orchestration data.');
    } catch (cause) {
      const recovered = isAmbiguousWriteFailure(cause)
        ? await reconcileCreate(
            preExistingIds,
            expected,
          )
        : false;
      if (!recovered) {
        onCanonicalReload();
        setWriteError(
          inspectionError(
            cause,
            'Inspection creation outcome could not be confirmed. Canonical Unit Inspections were reloaded; do not retry until the list has been checked.',
          ),
        );
      } else {
        setWriteSuccess(
          'Inspection creation was committed and recovered after an ambiguous response.',
        );
      }
    } finally {
      writeGate.finish();
    }
  }

  async function updateOrchestration(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    if (!selectedInspection || selectedInspection.status !== 'draft') return;

    const form = new FormData(event.currentTarget);
    const expected = {
      assignedToUserId: requiredString(form, 'assignedToUserId'),
      scheduledFor: requiredString(form, 'scheduledFor') || null,
    };

    if (
      expected.assignedToUserId ===
        selectedInspection.assignedToUserId &&
      expected.scheduledFor === selectedInspection.scheduledFor
    ) {
      setWriteError('Choose a different assignee or schedule before saving.');
      return;
    }

    const parsed = updateInspectionOrchestrationRequestSchema.safeParse({
      expectedVersion: selectedInspection.version,
      ...expected,
    });
    if (!parsed.success) {
      setWriteError(contractErrorMessage());
      return;
    }
    if (!writeGate.tryStart()) return;

    const target = selectedInspection;
    setWriteError(null);
    setWriteSuccess(null);

    try {
      const updated = await api.post(
        inspectionOrchestrationPath(target.id),
        parsed.data,
        inspectionResponseSchema,
      );
      assertInspectionOrchestrationMutation(
        target,
        expected,
        updated,
      );
      onUpdated(updated);
      setWorkRevision((revision) => revision + 1);
      setWriteSuccess('Inspection assignment/schedule updated.');
    } catch (cause) {
      let recovered = false;
      if (isAmbiguousWriteFailure(cause)) {
        try {
          const canonical = await api.get(
            inspectionPath(target.id),
            inspectionBundleResponseSchema,
          );
          if (
            canonical.inspection.id === target.id &&
            canonical.inspection.unitId === target.unitId &&
            isRecoveredInspectionOrchestration(
              target,
              expected,
              canonical.inspection,
            )
          ) {
            recovered = true;
            onUpdated(canonical.inspection);
            setWorkRevision((revision) => revision + 1);
            setWriteSuccess(
              'Inspection orchestration was committed and recovered.',
            );
          }
        } catch {
          // Fall through to canonical reload/error below.
        }
      }

      if (!recovered) {
        onCanonicalReload();
        setWriteError(
          inspectionError(
            cause,
            'Inspection orchestration could not be confirmed. Canonical state was reloaded.',
          ),
        );
      }
    } finally {
      writeGate.finish();
    }
  }

  return (
    <>
      <section className="panel inspection-orchestration-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Office orchestration</p>
            <h2>Create Inspection</h2>
          </div>
          <span className="section-note">
            Assignment + schedule stay operational metadata
          </span>
        </div>

        {loadError ? (
          <p className="form-error" role="alert">{loadError}</p>
        ) : null}
        {writeError ? (
          <p className="form-error" role="alert">{writeError}</p>
        ) : null}
        {writeSuccess ? (
          <p className="setup-form-success" aria-live="polite">
            {writeSuccess}
          </p>
        ) : null}

        {schemas && staff && tenancies ? (
          <form
            className="setup-form inspection-orchestration-form"
            data-inspection-form="create"
            onSubmit={createInspection}
          >
            <div className="setup-form-grid">
              <label>
                Inspection code
                <input
                  disabled={writeGate.pending}
                  name="code"
                  required
                />
              </label>
              <label>
                Type
                <select
                  disabled={writeGate.pending}
                  onChange={(event) =>
                    setInspectionType(
                      event.currentTarget.value as InspectionType,
                    )
                  }
                  value={inspectionType}
                >
                  {INSPECTION_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {formatDetailKey(type)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Published schema
                <select
                  disabled={
                    writeGate.pending || publishedSchemas.length === 0
                  }
                  name="schemaVersionId"
                  required
                  defaultValue=""
                  key={inspectionType}
                >
                  <option value="">Select schema…</option>
                  {publishedSchemas.map((schema) => (
                    <option key={schema.id} value={schema.id}>
                      {schema.schemaCode} v{schema.versionNumber} ·{' '}
                      {schema.title}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Tenancy
                <select
                  defaultValue=""
                  disabled={writeGate.pending}
                  name="tenancyId"
                >
                  <option value="">No Tenancy</option>
                  {tenancies.map((tenancy) => (
                    <option key={tenancy.id} value={tenancy.id}>
                      {tenancyLabel(tenancy)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Assigned staff
                <select
                  defaultValue=""
                  disabled={writeGate.pending || staff.length === 0}
                  name="assignedToUserId"
                  required
                >
                  <option value="">Select staff…</option>
                  {staff.map((entry) => (
                    <option key={entry.userId} value={entry.userId}>
                      {staffLabel(entry)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Scheduled for
                <input
                  disabled={writeGate.pending}
                  name="scheduledFor"
                  type="date"
                />
              </label>
            </div>
            {publishedSchemas.length === 0 ? (
              <p className="setup-hint">
                No published schema is available for this Inspection type.
              </p>
            ) : null}
            {createBlockedByDirtySection ? (
              <p className="setup-hint" role="status">
                Save or discard the current section before creating another Inspection.
              </p>
            ) : null}
            <button
              className="button-primary"
              disabled={
                writeGate.pending ||
                createBlockedByDirtySection ||
                staff.length === 0 ||
                publishedSchemas.length === 0
              }
              type="submit"
            >
              {writeGate.pending ? 'Write in progress…' : 'Create Inspection'}
            </button>
          </form>
        ) : (
          <p className="muted" aria-live="polite">
            Loading Inspection orchestration context…
          </p>
        )}
      </section>

      {selectedInspection?.status === 'draft' && staff ? (
        <section className="panel inspection-orchestration-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">
                Draft orchestration · v{selectedInspection.version}
              </p>
              <h2>Assignment + schedule</h2>
            </div>
            <span className="section-note">
              Frozen when field work starts
            </span>
          </div>
          <form
            className="setup-form inspection-orchestration-form"
            data-inspection-form="orchestration"
            key={`${selectedInspection.id}:${selectedInspection.version}`}
            onSubmit={updateOrchestration}
          >
            <div className="setup-form-grid">
              <label>
                Assigned staff
                <select
                  defaultValue={selectedInspection.assignedToUserId}
                  disabled={writeGate.pending}
                  name="assignedToUserId"
                  required
                >
                  {staff.map((entry) => (
                    <option key={entry.userId} value={entry.userId}>
                      {staffLabel(entry)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Scheduled for
                <input
                  defaultValue={selectedInspection.scheduledFor ?? ''}
                  disabled={writeGate.pending}
                  name="scheduledFor"
                  type="date"
                />
              </label>
            </div>
            <button
              className="button-secondary"
              disabled={writeGate.pending}
              type="submit"
            >
              {writeGate.pending ? 'Write in progress…' : 'Save orchestration'}
            </button>
          </form>
        </section>
      ) : null}

      <section className="panel inspection-assigned-work-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Assigned work</p>
            <h2>My active Inspections</h2>
          </div>
          <span className="section-note">
            Cross-Unit queue uses canonical Property + Unit routing
          </span>
        </div>

        {assignedWorkError ? (
          <p className="form-error" role="alert">
            {assignedWorkError}
          </p>
        ) : null}
        {assignedWork === null && !assignedWorkError ? (
          <p className="muted" aria-live="polite">
            Loading assigned work…
          </p>
        ) : null}
        {assignedWork?.length === 0 ? (
          <p className="muted">No active Inspections are assigned to you.</p>
        ) : null}
        {assignedWork && assignedWork.length > 0 ? (
          <div className="inspection-assigned-work-list">
            {assignedWork.map((item) => (
              <button
                className="inspection-assigned-work-card"
                disabled={writeGate.pending}
                key={item.inspection.id}
                onClick={() =>
                  navigate(
                    unitRoute(
                      item.propertyId,
                      item.inspection.unitId,
                      asOf,
                      'inspections',
                      { inspectionId: item.inspection.id },
                    ),
                  )
                }
                type="button"
              >
                <strong>{item.inspection.code}</strong>
                <span>
                  {item.unitCode} · Unit {item.unitNumber}
                </span>
                <small>
                  {formatDetailKey(item.inspection.inspectionType)} ·{' '}
                  {item.inspection.scheduledFor ?? 'Unscheduled'} ·{' '}
                  {formatDetailKey(item.inspection.status)}
                </small>
              </button>
            ))}
          </div>
        ) : null}
      </section>
    </>
  );
}
