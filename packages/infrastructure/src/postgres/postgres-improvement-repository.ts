import type postgres from 'postgres';
import type { ImprovementRepository } from '@portfolio/application';
import {
  DomainError,
  asAssetId,
  asDateOnly,
  asImprovementProjectId,
  asPartyId,
  asProjectAssetId,
  asPropertyId,
  asSpaceId,
  asUnitId,
  asUserId,
  asWorkItemId,
  asWorkMaterialId,
  asWorkQuantity,
  asWorkRecordId,
  type ImprovementProject,
  type ImprovementProjectId,
  type ImprovementProjectStatus,
  type ProjectAsset,
  type ProjectAssetAction,
  type PropertyId,
  type UnitId,
  type WorkItem,
  type WorkItemId,
  type WorkItemStatus,
  type WorkMaterial,
  type WorkMaterialUnit,
  type WorkRecord,
} from '@portfolio/domain';

type Sql = ReturnType<typeof postgres>;

interface PgErrorLike {
  code?: string;
  constraint_name?: string;
}

interface ProjectRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  property_id: string;
  unit_id: string | null;
  space_id: string | null;
  planned_start_on: string | Date | null;
  planned_end_on: string | Date | null;
  status: ImprovementProjectStatus;
  planned_at: string | Date | null;
  started_at: string | Date | null;
  completed_at: string | Date | null;
  cancelled_at: string | Date | null;
  version: number;
  created_at: string | Date;
  created_by_user_id: string;
}

interface WorkItemRow {
  id: string;
  project_id: string;
  code: string;
  title: string;
  description: string | null;
  status: WorkItemStatus;
  started_at: string | Date | null;
  completed_at: string | Date | null;
  cancelled_at: string | Date | null;
  version: number;
  created_at: string | Date;
  created_by_user_id: string;
}

interface WorkRecordRow {
  id: string;
  project_id: string;
  work_item_id: string;
  contractor_party_id: string | null;
  performed_at: string | Date;
  description: string;
  reference: string | null;
  recorded_at: string | Date;
  recorded_by_user_id: string;
}

interface WorkMaterialRow {
  id: string;
  work_record_id: string;
  name: string;
  reference: string | null;
  quantity: string | number;
  unit: WorkMaterialUnit;
  notes: string | null;
}

interface ProjectAssetRow {
  id: string;
  work_record_id: string;
  asset_id: string;
  action: ProjectAssetAction;
  notes: string | null;
}

function instant(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

function nullableInstant(value: string | Date | null): string | null {
  return value === null ? null : instant(value);
}

function dateOnly(value: string | Date): ReturnType<typeof asDateOnly> {
  return asDateOnly(
    value instanceof Date ? value.toISOString().slice(0, 10) : value,
  );
}

function nullableDateOnly(
  value: string | Date | null,
): ReturnType<typeof asDateOnly> | null {
  return value === null ? null : dateOnly(value);
}

function numericText(value: string | number): string {
  const raw = String(value);
  if (!raw.includes('.')) return raw;
  const normalized = raw.replace(/0+$/, '').replace(/\.$/, '');
  return normalized || '0';
}

function mapProject(row: ProjectRow): ImprovementProject {
  return {
    id: asImprovementProjectId(row.id),
    code: row.code,
    name: row.name,
    description: row.description,
    propertyId: asPropertyId(row.property_id),
    unitId: row.unit_id === null ? null : asUnitId(row.unit_id),
    spaceId: row.space_id === null ? null : asSpaceId(row.space_id),
    plannedStartOn: nullableDateOnly(row.planned_start_on),
    plannedEndOn: nullableDateOnly(row.planned_end_on),
    status: row.status,
    plannedAt: nullableInstant(row.planned_at),
    startedAt: nullableInstant(row.started_at),
    completedAt: nullableInstant(row.completed_at),
    cancelledAt: nullableInstant(row.cancelled_at),
    version: row.version,
    createdAt: instant(row.created_at),
    createdByUserId: asUserId(row.created_by_user_id),
  };
}

function mapWorkItem(row: WorkItemRow): WorkItem {
  return {
    id: asWorkItemId(row.id),
    projectId: asImprovementProjectId(row.project_id),
    code: row.code,
    title: row.title,
    description: row.description,
    status: row.status,
    startedAt: nullableInstant(row.started_at),
    completedAt: nullableInstant(row.completed_at),
    cancelledAt: nullableInstant(row.cancelled_at),
    version: row.version,
    createdAt: instant(row.created_at),
    createdByUserId: asUserId(row.created_by_user_id),
  };
}

function mapMaterial(row: WorkMaterialRow): WorkMaterial {
  return {
    id: asWorkMaterialId(row.id),
    workRecordId: asWorkRecordId(row.work_record_id),
    name: row.name,
    reference: row.reference,
    quantity: asWorkQuantity(numericText(row.quantity)),
    unit: row.unit,
    notes: row.notes,
  };
}

function mapProjectAsset(row: ProjectAssetRow): ProjectAsset {
  return {
    id: asProjectAssetId(row.id),
    workRecordId: asWorkRecordId(row.work_record_id),
    assetId: asAssetId(row.asset_id),
    action: row.action,
    notes: row.notes,
  };
}

function translate(error: unknown): DomainError | null {
  const pg = error as PgErrorLike;

  if (pg.code === '23505') {
    if (pg.constraint_name === 'improvement_projects_code_uq') {
      return new DomainError(
        'IMPROVEMENT_PROJECT_CODE_ALREADY_EXISTS',
        'ImprovementProject code already exists.',
      );
    }
    if (pg.constraint_name === 'improvement_work_items_code_uq') {
      return new DomainError(
        'WORK_ITEM_CODE_ALREADY_EXISTS',
        'WorkItem code already exists inside ImprovementProject.',
      );
    }
  }

  if (pg.code !== '23514') return null;

  switch (pg.constraint_name) {
    case 'improvement_project_version_step':
      return new DomainError(
        'IMPROVEMENT_PROJECT_VERSION_CONFLICT',
        'ImprovementProject mutation version is invalid.',
      );
    case 'improvement_project_open_work_items':
      return new DomainError(
        'IMPROVEMENT_PROJECT_OPEN_WORK_ITEMS',
        'ImprovementProject cannot complete while WorkItems remain operational.',
      );
    case 'improvement_project_terminal_before_work_record':
      return new DomainError(
        'IMPROVEMENT_PROJECT_TERMINAL_BEFORE_WORK_RECORD',
        'ImprovementProject terminal time cannot predate existing WorkRecord history.',
      );
    case 'improvement_project_completed_before_work_item_terminal':
      return new DomainError(
        'IMPROVEMENT_PROJECT_COMPLETED_BEFORE_WORK_ITEM_TERMINAL',
        'ImprovementProject completion cannot predate a WorkItem terminal timestamp.',
      );
    case 'improvement_project_cancelled_before_work_item_history':
      return new DomainError(
        'IMPROVEMENT_PROJECT_CANCELLED_BEFORE_WORK_ITEM_HISTORY',
        'ImprovementProject cancellation cannot predate existing WorkItem creation/start/completion history.',
      );
    case 'improvement_project_plan_frozen':
      return new DomainError(
        'IMPROVEMENT_PROJECT_PLAN_FROZEN',
        'ImprovementProject plan is frozen after work starts.',
      );
    case 'improvement_project_transition_invalid':
    case 'improvement_project_initial_state':
    case 'improvement_project_lifecycle_timestamp_immutable':
    case 'improvement_project_mixed_mutation_forbidden':
      return new DomainError(
        'IMPROVEMENT_PROJECT_INVALID_TRANSITION',
        'Invalid ImprovementProject mutation.',
      );
    case 'improvement_project_delete_forbidden':
    case 'improvement_project_identity_scope_immutable':
      return new DomainError(
        'IMPROVEMENT_PROJECT_IMMUTABLE',
        'ImprovementProject identity/scope cannot be rewritten.',
      );
    case 'improvement_work_item_terminal_before_work_record':
      return new DomainError(
        'WORK_ITEM_TERMINAL_BEFORE_WORK_RECORD',
        'WorkItem terminal time cannot predate existing WorkRecord history.',
      );
    case 'improvement_work_item_version_step':
      return new DomainError(
        'WORK_ITEM_VERSION_CONFLICT',
        'WorkItem mutation version is invalid.',
      );
    case 'improvement_work_item_plan_frozen':
      return new DomainError(
        'WORK_ITEM_PLAN_FROZEN',
        'WorkItem plan is frozen after work starts.',
      );
    case 'improvement_work_item_project_terminal':
      return new DomainError(
        'WORK_ITEM_PROJECT_TERMINAL',
        'Cannot add WorkItem to terminal ImprovementProject.',
      );
    case 'improvement_work_item_project_not_in_progress':
    case 'improvement_work_item_start_before_project':
      return new DomainError(
        'WORK_ITEM_PROJECT_NOT_IN_PROGRESS',
        'WorkItem lifecycle is incompatible with ImprovementProject lifecycle.',
      );
    case 'improvement_work_item_transition_invalid':
    case 'improvement_work_item_initial_state':
      return new DomainError(
        'WORK_ITEM_INVALID_TRANSITION',
        'Invalid WorkItem lifecycle mutation.',
      );
    case 'improvement_work_item_delete_forbidden':
    case 'improvement_work_item_definition_immutable':
      return new DomainError(
        'WORK_ITEM_IMMUTABLE',
        'WorkItem definition/history cannot be rewritten.',
      );
    case 'improvement_work_record_start_time_missing':
      return new DomainError(
        'WORK_RECORD_START_TIME_MISSING',
        'WorkRecord requires started Project and WorkItem occurrence boundaries.',
      );
    case 'improvement_work_record_before_start_time':
      return new DomainError(
        'WORK_RECORD_BEFORE_START_TIME',
        'WorkRecord cannot occur before Project/WorkItem startedAt.',
      );
    case 'improvement_work_record_after_terminal_time':
      return new DomainError(
        'WORK_RECORD_AFTER_TERMINAL_TIME',
        'WorkRecord cannot occur after WorkItem/Project terminal time.',
      );
    case 'improvement_work_record_initially_unsealed':
    case 'improvement_work_record_must_be_sealed':
    case 'improvement_work_record_delete_forbidden':
    case 'improvement_work_record_immutable':
    case 'improvement_work_record_child_after_seal':
    case 'improvement_work_record_child_immutable':
      return new DomainError(
        'WORK_RECORD_IMMUTABLE',
        'WorkRecord and its evidence are sealed append-only history.',
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

const projectSelect = `
  select
    id, code, name, description, property_id, unit_id, space_id,
    planned_start_on, planned_end_on, status, planned_at, started_at,
    completed_at, cancelled_at, version, created_at, created_by_user_id
  from public.improvement_projects
`;

const workItemSelect = `
  select
    id, project_id, code, title, description, status,
    started_at, completed_at, cancelled_at, version,
    created_at, created_by_user_id
  from public.improvement_work_items
`;

const workRecordSelect = `
  select
    id, project_id, work_item_id, contractor_party_id,
    performed_at, description, reference, recorded_at, recorded_by_user_id
  from public.improvement_work_records
  where sealed = true
`;

export class PostgresImprovementRepository implements ImprovementRepository {
  constructor(private readonly sql: Sql) {}

  async getProjectById(
    id: ImprovementProjectId,
  ): Promise<ImprovementProject | null> {
    const rows = await this.sql<ProjectRow[]>`
      ${this.sql.unsafe(projectSelect)}
      where id = ${id}
      limit 1
    `;
    return rows.length === 0 ? null : mapProject(rows[0]!);
  }

  async listProjectsByProperty(
    propertyId: PropertyId,
  ): Promise<readonly ImprovementProject[]> {
    const rows = await this.sql<ProjectRow[]>`
      ${this.sql.unsafe(projectSelect)}
      where property_id = ${propertyId}
      order by created_at, id
    `;
    return rows.map(mapProject);
  }

  async listProjectsByUnit(
    unitId: UnitId,
  ): Promise<readonly ImprovementProject[]> {
    const rows = await this.sql<ProjectRow[]>`
      ${this.sql.unsafe(projectSelect)}
      where unit_id = ${unitId}
      order by created_at, id
    `;
    return rows.map(mapProject);
  }

  async projectCodeExists(code: string): Promise<boolean> {
    const rows = await this.sql<{ exists: boolean }[]>`
      select exists(
        select 1
        from public.improvement_projects
        where lower(btrim(code)) = lower(btrim(${code}))
      ) as exists
    `;
    return rows[0]?.exists ?? false;
  }

  async insertProject(project: ImprovementProject): Promise<void> {
    await translated(() => this.sql`
      insert into public.improvement_projects (
        id, code, name, description, property_id, unit_id, space_id,
        planned_start_on, planned_end_on, status, planned_at, started_at,
        completed_at, cancelled_at, version, created_at, created_by_user_id
      ) values (
        ${project.id}, ${project.code}, ${project.name},
        ${project.description}, ${project.propertyId}, ${project.unitId},
        ${project.spaceId}, ${project.plannedStartOn},
        ${project.plannedEndOn}, ${project.status}, ${project.plannedAt},
        ${project.startedAt}, ${project.completedAt}, ${project.cancelledAt},
        ${project.version}, ${project.createdAt}, ${project.createdByUserId}
      )
    `);
  }

  async updateProjectPlan(
    project: ImprovementProject,
    expectedVersion: number,
  ): Promise<void> {
    const rows = await translated(() => this.sql<{ id: string }[]>`
      update public.improvement_projects
      set name = ${project.name},
          description = ${project.description},
          planned_start_on = ${project.plannedStartOn},
          planned_end_on = ${project.plannedEndOn},
          version = ${project.version}
      where id = ${project.id}
        and version = ${expectedVersion}
      returning id
    `);
    if (rows.length === 0) {
      throw new DomainError(
        'IMPROVEMENT_PROJECT_VERSION_CONFLICT',
        'ImprovementProject changed before the update completed.',
      );
    }
  }

  async updateProjectLifecycle(
    project: ImprovementProject,
    expectedVersion: number,
  ): Promise<void> {
    const rows = await translated(() => this.sql<{ id: string }[]>`
      update public.improvement_projects
      set status = ${project.status},
          planned_at = ${project.plannedAt},
          started_at = ${project.startedAt},
          completed_at = ${project.completedAt},
          cancelled_at = ${project.cancelledAt},
          version = ${project.version}
      where id = ${project.id}
        and version = ${expectedVersion}
      returning id
    `);
    if (rows.length === 0) {
      throw new DomainError(
        'IMPROVEMENT_PROJECT_VERSION_CONFLICT',
        'ImprovementProject changed before the lifecycle transition completed.',
      );
    }
  }

  async getWorkItemById(id: WorkItemId): Promise<WorkItem | null> {
    const rows = await this.sql<WorkItemRow[]>`
      ${this.sql.unsafe(workItemSelect)}
      where id = ${id}
      limit 1
    `;
    return rows.length === 0 ? null : mapWorkItem(rows[0]!);
  }

  async listWorkItemsByProject(
    projectId: ImprovementProjectId,
  ): Promise<readonly WorkItem[]> {
    const rows = await this.sql<WorkItemRow[]>`
      ${this.sql.unsafe(workItemSelect)}
      where project_id = ${projectId}
      order by created_at, id
    `;
    return rows.map(mapWorkItem);
  }

  async workItemCodeExists(
    projectId: ImprovementProjectId,
    code: string,
  ): Promise<boolean> {
    const rows = await this.sql<{ exists: boolean }[]>`
      select exists(
        select 1
        from public.improvement_work_items
        where project_id = ${projectId}
          and lower(btrim(code)) = lower(btrim(${code}))
      ) as exists
    `;
    return rows[0]?.exists ?? false;
  }

  async insertWorkItem(item: WorkItem): Promise<void> {
    await translated(() => this.sql`
      insert into public.improvement_work_items (
        id, project_id, code, title, description, status,
        started_at, completed_at, cancelled_at, version,
        created_at, created_by_user_id
      ) values (
        ${item.id}, ${item.projectId}, ${item.code}, ${item.title},
        ${item.description}, ${item.status}, ${item.startedAt},
        ${item.completedAt}, ${item.cancelledAt}, ${item.version},
        ${item.createdAt}, ${item.createdByUserId}
      )
    `);
  }

  async updateWorkItemPlan(
    item: WorkItem,
    expectedVersion: number,
  ): Promise<void> {
    const rows = await translated(() => this.sql<{ id: string }[]>`
      update public.improvement_work_items
      set title = ${item.title},
          description = ${item.description},
          version = ${item.version}
      where id = ${item.id}
        and version = ${expectedVersion}
      returning id
    `);
    if (rows.length === 0) {
      throw new DomainError(
        'WORK_ITEM_VERSION_CONFLICT',
        'WorkItem changed before the plan correction completed.',
      );
    }
  }

  async updateWorkItemLifecycle(
    item: WorkItem,
    expectedVersion: number,
  ): Promise<void> {
    const rows = await translated(() => this.sql<{ id: string }[]>`
      update public.improvement_work_items
      set status = ${item.status},
          started_at = ${item.startedAt},
          completed_at = ${item.completedAt},
          cancelled_at = ${item.cancelledAt},
          version = ${item.version}
      where id = ${item.id}
        and version = ${expectedVersion}
      returning id
    `);
    if (rows.length === 0) {
      throw new DomainError(
        'WORK_ITEM_VERSION_CONFLICT',
        'WorkItem changed before the lifecycle transition completed.',
      );
    }
  }

  private async materialsFor(
    workRecordId: ReturnType<typeof asWorkRecordId>,
  ): Promise<readonly WorkMaterial[]> {
    const rows = await this.sql<WorkMaterialRow[]>`
      select
        id, work_record_id, name, reference, quantity, unit, notes
      from public.improvement_work_materials
      where work_record_id = ${workRecordId}
      order by id
    `;
    return rows.map(mapMaterial);
  }

  private async assetsFor(
    workRecordId: ReturnType<typeof asWorkRecordId>,
  ): Promise<readonly ProjectAsset[]> {
    const rows = await this.sql<ProjectAssetRow[]>`
      select id, work_record_id, asset_id, action, notes
      from public.improvement_project_assets
      where work_record_id = ${workRecordId}
      order by id
    `;
    return rows.map(mapProjectAsset);
  }

  private async mapWorkRecord(row: WorkRecordRow): Promise<WorkRecord> {
    const id = asWorkRecordId(row.id);
    const [materials, assets] = await Promise.all([
      this.materialsFor(id),
      this.assetsFor(id),
    ]);
    return {
      id,
      projectId: asImprovementProjectId(row.project_id),
      workItemId: asWorkItemId(row.work_item_id),
      contractorPartyId:
        row.contractor_party_id === null
          ? null
          : asPartyId(row.contractor_party_id),
      performedAt: instant(row.performed_at),
      description: row.description,
      reference: row.reference,
      materials,
      assets,
      recordedAt: instant(row.recorded_at),
      recordedByUserId: asUserId(row.recorded_by_user_id),
    };
  }

  async listWorkRecordsByProject(
    projectId: ImprovementProjectId,
  ): Promise<readonly WorkRecord[]> {
    const rows = await this.sql<WorkRecordRow[]>`
      ${this.sql.unsafe(workRecordSelect)}
        and project_id = ${projectId}
      order by performed_at, id
    `;
    return Promise.all(rows.map((row) => this.mapWorkRecord(row)));
  }

  async listWorkRecordsByItem(
    workItemId: WorkItemId,
  ): Promise<readonly WorkRecord[]> {
    const rows = await this.sql<WorkRecordRow[]>`
      ${this.sql.unsafe(workRecordSelect)}
        and work_item_id = ${workItemId}
      order by performed_at, id
    `;
    return Promise.all(rows.map((row) => this.mapWorkRecord(row)));
  }

  async insertWorkRecord(record: WorkRecord): Promise<void> {
    await translated(async () => {
      await this.sql.begin(async (tx) => {
        await tx`
          insert into public.improvement_work_records (
            id, project_id, work_item_id, contractor_party_id,
            performed_at, description, reference,
            recorded_at, recorded_by_user_id, sealed
          ) values (
            ${record.id}, ${record.projectId}, ${record.workItemId},
            ${record.contractorPartyId}, ${record.performedAt},
            ${record.description}, ${record.reference}, ${record.recordedAt},
            ${record.recordedByUserId}, false
          )
        `;

        for (const material of record.materials) {
          await tx`
            insert into public.improvement_work_materials (
              id, work_record_id, name, reference, quantity, unit, notes
            ) values (
              ${material.id}, ${material.workRecordId}, ${material.name},
              ${material.reference}, ${material.quantity}, ${material.unit},
              ${material.notes}
            )
          `;
        }

        for (const asset of record.assets) {
          await tx`
            insert into public.improvement_project_assets (
              id, work_record_id, asset_id, action, notes
            ) values (
              ${asset.id}, ${asset.workRecordId}, ${asset.assetId},
              ${asset.action}, ${asset.notes}
            )
          `;
        }

        const sealed = await tx<{ id: string }[]>`
          update public.improvement_work_records
          set sealed = true
          where id = ${record.id}
            and sealed = false
          returning id
        `;
        if (sealed.length === 0) {
          throw new DomainError(
            'WORK_RECORD_SEAL_CONFLICT',
            'WorkRecord could not be sealed atomically.',
          );
        }
      });
    });
  }
}
