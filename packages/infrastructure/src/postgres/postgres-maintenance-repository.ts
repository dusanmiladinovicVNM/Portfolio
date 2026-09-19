import type postgres from 'postgres';
import type { MaintenanceRepository } from '@portfolio/application';
import {
  DomainError,
  asAssetId,
  asInspectionFindingId,
  asMaintenanceIssueId,
  asMaintenanceWorkOrderId,
  asPartyId,
  asPropertyId,
  asServiceEventId,
  asSpaceId,
  asUnitId,
  asUserId,
  type MaintenanceIssue,
  type MaintenanceIssueId,
  type MaintenanceIssuePriority,
  type MaintenanceIssueStatus,
  type MaintenanceWorkOrder,
  type MaintenanceWorkOrderId,
  type MaintenanceWorkOrderServiceEventLink,
  type MaintenanceWorkOrderStatus,
  type PropertyId,
  type ServiceEventId,
  type UnitId,
  type AssetId,
} from '@portfolio/domain';

type Sql = ReturnType<typeof postgres>;

interface PgErrorLike {
  code?: string;
  constraint_name?: string;
}

interface IssueRow {
  id: string;
  code: string;
  property_id: string;
  unit_id: string | null;
  space_id: string | null;
  asset_id: string | null;
  inspection_finding_id: string | null;
  title: string;
  description: string | null;
  priority: MaintenanceIssuePriority;
  status: MaintenanceIssueStatus;
  reported_at: string | Date;
  resolved_at: string | Date | null;
  cancelled_at: string | Date | null;
  version: number;
  recorded_at: string | Date;
  recorded_by_user_id: string;
}

interface WorkOrderRow {
  id: string;
  issue_id: string;
  code: string;
  title: string;
  description: string | null;
  assignee_kind: 'user' | 'party' | null;
  assigned_user_id: string | null;
  assigned_party_id: string | null;
  status: MaintenanceWorkOrderStatus;
  assigned_at: string | Date | null;
  started_at: string | Date | null;
  completed_at: string | Date | null;
  cancelled_at: string | Date | null;
  version: number;
  created_at: string | Date;
  created_by_user_id: string;
}

function instant(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function nullableInstant(value: string | Date | null): string | null {
  return value === null ? null : instant(value);
}

function mapIssue(row: IssueRow): MaintenanceIssue {
  return {
    id: asMaintenanceIssueId(row.id),
    code: row.code,
    propertyId: asPropertyId(row.property_id),
    unitId: row.unit_id === null ? null : asUnitId(row.unit_id),
    spaceId: row.space_id === null ? null : asSpaceId(row.space_id),
    assetId: row.asset_id === null ? null : asAssetId(row.asset_id),
    inspectionFindingId:
      row.inspection_finding_id === null
        ? null
        : asInspectionFindingId(row.inspection_finding_id),
    title: row.title,
    description: row.description,
    priority: row.priority,
    status: row.status,
    reportedAt: instant(row.reported_at),
    resolvedAt: nullableInstant(row.resolved_at),
    cancelledAt: nullableInstant(row.cancelled_at),
    version: row.version,
    recordedAt: instant(row.recorded_at),
    recordedByUserId: asUserId(row.recorded_by_user_id),
  };
}

function mapWorkOrder(row: WorkOrderRow): MaintenanceWorkOrder {
  const assignee =
    row.assignee_kind === 'user'
      ? { kind: 'user' as const, userId: asUserId(row.assigned_user_id!) }
      : row.assignee_kind === 'party'
        ? { kind: 'party' as const, partyId: asPartyId(row.assigned_party_id!) }
        : null;

  return {
    id: asMaintenanceWorkOrderId(row.id),
    issueId: asMaintenanceIssueId(row.issue_id),
    code: row.code,
    title: row.title,
    description: row.description,
    assignee,
    status: row.status,
    assignedAt: nullableInstant(row.assigned_at),
    startedAt: nullableInstant(row.started_at),
    completedAt: nullableInstant(row.completed_at),
    cancelledAt: nullableInstant(row.cancelled_at),
    version: row.version,
    createdAt: instant(row.created_at),
    createdByUserId: asUserId(row.created_by_user_id),
  };
}

function translate(error: unknown): DomainError | null {
  const pg = error as PgErrorLike;

  if (pg.code === '23505') {
    switch (pg.constraint_name) {
      case 'maintenance_issues_code_uq':
        return new DomainError(
          'MAINTENANCE_ISSUE_ALREADY_EXISTS',
          'Maintenance Issue code already exists.',
        );
      case 'maintenance_issues_finding_uq':
        return new DomainError(
          'MAINTENANCE_FINDING_ALREADY_LINKED',
          'Inspection Finding already originated a Maintenance Issue.',
        );
      case 'maintenance_work_orders_code_uq':
        return new DomainError(
          'MAINTENANCE_WORK_ORDER_ALREADY_EXISTS',
          'Maintenance WorkOrder code already exists.',
        );
      case 'maintenance_service_event_once_uq':
        return new DomainError(
          'MAINTENANCE_SERVICE_EVENT_ALREADY_LINKED',
          'ServiceEvent is already linked to another Maintenance WorkOrder.',
        );
      default:
        return null;
    }
  }

  if (pg.code !== '23514') return null;

  switch (pg.constraint_name) {
    case 'maintenance_issue_asset_location_missing':
      return new DomainError(
        'MAINTENANCE_ASSET_LOCATION_NOT_FOUND',
        'Asset has no managed location at Maintenance Issue reportedAt.',
      );
    case 'maintenance_issue_asset_scope_mismatch':
      return new DomainError(
        'MAINTENANCE_ASSET_SCOPE_MISMATCH',
        'Maintenance Issue scope must match the Asset placement at reportedAt.',
      );
    case 'maintenance_issue_finding_scope_mismatch':
      return new DomainError(
        'MAINTENANCE_FINDING_SCOPE_MISMATCH',
        'Inspection Finding must belong to the Maintenance Issue Unit.',
      );
    case 'maintenance_issue_finding_temporal_invalid':
      return new DomainError(
        'MAINTENANCE_FINDING_REPORTED_BEFORE_ORIGIN',
        'Maintenance Issue reportedAt cannot predate its originating Inspection Finding.',
      );
    case 'maintenance_issue_initial_state':
    case 'maintenance_issue_invalid_transition':
    case 'maintenance_issue_transition_mutation':
      return new DomainError(
        'MAINTENANCE_ISSUE_INVALID_TRANSITION',
        'Maintenance Issue transition is invalid.',
      );
    case 'maintenance_issue_immutable':
    case 'maintenance_issue_terminal':
      return new DomainError(
        'MAINTENANCE_ISSUE_TERMINAL',
        'Maintenance Issue history cannot be changed in this state.',
      );
    case 'maintenance_issue_completed_work_required':
      return new DomainError(
        'MAINTENANCE_ISSUE_COMPLETED_WORK_REQUIRED',
        'Resolving a Maintenance Issue requires completed work.',
      );
    case 'maintenance_issue_open_work_orders':
      return new DomainError(
        'MAINTENANCE_ISSUE_OPEN_WORK_ORDERS',
        'All WorkOrders must be terminal before resolving the Issue.',
      );
    case 'maintenance_issue_non_cancelled_work_orders':
      return new DomainError(
        'MAINTENANCE_ISSUE_NON_CANCELLED_WORK_ORDERS',
        'Every WorkOrder must be cancelled before cancelling the Issue.',
      );
    case 'maintenance_issue_terminal_time_invalid':
      return new DomainError(
        'MAINTENANCE_TIMESTAMP_ORDER_INVALID',
        'Maintenance Issue terminal timestamp is invalid.',
      );
    case 'maintenance_work_order_parent_terminal':
      return new DomainError(
        'MAINTENANCE_ISSUE_TERMINAL',
        'Maintenance WorkOrder requires an open Issue.',
      );
    case 'maintenance_work_order_initial_state':
    case 'maintenance_work_order_invalid_transition':
    case 'maintenance_work_order_transition_mutation':
      return new DomainError(
        'MAINTENANCE_WORK_ORDER_INVALID_TRANSITION',
        'Maintenance WorkOrder transition is invalid.',
      );
    case 'maintenance_work_order_immutable':
    case 'maintenance_work_order_definition_frozen':
    case 'maintenance_work_order_terminal':
      return new DomainError(
        'MAINTENANCE_WORK_ORDER_DEFINITION_FROZEN',
        'Maintenance WorkOrder cannot be changed in this state.',
      );
    case 'maintenance_work_order_before_issue_recorded':
      return new DomainError(
        'MAINTENANCE_TIMESTAMP_ORDER_INVALID',
        'WorkOrder createdAt cannot predate its parent Issue recordedAt.',
      );
    case 'maintenance_work_order_assignment_time_order':
      return new DomainError(
        'MAINTENANCE_TIMESTAMP_ORDER_INVALID',
        'WorkOrder reassignment cannot move backwards in time.',
      );
    case 'maintenance_work_order_assignee_inactive':
      return new DomainError(
        'MAINTENANCE_ASSIGNEE_NOT_ACTIVE',
        'Maintenance assignee must be active when assigned.',
      );
    case 'maintenance_work_order_has_service_events':
      return new DomainError(
        'MAINTENANCE_WORK_ORDER_HAS_SERVICE_EVENTS',
        'A WorkOrder with linked ServiceEvents cannot be cancelled.',
      );
    case 'maintenance_work_order_completion_before_service':
      return new DomainError(
        'MAINTENANCE_WORK_ORDER_COMPLETION_BEFORE_SERVICE',
        'WorkOrder completion cannot predate linked ServiceEvent work.',
      );
    case 'maintenance_service_event_work_order_state_invalid':
      return new DomainError(
        'MAINTENANCE_SERVICE_EVENT_WORK_ORDER_STATE_INVALID',
        'ServiceEvent link requires an in-progress or completed WorkOrder.',
      );
    case 'maintenance_service_event_asset_required':
      return new DomainError(
        'MAINTENANCE_SERVICE_EVENT_ASSET_REQUIRED',
        'ServiceEvent link requires an Asset-scoped Issue.',
      );
    case 'maintenance_service_event_asset_mismatch':
      return new DomainError(
        'MAINTENANCE_SERVICE_EVENT_ASSET_MISMATCH',
        'ServiceEvent Asset must match the Maintenance Issue Asset.',
      );
    case 'maintenance_service_event_before_work_order':
      return new DomainError(
        'MAINTENANCE_SERVICE_EVENT_BEFORE_WORK_ORDER',
        'ServiceEvent cannot predate WorkOrder start.',
      );
    case 'maintenance_service_event_after_work_order':
      return new DomainError(
        'MAINTENANCE_SERVICE_EVENT_AFTER_WORK_ORDER',
        'ServiceEvent cannot occur after WorkOrder completion.',
      );
    case 'maintenance_service_event_link_time_invalid':
      return new DomainError(
        'MAINTENANCE_TIMESTAMP_ORDER_INVALID',
        'Maintenance ServiceEvent link recording time is invalid.',
      );
    case 'maintenance_service_event_link_immutable':
      return new DomainError(
        'MAINTENANCE_SERVICE_EVENT_LINK_IMMUTABLE',
        'Maintenance ServiceEvent links are append-only.',
      );
    default:
      return null;
  }
}

async function translated<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    const mapped = translate(error);
    if (mapped) throw mapped;
    throw error;
  }
}

const issueSelect = `
  select
    id, code, property_id, unit_id, space_id, asset_id,
    inspection_finding_id, title, description, priority, status,
    reported_at, resolved_at, cancelled_at, version,
    recorded_at, recorded_by_user_id
  from public.maintenance_issues
`;

const workOrderSelect = `
  select
    id, issue_id, code, title, description,
    assignee_kind, assigned_user_id, assigned_party_id,
    status, assigned_at, started_at, completed_at, cancelled_at,
    version, created_at, created_by_user_id
  from public.maintenance_work_orders
`;

export class PostgresMaintenanceRepository implements MaintenanceRepository {
  constructor(private readonly sql: Sql) {}

  async getIssueById(id: MaintenanceIssueId): Promise<MaintenanceIssue | null> {
    const rows = await this.sql<IssueRow[]>`
      ${this.sql.unsafe(issueSelect)}
      where id = ${id}
      limit 1
    `;
    return rows.length === 0 ? null : mapIssue(rows[0]!);
  }

  async getIssueByInspectionFindingId(
    findingId: import('@portfolio/domain').InspectionFindingId,
  ): Promise<MaintenanceIssue | null> {
    const rows = await this.sql<IssueRow[]>`
      ${this.sql.unsafe(issueSelect)}
      where inspection_finding_id = ${findingId}
      limit 1
    `;
    return rows.length === 0 ? null : mapIssue(rows[0]!);
  }

  async listIssuesByProperty(
    propertyId: PropertyId,
  ): Promise<readonly MaintenanceIssue[]> {
    const rows = await this.sql<IssueRow[]>`
      ${this.sql.unsafe(issueSelect)}
      where property_id = ${propertyId}
      order by reported_at desc, id
    `;
    return rows.map(mapIssue);
  }

  async listIssuesByUnit(unitId: UnitId): Promise<readonly MaintenanceIssue[]> {
    const rows = await this.sql<IssueRow[]>`
      ${this.sql.unsafe(issueSelect)}
      where unit_id = ${unitId}
      order by reported_at desc, id
    `;
    return rows.map(mapIssue);
  }

  async listIssuesByAsset(assetId: AssetId): Promise<readonly MaintenanceIssue[]> {
    const rows = await this.sql<IssueRow[]>`
      ${this.sql.unsafe(issueSelect)}
      where asset_id = ${assetId}
      order by reported_at desc, id
    `;
    return rows.map(mapIssue);
  }

  async issueCodeExists(code: string): Promise<boolean> {
    const rows = await this.sql<{ exists: boolean }[]>`
      select exists(
        select 1
        from public.maintenance_issues
        where lower(btrim(code)) = lower(btrim(${code}))
      ) as exists
    `;
    return rows[0]?.exists ?? false;
  }

  async insertIssue(issue: MaintenanceIssue): Promise<void> {
    await translated(async () => {
      await this.sql`
        insert into public.maintenance_issues (
          id, code, property_id, unit_id, space_id, asset_id,
          inspection_finding_id, title, description, priority, status,
          reported_at, resolved_at, cancelled_at, version,
          recorded_at, recorded_by_user_id
        ) values (
          ${issue.id}, ${issue.code}, ${issue.propertyId}, ${issue.unitId},
          ${issue.spaceId}, ${issue.assetId}, ${issue.inspectionFindingId},
          ${issue.title}, ${issue.description}, ${issue.priority}, ${issue.status},
          ${issue.reportedAt}, ${issue.resolvedAt}, ${issue.cancelledAt},
          ${issue.version}, ${issue.recordedAt}, ${issue.recordedByUserId}
        )
      `;
    });
  }

  async updateIssue(
    issue: MaintenanceIssue,
    expectedVersion: number,
  ): Promise<void> {
    await translated(async () => {
      const rows = await this.sql<{ id: string }[]>`
        update public.maintenance_issues
        set
          title = ${issue.title},
          description = ${issue.description},
          priority = ${issue.priority},
          status = ${issue.status},
          resolved_at = ${issue.resolvedAt},
          cancelled_at = ${issue.cancelledAt},
          version = ${issue.version}
        where id = ${issue.id}
          and version = ${expectedVersion}
        returning id
      `;
      if (rows.length === 0) {
        throw new DomainError(
          'MAINTENANCE_ISSUE_VERSION_CONFLICT',
          'Maintenance Issue was modified concurrently.',
        );
      }
    });
  }

  async getWorkOrderById(
    id: MaintenanceWorkOrderId,
  ): Promise<MaintenanceWorkOrder | null> {
    const rows = await this.sql<WorkOrderRow[]>`
      ${this.sql.unsafe(workOrderSelect)}
      where id = ${id}
      limit 1
    `;
    return rows.length === 0 ? null : mapWorkOrder(rows[0]!);
  }

  async listWorkOrdersByIssue(
    issueId: MaintenanceIssueId,
  ): Promise<readonly MaintenanceWorkOrder[]> {
    const rows = await this.sql<WorkOrderRow[]>`
      ${this.sql.unsafe(workOrderSelect)}
      where issue_id = ${issueId}
      order by created_at, id
    `;
    return rows.map(mapWorkOrder);
  }

  async workOrderCodeExists(code: string): Promise<boolean> {
    const rows = await this.sql<{ exists: boolean }[]>`
      select exists(
        select 1
        from public.maintenance_work_orders
        where lower(btrim(code)) = lower(btrim(${code}))
      ) as exists
    `;
    return rows[0]?.exists ?? false;
  }

  async insertWorkOrder(workOrder: MaintenanceWorkOrder): Promise<void> {
    await translated(async () => {
      const assigneeKind = workOrder.assignee?.kind ?? null;
      const assignedUserId =
        workOrder.assignee?.kind === 'user' ? workOrder.assignee.userId : null;
      const assignedPartyId =
        workOrder.assignee?.kind === 'party' ? workOrder.assignee.partyId : null;

      await this.sql`
        insert into public.maintenance_work_orders (
          id, issue_id, code, title, description,
          assignee_kind, assigned_user_id, assigned_party_id,
          status, assigned_at, started_at, completed_at, cancelled_at,
          version, created_at, created_by_user_id
        ) values (
          ${workOrder.id}, ${workOrder.issueId}, ${workOrder.code},
          ${workOrder.title}, ${workOrder.description},
          ${assigneeKind}, ${assignedUserId}, ${assignedPartyId},
          ${workOrder.status}, ${workOrder.assignedAt}, ${workOrder.startedAt},
          ${workOrder.completedAt}, ${workOrder.cancelledAt},
          ${workOrder.version}, ${workOrder.createdAt},
          ${workOrder.createdByUserId}
        )
      `;
    });
  }

  async updateWorkOrder(
    workOrder: MaintenanceWorkOrder,
    expectedVersion: number,
  ): Promise<void> {
    await translated(async () => {
      const assigneeKind = workOrder.assignee?.kind ?? null;
      const assignedUserId =
        workOrder.assignee?.kind === 'user' ? workOrder.assignee.userId : null;
      const assignedPartyId =
        workOrder.assignee?.kind === 'party' ? workOrder.assignee.partyId : null;

      const rows = await this.sql<{ id: string }[]>`
        update public.maintenance_work_orders
        set
          title = ${workOrder.title},
          description = ${workOrder.description},
          assignee_kind = ${assigneeKind},
          assigned_user_id = ${assignedUserId},
          assigned_party_id = ${assignedPartyId},
          status = ${workOrder.status},
          assigned_at = ${workOrder.assignedAt},
          started_at = ${workOrder.startedAt},
          completed_at = ${workOrder.completedAt},
          cancelled_at = ${workOrder.cancelledAt},
          version = ${workOrder.version}
        where id = ${workOrder.id}
          and version = ${expectedVersion}
        returning id
      `;
      if (rows.length === 0) {
        throw new DomainError(
          'MAINTENANCE_WORK_ORDER_VERSION_CONFLICT',
          'Maintenance WorkOrder was modified concurrently.',
        );
      }
    });
  }

  async insertServiceEventLink(
    link: MaintenanceWorkOrderServiceEventLink,
  ): Promise<void> {
    await translated(async () => {
      await this.sql`
        insert into public.maintenance_work_order_service_events (
          work_order_id, service_event_id, linked_at, linked_by_user_id
        ) values (
          ${link.workOrderId}, ${link.serviceEventId},
          ${link.linkedAt}, ${link.linkedByUserId}
        )
      `;
    });
  }

  async listServiceEventIdsByWorkOrder(
    workOrderId: MaintenanceWorkOrderId,
  ): Promise<readonly ServiceEventId[]> {
    const rows = await this.sql<{ service_event_id: string }[]>`
      select service_event_id
      from public.maintenance_work_order_service_events
      where work_order_id = ${workOrderId}
      order by service_event_id
    `;
    return rows.map((row) => asServiceEventId(row.service_event_id));
  }

  async serviceEventIsLinked(serviceEventId: ServiceEventId): Promise<boolean> {
    const rows = await this.sql<{ exists: boolean }[]>`
      select exists(
        select 1
        from public.maintenance_work_order_service_events
        where service_event_id = ${serviceEventId}
      ) as exists
    `;
    return rows[0]?.exists ?? false;
  }
}
