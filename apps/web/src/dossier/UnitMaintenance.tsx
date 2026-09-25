import {
  assignMaintenanceWorkOrderRequestSchema,
  assetListResponseSchema,
  changeMaintenanceIssueStatusRequestSchema,
  changeMaintenanceWorkOrderStatusRequestSchema,
  createMaintenanceIssueRequestSchema,
  createMaintenanceWorkOrderRequestSchema,
  inspectionBundleResponseSchema,
  inspectionListResponseSchema,
  linkMaintenanceServiceEventRequestSchema,
  maintenanceIssueListResponseSchema,
  maintenanceIssueResponseSchema,
  maintenanceWorkOrderEntryListResponseSchema,
  maintenanceWorkOrderServiceEventLinkResponseSchema,
  maintenanceWorkOrderResponseSchema,
  partyListResponseSchema,
  recordServiceEventRequestSchema,
  serviceEventListResponseSchema,
  serviceEventResponseSchema,
  spaceListResponseSchema,
  updateMaintenanceIssueRequestSchema,
  updateMaintenanceWorkOrderRequestSchema,
  type AssetResponse,
  type InspectionBundleResponse,
  type InspectionFindingResponse,
  type MaintenanceIssueResponse,
  type MaintenanceWorkOrderEntryResponse,
  type PartyResponse,
  type ServiceEventResponse,
  type SpaceResponse,
} from '@portfolio/contracts';
import {
  MAINTENANCE_ISSUE_PRIORITIES,
  SERVICE_EVENT_TYPES,
  type MaintenanceIssuePriority,
  type ServiceEventType,
} from '@portfolio/domain';
import {
  type FormEvent,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  assetServiceEventsPath,
  inspectionPath,
  maintenanceIssuePath,
  maintenanceIssuesPath,
  maintenanceIssueStatusPath,
  maintenanceIssueWorkOrdersPath,
  maintenanceWorkOrderAssignPath,
  maintenanceWorkOrderPath,
  maintenanceWorkOrderServiceEventsPath,
  maintenanceWorkOrderStatusPath,
  partiesPath,
  unitAssetsPath,
  unitInspectionsPath,
  unitMaintenanceIssuesPath,
  unitSpacesPath,
} from '../api/paths.js';
import {
  PortfolioApiError,
  type PortfolioApi,
} from '../api/portfolio-api.js';
import {
  contractErrorMessage,
  optionalString,
  requiredString,
} from '../admin/form-utils.js';
import { useCreateSubmissionGuard } from '../admin/use-create-submission-guard.js';
import { WorkspaceLink } from '../navigation/WorkspaceLink.js';
import { unitRoute } from '../navigation/workspace-route.js';
import type {
  NavigateWorkspace,
  SetNavigationBlocker,
} from '../navigation/use-workspace-navigation.js';
import {
  formatDetailKey,
  formatSwissDateTime,
} from '../presentation/format.js';
import {
  assertCreatedMaintenanceIssue,
  assertCreatedMaintenanceWorkOrder,
  assertCreatedServiceEvent,
  assertInspectionBundleUnitOwner,
  assertMaintenanceIssueOwner,
  assertMaintenanceIssueTerminal,
  assertMaintenanceIssueUpdate,
  assertMaintenanceServiceEventLink,
  assertMaintenanceWorkOrderAssignment,
  assertMaintenanceWorkOrderOwner,
  assertMaintenanceWorkOrdersOwner,
  assertMaintenanceWorkOrderTransition,
  assertMaintenanceWorkOrderUpdate,
  assertServiceEventsOwner,
  assertUnitMaintenanceIssuesOwner,
} from './maintenance-owner.js';

interface UnitMaintenanceProps {
  readonly api: PortfolioApi;
  readonly propertyId: string;
  readonly unitId: string;
  readonly asOf: string;
  readonly issueId?: string | undefined;
  readonly workOrderId?: string | undefined;
  readonly navigate: NavigateWorkspace;
  readonly setNavigationBlocker: SetNavigationBlocker;
}

interface MaintenanceWriteGate {
  readonly pending: boolean;
  readonly tryStart: () => boolean;
  readonly finish: () => void;
}

interface FindingOption {
  readonly inspectionCode: string;
  readonly finding: InspectionFindingResponse;
}

function utcInstant(date: string, time: string): string | undefined {
  if (date === '' && time === '') return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return undefined;
  if (!/^\d{2}:\d{2}$/.test(time)) return undefined;
  const value = `${date}T${time}:00.000Z`;
  return Number.isNaN(Date.parse(value)) ? undefined : value;
}

function nullableString(form: FormData, name: string): string | null {
  return optionalString(form, name) ?? null;
}

function maintenanceError(cause: unknown, fallback: string): string {
  if (
    cause instanceof PortfolioApiError &&
    (cause.code === 'MAINTENANCE_ISSUE_VERSION_CONFLICT' ||
      cause.code === 'MAINTENANCE_WORK_ORDER_VERSION_CONFLICT')
  ) {
    return 'This Maintenance record changed on the server. Canonical state was reloaded.';
  }
  if (
    cause instanceof PortfolioApiError &&
    cause.code === 'MAINTENANCE_FINDING_ALREADY_LINKED'
  ) {
    return 'That Inspection Finding already originated another Maintenance Issue.';
  }
  if (
    cause instanceof PortfolioApiError &&
    cause.code === 'MAINTENANCE_SERVICE_EVENT_ALREADY_LINKED'
  ) {
    return 'That ServiceEvent is already linked to a Maintenance WorkOrder.';
  }
  return cause instanceof Error ? cause.message : fallback;
}

function assigneeLabel(
  entry: MaintenanceWorkOrderEntryResponse,
  parties: readonly PartyResponse[],
): string {
  const assignee = entry.workOrder.assignee;
  if (assignee === null) return 'Unassigned';
  if (assignee.kind === 'user') return `Internal user · ${assignee.userId}`;
  return (
    parties.find((party) => party.id === assignee.partyId)?.displayName ??
    `Party · ${assignee.partyId}`
  );
}

function CreateIssueForm({
  api,
  propertyId,
  unitId,
  spaces,
  assets,
  findings,
  existingIssues,
  linkedFindingIds,
  writeGate,
  onCreated,
  onReconcile,
}: {
  readonly api: PortfolioApi;
  readonly propertyId: string;
  readonly unitId: string;
  readonly spaces: readonly SpaceResponse[];
  readonly assets: readonly AssetResponse[];
  readonly findings: readonly FindingOption[];
  readonly existingIssues: readonly MaintenanceIssueResponse[];
  readonly linkedFindingIds: ReadonlySet<string>;
  readonly writeGate: MaintenanceWriteGate;
  readonly onCreated: (issue: MaintenanceIssueResponse) => void;
  readonly onReconcile: () => void;
}) {
  const local = useCreateSubmissionGuard();
  const [assetId, setAssetId] = useState('');
  const [spaceId, setSpaceId] = useState('');
  const [priority, setPriority] =
    useState<MaintenanceIssuePriority>('normal');
  const [error, setError] = useState<string | null>(null);

  const selectedAsset =
    assets.find((asset) => asset.id === assetId) ?? null;

  useEffect(() => {
    if (selectedAsset) {
      setSpaceId(selectedAsset.spaceId ?? '');
    }
  }, [selectedAsset]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const date = requiredString(form, 'reportedDate');
    const time = requiredString(form, 'reportedTime');
    const reportedAt = utcInstant(date, time);

    if ((date !== '' || time !== '') && reportedAt === undefined) {
      setError('Reported date and time must either both be empty or form a valid UTC instant.');
      return;
    }

    const expected = {
      code: requiredString(form, 'code'),
      propertyId,
      unitId,
      spaceId: spaceId || null,
      assetId: assetId || null,
      inspectionFindingId: requiredString(form, 'inspectionFindingId') || null,
      title: requiredString(form, 'title'),
      description: nullableString(form, 'description'),
      priority,
      ...(reportedAt ? { reportedAt } : {}),
    };
    const parsed = createMaintenanceIssueRequestSchema.safeParse(expected);
    if (!parsed.success) {
      setError(contractErrorMessage());
      return;
    }
    if (!local.tryStart()) return;
    if (!writeGate.tryStart()) {
      local.finish();
      return;
    }

    setError(null);
    try {
      const created = await api.post(
        maintenanceIssuesPath(),
        parsed.data,
        maintenanceIssueResponseSchema,
      );
      assertCreatedMaintenanceIssue(expected, created);
      if (local.isMounted()) {
        formElement.reset();
        setAssetId('');
        setSpaceId('');
        setPriority('normal');
        writeGate.finish();
        onCreated(created);
      }
    } catch (cause) {
      if (local.isMounted()) {
        const knownIds = new Set(existingIssues.map((issue) => issue.id));
        try {
          const canonical = await api.get(
            unitMaintenanceIssuesPath(unitId),
            maintenanceIssueListResponseSchema,
          );
          assertUnitMaintenanceIssuesOwner(unitId, canonical.items);
          const recovered = canonical.items.find((candidate) => {
            if (knownIds.has(candidate.id)) return false;
            try {
              assertCreatedMaintenanceIssue(expected, candidate);
              return true;
            } catch {
              return false;
            }
          });
          if (recovered && local.isMounted()) {
            formElement.reset();
            setAssetId('');
            setSpaceId('');
            setPriority('normal');
            writeGate.finish();
            onCreated(recovered);
            return;
          }
        } catch {
          // Fall through to canonical refresh + explicit ambiguous outcome UX.
        }
        onReconcile();
        setError(
          maintenanceError(
            cause,
            'Issue creation outcome could not be confirmed. Canonical Unit Maintenance state was reloaded; do not retry until the Issue list is checked.',
          ),
        );
      }
    } finally {
      local.finish();
      writeGate.finish();
    }
  }

  const availableFindings = findings.filter(
    ({ finding }) => !linkedFindingIds.has(finding.id),
  );

  return (
    <form
      className="setup-form maintenance-form"
      data-maintenance-form="create-issue"
      onSubmit={submit}
    >
      <div className="tenancy-form-heading">
        <strong>Report Maintenance Issue</strong>
        <span>
          Scope and origin are immutable after creation
        </span>
      </div>
      <div className="setup-form-grid">
        <label>
          Issue code
          <input disabled={writeGate.pending} name="code" required />
        </label>
        <label>
          Priority
          <select
            disabled={writeGate.pending}
            onChange={(event) =>
              setPriority(
                event.currentTarget.value as MaintenanceIssuePriority,
              )
            }
            value={priority}
          >
            {MAINTENANCE_ISSUE_PRIORITIES.map((value) => (
              <option key={value} value={value}>
                {formatDetailKey(value)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Title
          <input disabled={writeGate.pending} name="title" required />
        </label>
        <label>
          Space
          <select
            disabled={writeGate.pending || selectedAsset !== null}
            name="spaceId"
            onChange={(event) => setSpaceId(event.currentTarget.value)}
            value={spaceId}
          >
            <option value="">Unit level</option>
            {spaces.map((space) => (
              <option key={space.id} value={space.id}>
                {space.code} · {space.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Asset
          <select
            disabled={writeGate.pending}
            name="assetId"
            onChange={(event) => setAssetId(event.currentTarget.value)}
            value={assetId}
          >
            <option value="">No Asset scope</option>
            {assets.map((asset) => (
              <option key={asset.id} value={asset.id}>
                {asset.code} · {asset.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Originating Inspection Finding
          <select
            defaultValue=""
            disabled={writeGate.pending}
            name="inspectionFindingId"
          >
            <option value="">No Inspection origin</option>
            {availableFindings.map(({ inspectionCode, finding }) => (
              <option key={finding.id} value={finding.id}>
                {inspectionCode} · {formatDetailKey(finding.severity)} ·{' '}
                {finding.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          Reported date (UTC)
          <input
            disabled={writeGate.pending}
            name="reportedDate"
            type="date"
          />
        </label>
        <label>
          Reported time (UTC)
          <input
            disabled={writeGate.pending}
            name="reportedTime"
            type="time"
          />
        </label>
      </div>
      <label>
        Description
        <textarea disabled={writeGate.pending} name="description" rows={3} />
      </label>
      {selectedAsset ? (
        <p className="setup-hint">
          Asset scope uses its current canonical placement: Unit {unitId}
          {selectedAsset.spaceId
            ? ` / Space ${selectedAsset.spaceId}`
            : ' / Unit level'}. For historical problems at an older Asset
          location, create a Unit/Finding-scoped Issue instead of falsifying
          Asset scope.
        </p>
      ) : null}
      {error ? <p className="setup-form-error" role="alert">{error}</p> : null}
      <button
        className="button-primary"
        disabled={writeGate.pending}
        type="submit"
      >
        {writeGate.pending ? 'Write in progress…' : 'Create Issue'}
      </button>
    </form>
  );
}

function IssueAdministration({
  api,
  issue,
  workOrders,
  selectedWorkOrderId,
  parties,
  serviceEvents,
  writeGate,
  onCanonicalWrite,
  onWorkOrderCreated,
  onWorkOrderSelected,
}: {
  readonly api: PortfolioApi;
  readonly issue: MaintenanceIssueResponse;
  readonly workOrders: readonly MaintenanceWorkOrderEntryResponse[];
  readonly selectedWorkOrderId?: string | undefined;
  readonly parties: readonly PartyResponse[];
  readonly serviceEvents: readonly ServiceEventResponse[];
  readonly writeGate: MaintenanceWriteGate;
  readonly onCanonicalWrite: () => void;
  readonly onWorkOrderCreated: (
    workOrder: MaintenanceWorkOrderEntryResponse['workOrder'],
  ) => void;
  readonly onWorkOrderSelected: (workOrderId: string) => void;
}) {
  const local = useCreateSubmissionGuard();
  const [action, setAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const activeParties = parties.filter((party) => party.status === 'active');
  const selectedEntry =
    workOrders.find(
      (entry) => entry.workOrder.id === selectedWorkOrderId,
    ) ?? null;
  const selectedOrder = selectedEntry?.workOrder ?? null;

  function begin(next: string): boolean {
    if (!local.tryStart()) return false;
    if (!writeGate.tryStart()) {
      local.finish();
      return false;
    }
    setAction(next);
    setError(null);
    setSuccess(null);
    return true;
  }

  function finish() {
    local.finish();
    writeGate.finish();
    if (local.isMounted()) setAction(null);
  }

  async function updateIssue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const expected = {
      title: requiredString(form, 'title'),
      description: nullableString(form, 'description'),
      priority: requiredString(form, 'priority') as MaintenanceIssuePriority,
    };
    if (
      expected.title === issue.title &&
      expected.description === issue.description &&
      expected.priority === issue.priority
    ) {
      setError('No Issue corrections to save.');
      return;
    }
    const parsed = updateMaintenanceIssueRequestSchema.safeParse({
      expectedVersion: issue.version,
      ...expected,
    });
    if (!parsed.success) {
      setError(contractErrorMessage());
      return;
    }
    if (!begin('issue-update')) return;

    try {
      const response = await api.patch(
        maintenanceIssuePath(issue.id),
        parsed.data,
        maintenanceIssueResponseSchema,
      );
      assertMaintenanceIssueUpdate(issue, expected, response);
      if (local.isMounted()) {
        setSuccess('Issue metadata corrected.');
        onCanonicalWrite();
      }
    } catch (cause) {
      if (local.isMounted()) {
        setError(maintenanceError(cause, 'Issue could not be updated.'));
        onCanonicalWrite();
      }
    } finally {
      finish();
    }
  }

  async function createWorkOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const expected = {
      code: requiredString(form, 'code'),
      title: requiredString(form, 'title'),
      description: nullableString(form, 'description'),
    };
    const parsed = createMaintenanceWorkOrderRequestSchema.safeParse(expected);
    if (!parsed.success) {
      setError(contractErrorMessage());
      return;
    }
    if (!begin('work-order-create')) return;

    try {
      const created = await api.post(
        maintenanceIssueWorkOrdersPath(issue.id),
        parsed.data,
        maintenanceWorkOrderResponseSchema,
      );
      assertCreatedMaintenanceWorkOrder(issue.id, expected, created);
      if (local.isMounted()) {
        formElement.reset();
        writeGate.finish();
        onWorkOrderCreated(created);
      }
    } catch (cause) {
      if (local.isMounted()) {
        const knownIds = new Set(
          workOrders.map((entry) => entry.workOrder.id),
        );
        try {
          const canonical = await api.get(
            maintenanceIssueWorkOrdersPath(issue.id),
            maintenanceWorkOrderEntryListResponseSchema,
          );
          assertMaintenanceWorkOrdersOwner(issue.id, canonical.items);
          const recovered = canonical.items.find((entry) => {
            if (knownIds.has(entry.workOrder.id)) return false;
            try {
              assertCreatedMaintenanceWorkOrder(
                issue.id,
                expected,
                entry.workOrder,
              );
              return true;
            } catch {
              return false;
            }
          });
          if (recovered && local.isMounted()) {
            formElement.reset();
            writeGate.finish();
            onWorkOrderCreated(recovered.workOrder);
            return;
          }
        } catch {
          // Fall through to canonical refresh + explicit ambiguous outcome UX.
        }
        setError(
          maintenanceError(
            cause,
            'WorkOrder creation outcome could not be confirmed. Canonical WorkOrders were reloaded; do not retry until the WorkOrder list is checked.',
          ),
        );
        onCanonicalWrite();
      }
    } finally {
      finish();
    }
  }

  async function updateWorkOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedOrder) return;
    const form = new FormData(event.currentTarget);
    const expected = {
      title: requiredString(form, 'title'),
      description: nullableString(form, 'description'),
    };
    if (
      expected.title === selectedOrder.title &&
      expected.description === selectedOrder.description
    ) {
      setError('No WorkOrder corrections to save.');
      return;
    }
    const parsed = updateMaintenanceWorkOrderRequestSchema.safeParse({
      expectedVersion: selectedOrder.version,
      ...expected,
    });
    if (!parsed.success) {
      setError(contractErrorMessage());
      return;
    }
    if (!begin('work-order-update')) return;

    try {
      const response = await api.patch(
        maintenanceWorkOrderPath(selectedOrder.id),
        parsed.data,
        maintenanceWorkOrderResponseSchema,
      );
      assertMaintenanceWorkOrderUpdate(selectedOrder, expected, response);
      if (local.isMounted()) {
        setSuccess('WorkOrder definition corrected.');
        onCanonicalWrite();
      }
    } catch (cause) {
      if (local.isMounted()) {
        setError(maintenanceError(cause, 'WorkOrder could not be updated.'));
        onCanonicalWrite();
      }
    } finally {
      finish();
    }
  }

  async function assignWorkOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedOrder) return;
    const form = new FormData(event.currentTarget);
    const partyId = requiredString(form, 'partyId');
    const parsed = assignMaintenanceWorkOrderRequestSchema.safeParse({
      expectedVersion: selectedOrder.version,
      assignee: { kind: 'party', partyId },
    });
    if (!parsed.success) {
      setError(contractErrorMessage());
      return;
    }
    if (!begin('assign')) return;

    try {
      const response = await api.post(
        maintenanceWorkOrderAssignPath(selectedOrder.id),
        parsed.data,
        maintenanceWorkOrderResponseSchema,
      );
      assertMaintenanceWorkOrderAssignment(
        selectedOrder,
        partyId,
        response,
      );
      if (local.isMounted()) {
        setSuccess('WorkOrder assigned.');
        onCanonicalWrite();
      }
    } catch (cause) {
      if (local.isMounted()) {
        setError(maintenanceError(cause, 'WorkOrder assignment failed.'));
        onCanonicalWrite();
      }
    } finally {
      finish();
    }
  }

  async function transitionWorkOrder(
    transition: 'start' | 'complete' | 'cancel',
  ) {
    if (!selectedOrder) return;
    const parsed = changeMaintenanceWorkOrderStatusRequestSchema.safeParse({
      expectedVersion: selectedOrder.version,
      action: transition,
    });
    if (!parsed.success || !begin(`work-order-${transition}`)) return;

    try {
      const response = await api.post(
        maintenanceWorkOrderStatusPath(selectedOrder.id),
        parsed.data,
        maintenanceWorkOrderResponseSchema,
      );
      assertMaintenanceWorkOrderTransition(
        selectedOrder,
        transition,
        response,
      );
      if (local.isMounted()) {
        setSuccess(
          `WorkOrder ${transition === 'start' ? 'started' : transition === 'complete' ? 'completed' : 'cancelled'}.`,
        );
        onCanonicalWrite();
      }
    } catch (cause) {
      if (local.isMounted()) {
        setError(
          maintenanceError(
            cause,
            `WorkOrder ${transition} failed.`,
          ),
        );
        onCanonicalWrite();
      }
    } finally {
      finish();
    }
  }

  async function transitionIssue(transition: 'resolve' | 'cancel') {
    const parsed = changeMaintenanceIssueStatusRequestSchema.safeParse({
      expectedVersion: issue.version,
      action: transition,
    });
    if (!parsed.success || !begin(`issue-${transition}`)) return;

    try {
      const response = await api.post(
        maintenanceIssueStatusPath(issue.id),
        parsed.data,
        maintenanceIssueResponseSchema,
      );
      assertMaintenanceIssueTerminal(issue, transition, response);
      if (local.isMounted()) {
        setSuccess(
          `Issue ${transition === 'resolve' ? 'resolved' : 'cancelled'}.`,
        );
        onCanonicalWrite();
      }
    } catch (cause) {
      if (local.isMounted()) {
        setError(
          maintenanceError(
            cause,
            `Issue ${transition} failed.`,
          ),
        );
        onCanonicalWrite();
      }
    } finally {
      finish();
    }
  }

  async function linkExistingServiceEvent(
    eventId: string,
  ): Promise<boolean> {
    if (!selectedEntry || !selectedOrder) return false;
    const parsed = linkMaintenanceServiceEventRequestSchema.safeParse({
      serviceEventId: eventId,
    });
    if (!parsed.success) return false;

    const link = await api.post(
      maintenanceWorkOrderServiceEventsPath(selectedOrder.id),
      parsed.data,
      maintenanceWorkOrderServiceEventLinkResponseSchema,
    );
    assertMaintenanceServiceEventLink(
      selectedOrder.id,
      eventId,
      link,
    );
    return true;
  }

  async function submitExistingServiceLink(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    if (!selectedOrder) return;
    const form = new FormData(event.currentTarget);
    const eventId = requiredString(form, 'serviceEventId');
    if (!eventId || !begin('service-link')) return;

    try {
      await linkExistingServiceEvent(eventId);
      if (local.isMounted()) {
        setSuccess('ServiceEvent linked to WorkOrder.');
        onCanonicalWrite();
      }
    } catch (cause) {
      if (local.isMounted()) {
        setError(
          maintenanceError(
            cause,
            'ServiceEvent link could not be completed.',
          ),
        );
        onCanonicalWrite();
      }
    } finally {
      finish();
    }
  }

  async function recordAndLinkService(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    if (!selectedOrder || !issue.assetId) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const performedAt = utcInstant(
      requiredString(form, 'performedDate'),
      requiredString(form, 'performedTime'),
    );
    const expected = {
      eventType: requiredString(form, 'eventType') as ServiceEventType,
      performedAt: performedAt ?? '',
      providerPartyId: requiredString(form, 'providerPartyId') || null,
      description: requiredString(form, 'description'),
      reference: nullableString(form, 'reference'),
    };
    const parsed = recordServiceEventRequestSchema.safeParse(expected);
    if (!parsed.success) {
      setError(contractErrorMessage());
      return;
    }
    if (!begin('service-create-link')) return;

    let created: ServiceEventResponse | null = null;
    try {
      created = await api.post(
        assetServiceEventsPath(issue.assetId),
        parsed.data,
        serviceEventResponseSchema,
      );
      assertCreatedServiceEvent(issue.assetId, expected, created);

      try {
        await linkExistingServiceEvent(created.id);
        if (local.isMounted()) {
          formElement.reset();
          setSuccess('ServiceEvent recorded and linked to WorkOrder.');
          onCanonicalWrite();
        }
      } catch (linkCause) {
        if (local.isMounted()) {
          setError(
            maintenanceError(
              linkCause,
              'ServiceEvent was recorded, but its WorkOrder link was not confirmed. The canonical event remains available for retry.',
            ),
          );
          onCanonicalWrite();
        }
      }
    } catch (cause) {
      if (local.isMounted()) {
        setError(
          maintenanceError(
            cause,
            'ServiceEvent creation outcome could not be confirmed. Canonical Asset service history was reloaded; if the event appears below, link it instead of recording it again.',
          ),
        );
        onCanonicalWrite();
      }
    } finally {
      finish();
    }
  }

  const allTerminal = workOrders.every(({ workOrder }) =>
    workOrder.status === 'completed' || workOrder.status === 'cancelled',
  );
  const anyCompleted = workOrders.some(
    ({ workOrder }) => workOrder.status === 'completed',
  );
  const allCancelled = workOrders.every(
    ({ workOrder }) => workOrder.status === 'cancelled',
  );
  const canResolve =
    issue.status === 'open' && allTerminal && anyCompleted;
  const canCancelIssue =
    issue.status === 'open' && allCancelled;

  const linkedEventIds = new Set(
    workOrders.flatMap((entry) => entry.serviceEventIds),
  );
  const selectedLinked = new Set(selectedEntry?.serviceEventIds ?? []);
  const linkableEvents = selectedOrder
    ? serviceEvents.filter((serviceEvent) => {
        if (linkedEventIds.has(serviceEvent.id)) return false;
        if (selectedOrder.startedAt === null) return false;
        if (
          Date.parse(serviceEvent.performedAt) <
          Date.parse(selectedOrder.startedAt)
        ) {
          return false;
        }
        if (
          selectedOrder.completedAt !== null &&
          Date.parse(serviceEvent.performedAt) >
            Date.parse(selectedOrder.completedAt)
        ) {
          return false;
        }
        return true;
      })
    : [];

  const canCreateService =
    issue.assetId !== null &&
    selectedOrder !== null &&
    (selectedOrder.status === 'in_progress' ||
      selectedOrder.status === 'completed');

  return (
    <section className="panel maintenance-admin-panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">
            Selected Issue · v{issue.version}
          </p>
          <h2>{issue.code} · {issue.title}</h2>
        </div>
        <div className="maintenance-status-stack">
          <span className={'status-chip status-' + issue.status}>
            {issue.status}
          </span>
          <span className={'status-chip priority-' + issue.priority}>
            {issue.priority}
          </span>
        </div>
      </div>

      <dl className="detail-list maintenance-scope-grid">
        <div><dt>Property</dt><dd>{issue.propertyId}</dd></div>
        <div><dt>Unit</dt><dd>{issue.unitId}</dd></div>
        <div><dt>Space</dt><dd>{issue.spaceId ?? 'Unit level'}</dd></div>
        <div><dt>Asset</dt><dd>{issue.assetId ?? '—'}</dd></div>
        <div>
          <dt>Inspection Finding</dt>
          <dd>{issue.inspectionFindingId ?? '—'}</dd>
        </div>
        <div><dt>Reported</dt><dd>{formatSwissDateTime(issue.reportedAt)}</dd></div>
      </dl>

      {error ? <p className="setup-form-error" role="alert">{error}</p> : null}
      {success ? (
        <p className="setup-form-success" aria-live="polite">{success}</p>
      ) : null}

      {issue.status === 'open' ? (
        <form
          className="setup-form maintenance-form"
          data-maintenance-form="issue-update"
          onSubmit={updateIssue}
        >
          <div className="tenancy-form-heading">
            <strong>Correct Issue metadata</strong>
            <span>Scope, origin and occurrence provenance stay immutable</span>
          </div>
          <div className="setup-form-grid">
            <label>
              Title
              <input
                defaultValue={issue.title}
                disabled={writeGate.pending}
                name="title"
                required
              />
            </label>
            <label>
              Priority
              <select
                defaultValue={issue.priority}
                disabled={writeGate.pending}
                name="priority"
              >
                {MAINTENANCE_ISSUE_PRIORITIES.map((value) => (
                  <option key={value} value={value}>
                    {formatDetailKey(value)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label>
            Description
            <textarea
              defaultValue={issue.description ?? ''}
              disabled={writeGate.pending}
              name="description"
              rows={3}
            />
          </label>
          <button
            className="button-primary"
            disabled={writeGate.pending}
            type="submit"
          >
            {action === 'issue-update' ? 'Saving…' : 'Save Issue'}
          </button>
        </form>
      ) : null}

      <div className="maintenance-admin-section">
        <div className="legal-documents-heading">
          <div>
            <p className="eyebrow">Operational execution</p>
            <h3>WorkOrders</h3>
          </div>
          <span className="section-note">
            One Issue may require multiple work attempts
          </span>
        </div>

        {issue.status === 'open' ? (
          <form
            className="setup-form maintenance-form"
            data-maintenance-form="create-work-order"
            onSubmit={createWorkOrder}
          >
            <div className="setup-form-grid">
              <label>
                WorkOrder code
                <input
                  disabled={writeGate.pending}
                  name="code"
                  required
                />
              </label>
              <label>
                Title
                <input
                  disabled={writeGate.pending}
                  name="title"
                  required
                />
              </label>
            </div>
            <label>
              Description
              <textarea
                disabled={writeGate.pending}
                name="description"
                rows={2}
              />
            </label>
            <button
              className="button-primary"
              disabled={writeGate.pending}
              type="submit"
            >
              {action === 'work-order-create'
                ? 'Creating…'
                : 'Create WorkOrder'}
            </button>
          </form>
        ) : null}

        {workOrders.length === 0 ? (
          <p className="muted">No WorkOrders yet.</p>
        ) : (
          <div className="maintenance-order-grid">
            {workOrders.map((entry) => (
              <button
                className={
                  'maintenance-order-card ' +
                  (entry.workOrder.id === selectedWorkOrderId
                    ? 'maintenance-order-card-active'
                    : '')
                }
                disabled={writeGate.pending}
                key={entry.workOrder.id}
                onClick={() => onWorkOrderSelected(entry.workOrder.id)}
                type="button"
              >
                <span className="eyebrow">{entry.workOrder.code}</span>
                <strong>{entry.workOrder.title}</strong>
                <span>{entry.workOrder.status}</span>
                <small>{assigneeLabel(entry, parties)}</small>
              </button>
            ))}
          </div>
        )}
      </div>

      {selectedEntry && selectedOrder ? (
        <div className="maintenance-admin-section">
          <div className="section-heading compact-section-heading">
            <div>
              <p className="eyebrow">
                Selected WorkOrder · v{selectedOrder.version}
              </p>
              <h3>{selectedOrder.code} · {selectedOrder.title}</h3>
            </div>
            <span className={'status-chip status-' + selectedOrder.status}>
              {selectedOrder.status}
            </span>
          </div>

          <dl className="detail-list compact-detail-list">
            <div><dt>Assignee</dt><dd>{assigneeLabel(selectedEntry, parties)}</dd></div>
            <div><dt>Created</dt><dd>{formatSwissDateTime(selectedOrder.createdAt)}</dd></div>
            <div><dt>Assigned</dt><dd>{formatSwissDateTime(selectedOrder.assignedAt)}</dd></div>
            <div><dt>Started</dt><dd>{formatSwissDateTime(selectedOrder.startedAt)}</dd></div>
            <div><dt>Completed</dt><dd>{formatSwissDateTime(selectedOrder.completedAt)}</dd></div>
            <div><dt>Cancelled</dt><dd>{selectedOrder.cancelledAt ?? '—'}</dd></div>
          </dl>

          {selectedOrder.status === 'draft' ||
          selectedOrder.status === 'assigned' ? (
            <div className="maintenance-workflow-grid">
              <form
                className="setup-form maintenance-form"
                data-maintenance-form="work-order-update"
                onSubmit={updateWorkOrder}
              >
                <div className="tenancy-form-heading">
                  <strong>Correct task definition</strong>
                  <span>Freezes once work starts</span>
                </div>
                <label>
                  Title
                  <input
                    defaultValue={selectedOrder.title}
                    disabled={writeGate.pending}
                    name="title"
                    required
                  />
                </label>
                <label>
                  Description
                  <textarea
                    defaultValue={selectedOrder.description ?? ''}
                    disabled={writeGate.pending}
                    name="description"
                    rows={2}
                  />
                </label>
                <button
                  className="button-primary"
                  disabled={writeGate.pending}
                  type="submit"
                >
                  {action === 'work-order-update'
                    ? 'Saving…'
                    : 'Save WorkOrder'}
                </button>
              </form>

              <form
                className="setup-form maintenance-form"
                data-maintenance-form="assign"
                onSubmit={assignWorkOrder}
              >
                <div className="tenancy-form-heading">
                  <strong>Assign contractor</strong>
                  <span>Active Party only</span>
                </div>
                <label>
                  Party
                  <select
                    defaultValue={
                      selectedOrder.assignee?.kind === 'party'
                        ? selectedOrder.assignee.partyId
                        : ''
                    }
                    disabled={writeGate.pending}
                    name="partyId"
                    required
                  >
                    <option value="">Select Party…</option>
                    {activeParties.map((party) => (
                      <option key={party.id} value={party.id}>
                        {party.code} · {party.displayName}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className="button-primary"
                  disabled={writeGate.pending}
                  type="submit"
                >
                  {action === 'assign' ? 'Assigning…' : 'Assign WorkOrder'}
                </button>
              </form>
            </div>
          ) : null}

          <div className="maintenance-lifecycle-actions">
            {selectedOrder.status === 'assigned' ? (
              <button
                className="button-primary"
                disabled={writeGate.pending}
                onClick={() => void transitionWorkOrder('start')}
                type="button"
              >
                {action === 'work-order-start'
                  ? 'Starting…'
                  : 'Start WorkOrder'}
              </button>
            ) : null}
            {selectedOrder.status === 'in_progress' ? (
              <button
                className="button-primary"
                disabled={writeGate.pending}
                onClick={() => void transitionWorkOrder('complete')}
                type="button"
              >
                {action === 'work-order-complete'
                  ? 'Completing…'
                  : 'Complete WorkOrder'}
              </button>
            ) : null}
            {['draft', 'assigned', 'in_progress'].includes(
              selectedOrder.status,
            ) ? (
              <button
                className="button-secondary"
                disabled={
                  writeGate.pending || selectedEntry.serviceEventIds.length > 0
                }
                onClick={() => void transitionWorkOrder('cancel')}
                type="button"
              >
                {action === 'work-order-cancel'
                  ? 'Cancelling…'
                  : 'Cancel WorkOrder'}
              </button>
            ) : null}
          </div>

          {canCreateService ? (
            <div className="maintenance-admin-section">
              <div className="legal-documents-heading">
                <div>
                  <p className="eyebrow">Asset service evidence</p>
                  <h3>ServiceEvents</h3>
                </div>
                <span className="section-note">
                  Asset/Service remains authoritative completed-work truth
                </span>
              </div>

              <form
                className="setup-form maintenance-form"
                data-maintenance-form="record-service"
                onSubmit={recordAndLinkService}
              >
                <div className="setup-form-grid">
                  <label>
                    Event type
                    <select
                      defaultValue={SERVICE_EVENT_TYPES[0]}
                      disabled={writeGate.pending}
                      name="eventType"
                    >
                      {SERVICE_EVENT_TYPES.map((value) => (
                        <option key={value} value={value}>
                          {formatDetailKey(value)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Provider Party
                    <select
                      defaultValue=""
                      disabled={writeGate.pending}
                      name="providerPartyId"
                    >
                      <option value="">No provider</option>
                      {parties.map((party) => (
                        <option key={party.id} value={party.id}>
                          {party.code} · {party.displayName}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Performed date (UTC)
                    <input
                      disabled={writeGate.pending}
                      name="performedDate"
                      required
                      type="date"
                    />
                  </label>
                  <label>
                    Performed time (UTC)
                    <input
                      disabled={writeGate.pending}
                      name="performedTime"
                      required
                      type="time"
                    />
                  </label>
                  <label>
                    Reference
                    <input
                      disabled={writeGate.pending}
                      name="reference"
                    />
                  </label>
                </div>
                <label>
                  Description
                  <textarea
                    disabled={writeGate.pending}
                    name="description"
                    required
                    rows={2}
                  />
                </label>
                <button
                  className="button-primary"
                  disabled={writeGate.pending}
                  type="submit"
                >
                  {action === 'service-create-link'
                    ? 'Recording…'
                    : 'Record + link ServiceEvent'}
                </button>
              </form>

              <form
                className="setup-form maintenance-form"
                data-maintenance-form="link-service"
                onSubmit={submitExistingServiceLink}
              >
                <div className="tenancy-form-heading">
                  <strong>Link existing ServiceEvent</strong>
                  <span>
                    Useful after a partial record→link failure
                  </span>
                </div>
                <label>
                  Compatible unlinked event
                  <select
                    defaultValue=""
                    disabled={
                      writeGate.pending || linkableEvents.length === 0
                    }
                    name="serviceEventId"
                    required
                  >
                    <option value="">Select ServiceEvent…</option>
                    {linkableEvents.map((serviceEvent) => (
                      <option key={serviceEvent.id} value={serviceEvent.id}>
                        {formatSwissDateTime(serviceEvent.performedAt)} ·{' '}
                        {formatDetailKey(serviceEvent.eventType)} ·{' '}
                        {serviceEvent.description}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className="button-secondary"
                  disabled={
                    writeGate.pending || linkableEvents.length === 0
                  }
                  type="submit"
                >
                  {action === 'service-link'
                    ? 'Linking…'
                    : 'Link ServiceEvent'}
                </button>
              </form>

              {serviceEvents.length > 0 ? (
                <div className="maintenance-service-list">
                  {serviceEvents.map((serviceEvent) => (
                    <article
                      className="maintenance-service-card"
                      key={serviceEvent.id}
                    >
                      <div>
                        <strong>
                          {formatDetailKey(serviceEvent.eventType)}
                        </strong>
                        <span>{formatSwissDateTime(serviceEvent.performedAt)}</span>
                      </div>
                      <p>{serviceEvent.description}</p>
                      <small>
                        {selectedLinked.has(serviceEvent.id)
                          ? 'Linked to selected WorkOrder'
                          : linkedEventIds.has(serviceEvent.id)
                            ? 'Linked to another WorkOrder'
                            : 'Unlinked'}
                      </small>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="muted">
                  No ServiceEvents recorded for this Asset yet.
                </p>
              )}
            </div>
          ) : null}
        </div>
      ) : null}

      {issue.status === 'open' ? (
        <div className="maintenance-admin-section maintenance-terminal-actions">
          <div className="tenancy-form-heading">
            <strong>Close Issue lifecycle</strong>
            <span>
              Resolve requires completed work and all WorkOrders terminal;
              cancel requires all WorkOrders cancelled
            </span>
          </div>
          <div className="maintenance-lifecycle-actions">
            <button
              className="button-primary"
              disabled={writeGate.pending || !canResolve}
              onClick={() => void transitionIssue('resolve')}
              type="button"
            >
              {action === 'issue-resolve' ? 'Resolving…' : 'Resolve Issue'}
            </button>
            <button
              className="button-secondary"
              disabled={writeGate.pending || !canCancelIssue}
              onClick={() => void transitionIssue('cancel')}
              type="button"
            >
              {action === 'issue-cancel' ? 'Cancelling…' : 'Cancel Issue'}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export function UnitMaintenance({
  api,
  propertyId,
  unitId,
  asOf,
  issueId,
  workOrderId,
  navigate,
  setNavigationBlocker,
}: UnitMaintenanceProps) {
  const [issues, setIssues] =
    useState<readonly MaintenanceIssueResponse[] | null>(null);
  const [spaces, setSpaces] =
    useState<readonly SpaceResponse[] | null>(null);
  const [assets, setAssets] =
    useState<readonly AssetResponse[] | null>(null);
  const [parties, setParties] =
    useState<readonly PartyResponse[] | null>(null);
  const [findings, setFindings] =
    useState<readonly FindingOption[] | null>(null);
  const [workOrders, setWorkOrders] =
    useState<readonly MaintenanceWorkOrderEntryResponse[] | null>(null);
  const [serviceEvents, setServiceEvents] =
    useState<readonly ServiceEventResponse[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [baseRevision, setBaseRevision] = useState(0);
  const [detailRevision, setDetailRevision] = useState(0);
  const [writePending, setWritePending] = useState(false);
  const writeSubmission = useCreateSubmissionGuard();

  const writeGate: MaintenanceWriteGate = {
    pending: writePending,
    tryStart: () => {
      if (!writeSubmission.tryStart()) return false;
      setNavigationBlocker(() => false);
      setWritePending(true);
      return true;
    },
    finish: () => {
      writeSubmission.finish();
      setNavigationBlocker(null);
      if (writeSubmission.isMounted()) setWritePending(false);
    },
  };

  useEffect(
    () => () => setNavigationBlocker(null),
    [setNavigationBlocker],
  );

  useEffect(() => {
    const controller = new AbortController();
    setIssues(null);
    setSpaces(null);
    setAssets(null);
    setParties(null);
    setFindings(null);
    setLoadError(null);

    void Promise.all([
      api.get(
        unitMaintenanceIssuesPath(unitId),
        maintenanceIssueListResponseSchema,
        { signal: controller.signal },
      ),
      api.get(unitSpacesPath(unitId), spaceListResponseSchema, {
        signal: controller.signal,
      }),
      api.get(unitAssetsPath(unitId), assetListResponseSchema, {
        signal: controller.signal,
      }),
      api.get(partiesPath(), partyListResponseSchema, {
        signal: controller.signal,
      }),
      api.get(unitInspectionsPath(unitId), inspectionListResponseSchema, {
        signal: controller.signal,
      }),
    ])
      .then(
        async ([
          issueResponse,
          spaceResponse,
          assetResponse,
          partyResponse,
          inspectionResponse,
        ]) => {
          if (controller.signal.aborted) return;
          assertUnitMaintenanceIssuesOwner(unitId, issueResponse.items);
          if (
            spaceResponse.items.some((space) => space.unitId !== unitId)
          ) {
            throw new Error(
              'Maintenance workspace contains a Space owned by another Unit.',
            );
          }
          if (
            assetResponse.items.some((asset) => asset.unitId !== unitId)
          ) {
            throw new Error(
              'Maintenance workspace contains an Asset currently owned by another Unit.',
            );
          }

          const bundles = await Promise.all(
            inspectionResponse.items.map((inspection) =>
              api.get(
                inspectionPath(inspection.id),
                inspectionBundleResponseSchema,
                { signal: controller.signal },
              ),
            ),
          );
          if (controller.signal.aborted) return;
          const findingOptions = bundles.flatMap((bundle) => {
            assertInspectionBundleUnitOwner(unitId, bundle);
            return bundle.findings.map((finding) => ({
              inspectionCode: bundle.inspection.code,
              finding,
            }));
          });

          setIssues(issueResponse.items);
          setSpaces(spaceResponse.items);
          setAssets(assetResponse.items);
          setParties(partyResponse.items);
          setFindings(findingOptions);
        },
      )
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setLoadError(
          cause instanceof Error
            ? cause.message
            : 'Maintenance workspace could not be loaded.',
        );
      });

    return () => controller.abort();
  }, [api, baseRevision, unitId]);

  const selectedIssue = useMemo(
    () => issues?.find((issue) => issue.id === issueId) ?? null,
    [issueId, issues],
  );

  useEffect(() => {
    setWorkOrders(null);
    setServiceEvents([]);
    setDetailError(null);
    if (!selectedIssue) return;

    const controller = new AbortController();
    const eventPromise =
      selectedIssue.assetId === null
        ? Promise.resolve({ items: [] as ServiceEventResponse[] })
        : api.get(
            assetServiceEventsPath(selectedIssue.assetId),
            serviceEventListResponseSchema,
            { signal: controller.signal },
          );

    void Promise.all([
      api.get(
        maintenanceIssueWorkOrdersPath(selectedIssue.id),
        maintenanceWorkOrderEntryListResponseSchema,
        { signal: controller.signal },
      ),
      eventPromise,
    ])
      .then(([workOrderResponse, eventResponse]) => {
        if (controller.signal.aborted) return;
        assertMaintenanceIssueOwner(unitId, selectedIssue.id, selectedIssue);
        assertMaintenanceWorkOrdersOwner(
          selectedIssue.id,
          workOrderResponse.items,
        );
        if (selectedIssue.assetId) {
          assertServiceEventsOwner(
            selectedIssue.assetId,
            eventResponse.items,
          );
        }
        setWorkOrders(workOrderResponse.items);
        setServiceEvents(eventResponse.items);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setDetailError(
          cause instanceof Error
            ? cause.message
            : 'Maintenance Issue detail could not be loaded.',
        );
      });

    return () => controller.abort();
  }, [api, detailRevision, selectedIssue, unitId]);

  const selectedWorkOrderEntry = useMemo(
    () =>
      workOrders?.find(
        (entry) => entry.workOrder.id === workOrderId,
      ) ?? null,
    [workOrderId, workOrders],
  );

  const invalidIssueSelection =
    issues !== null && issueId !== undefined && selectedIssue === null;
  const invalidWorkOrderSelection =
    workOrders !== null &&
    workOrderId !== undefined &&
    selectedWorkOrderEntry === null;

  function refreshAll() {
    setBaseRevision((revision) => revision + 1);
    setDetailRevision((revision) => revision + 1);
  }

  function refreshDetail() {
    setDetailRevision((revision) => revision + 1);
    setBaseRevision((revision) => revision + 1);
  }

  const linkedFindingIds = new Set(
    (issues ?? []).flatMap((issue) =>
      issue.inspectionFindingId ? [issue.inspectionFindingId] : [],
    ),
  );

  return (
    <div className="dashboard-stack">
      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Maintenance + Service</p>
            <h2>Operational problem intake</h2>
          </div>
          <span className="section-note">
            Issue ≠ WorkOrder ≠ ServiceEvent
          </span>
        </div>

        {loadError ? (
          <p className="form-error" role="alert">{loadError}</p>
        ) : null}

        {spaces && assets && findings && issues ? (
          <CreateIssueForm
            api={api}
            assets={assets}
            existingIssues={issues}
            findings={findings}
            linkedFindingIds={linkedFindingIds}
            onCreated={(created) => {
              refreshAll();
              navigate(
                unitRoute(propertyId, unitId, asOf, 'maintenance', {
                  maintenanceIssueId: created.id,
                }),
              );
            }}
            onReconcile={refreshAll}
            propertyId={propertyId}
            spaces={spaces}
            unitId={unitId}
            writeGate={writeGate}
          />
        ) : (
          <p className="muted" aria-live="polite">
            Loading Maintenance intake context…
          </p>
        )}
      </section>

      <section className="panel page-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Unit problem register</p>
            <h2>Maintenance Issues</h2>
          </div>
          <span className="section-note">
            Immutable historical scope snapshot
          </span>
        </div>

        {!loadError && issues === null ? (
          <p className="muted" aria-live="polite">
            Loading Issues…
          </p>
        ) : null}
        {issues?.length === 0 ? (
          <p className="muted">No Maintenance Issues in this Unit.</p>
        ) : null}

        {issues && issues.length > 0 ? (
          <div className="maintenance-issue-grid">
            {issues.map((issue) => (
              <WorkspaceLink
                ariaCurrent={issue.id === issueId ? 'page' : undefined}
                className={
                  'maintenance-issue-card ' +
                  (issue.id === issueId
                    ? 'maintenance-issue-card-active'
                    : '')
                }
                key={issue.id}
                navigate={navigate}
                route={unitRoute(
                  propertyId,
                  unitId,
                  asOf,
                  'maintenance',
                  { maintenanceIssueId: issue.id },
                )}
              >
                <div className="record-heading">
                  <div>
                    <span className="eyebrow">{issue.code}</span>
                    <h3>{issue.title}</h3>
                  </div>
                  <span className={'status-chip status-' + issue.status}>
                    {issue.status}
                  </span>
                </div>
                <dl className="detail-list compact-detail-list">
                  <div><dt>Priority</dt><dd>{issue.priority}</dd></div>
                  <div><dt>Reported</dt><dd>{formatSwissDateTime(issue.reportedAt)}</dd></div>
                  <div><dt>Asset</dt><dd>{issue.assetId ?? '—'}</dd></div>
                  <div>
                    <dt>Inspection origin</dt>
                    <dd>{issue.inspectionFindingId ?? '—'}</dd>
                  </div>
                </dl>
              </WorkspaceLink>
            ))}
          </div>
        ) : null}

        {invalidIssueSelection ? (
          <p className="form-error" role="alert">
            The selected Maintenance Issue does not belong to this Unit.
          </p>
        ) : null}
      </section>

      {detailError ? (
        <section className="panel state-panel" role="alert">
          <p className="eyebrow">Maintenance owner failed</p>
          <h2>Issue detail unavailable</h2>
          <p>{detailError}</p>
        </section>
      ) : null}

      {invalidWorkOrderSelection ? (
        <section className="panel state-panel" role="alert">
          <p className="eyebrow">WorkOrder owner failed</p>
          <h2>WorkOrder unavailable</h2>
          <p>
            The selected WorkOrder does not belong to the selected Issue.
          </p>
        </section>
      ) : null}

      {selectedIssue && workOrders && parties ? (
        <IssueAdministration
          api={api}
          issue={selectedIssue}
          key={`${selectedIssue.id}:${selectedIssue.version}:${workOrders
            .map((entry) => `${entry.workOrder.id}:${entry.workOrder.version}:${entry.serviceEventIds.length}`)
            .join('|')}`}
          onCanonicalWrite={refreshDetail}
          onWorkOrderCreated={(workOrder) => {
            refreshDetail();
            navigate(
              unitRoute(propertyId, unitId, asOf, 'maintenance', {
                maintenanceIssueId: selectedIssue.id,
                maintenanceWorkOrderId: workOrder.id,
              }),
            );
          }}
          onWorkOrderSelected={(nextWorkOrderId) =>
            navigate(
              unitRoute(propertyId, unitId, asOf, 'maintenance', {
                maintenanceIssueId: selectedIssue.id,
                maintenanceWorkOrderId: nextWorkOrderId,
              }),
            )
          }
          parties={parties}
          selectedWorkOrderId={workOrderId}
          serviceEvents={serviceEvents}
          workOrders={workOrders}
          writeGate={writeGate}
        />
      ) : null}
    </div>
  );
}
