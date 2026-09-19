import type postgres from 'postgres';
import type { AssetInventoryRepository } from '@portfolio/application';
import {
  DomainError,
  asAssetConditionAssessmentId,
  asAssetId,
  asTenancyAssetAssignmentId,
  asTenancyId,
  asUserId,
  type AssetCondition,
  type AssetConditionAssessment,
  type AssetId,
  type TenancyAssetAssignment,
  type TenancyAssetAssignmentId,
  type TenancyAssetPhase,
  type TenancyAssetPresence,
  type TenancyId,
} from '@portfolio/domain';

type Sql = ReturnType<typeof postgres>;

interface PgErrorLike {
  code?: string;
  constraint_name?: string;
}

interface ConditionRow {
  id: string;
  asset_id: string;
  condition: AssetCondition;
  assessed_at: string | Date;
  assessed_by_user_id: string;
  notes: string | null;
}

interface AssignmentRow {
  id: string;
  tenancy_id: string;
  asset_id: string;
  assigned_at: string | Date;
  assigned_by_user_id: string;
  version: number;
  move_in_presence: TenancyAssetPresence | null;
  move_in_condition_assessment_id: string | null;
  move_in_recorded_at: string | Date | null;
  move_in_recorded_by_user_id: string | null;
  move_in_notes: string | null;
  move_out_presence: TenancyAssetPresence | null;
  move_out_condition_assessment_id: string | null;
  move_out_recorded_at: string | Date | null;
  move_out_recorded_by_user_id: string | null;
  move_out_notes: string | null;
}

function instant(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

function nullableInstant(value: string | Date | null): string | null {
  return value === null ? null : instant(value);
}

function mapCondition(row: ConditionRow): AssetConditionAssessment {
  return {
    id: asAssetConditionAssessmentId(row.id),
    assetId: asAssetId(row.asset_id),
    condition: row.condition,
    assessedAt: instant(row.assessed_at),
    assessedByUserId: asUserId(row.assessed_by_user_id),
    notes: row.notes,
  };
}

function mapAssignment(row: AssignmentRow): TenancyAssetAssignment {
  return {
    id: asTenancyAssetAssignmentId(row.id),
    tenancyId: asTenancyId(row.tenancy_id),
    assetId: asAssetId(row.asset_id),
    assignedAt: instant(row.assigned_at),
    assignedByUserId: asUserId(row.assigned_by_user_id),
    version: row.version,
    moveIn:
      row.move_in_presence === null ||
      row.move_in_recorded_at === null ||
      row.move_in_recorded_by_user_id === null
        ? null
        : {
            phase: 'move_in',
            presence: row.move_in_presence,
            conditionAssessmentId:
              row.move_in_condition_assessment_id === null
                ? null
                : asAssetConditionAssessmentId(
                    row.move_in_condition_assessment_id,
                  ),
            recordedAt: instant(row.move_in_recorded_at),
            recordedByUserId: asUserId(row.move_in_recorded_by_user_id),
            notes: row.move_in_notes,
          },
    moveOut:
      row.move_out_presence === null ||
      row.move_out_recorded_at === null ||
      row.move_out_recorded_by_user_id === null
        ? null
        : {
            phase: 'move_out',
            presence: row.move_out_presence,
            conditionAssessmentId:
              row.move_out_condition_assessment_id === null
                ? null
                : asAssetConditionAssessmentId(
                    row.move_out_condition_assessment_id,
                  ),
            recordedAt: instant(row.move_out_recorded_at),
            recordedByUserId: asUserId(row.move_out_recorded_by_user_id),
            notes: row.move_out_notes,
          },
  };
}

function translate(error: unknown): DomainError | null {
  const pg = error as PgErrorLike;

  if (pg.code === '23505') {
    if (
      pg.constraint_name === 'tenancy_asset_assignments_tenancy_asset_uq'
    ) {
      return new DomainError(
        'TENANCY_ASSET_ALREADY_ASSIGNED',
        'Asset is already part of this Tenancy inventory.',
      );
    }
    return null;
  }

  if (pg.code === '23514') {
    switch (pg.constraint_name) {
      case 'asset_condition_assessment_immutable':
        return new DomainError(
          'ASSET_CONDITION_ASSESSMENT_IMMUTABLE',
          'Asset condition assessments are append-only.',
        );
      case 'tenancy_asset_assignment_unit_mismatch':
        return new DomainError(
          'TENANCY_ASSET_UNIT_MISMATCH',
          'Tenancy inventory Asset must belong to the Tenancy Unit.',
        );
      case 'tenancy_asset_assignment_tenancy_cancelled':
        return new DomainError(
          'TENANCY_ASSET_TENANCY_CANCELLED',
          'A cancelled Tenancy cannot receive inventory assignments.',
        );
      case 'tenancy_asset_assignment_asset_status_invalid':
        return new DomainError(
          'TENANCY_ASSET_STATUS_INVALID',
          'A retired or replaced Asset cannot be newly assigned to Tenancy inventory.',
        );
      case 'tenancy_asset_assignment_move_in_immutable':
      case 'tenancy_asset_assignment_move_out_immutable':
        return new DomainError(
          'TENANCY_ASSET_PHASE_ALREADY_RECORDED',
          'Tenancy inventory phase is already recorded.',
        );
      case 'tenancy_asset_assignment_condition_asset_mismatch':
        return new DomainError(
          'TENANCY_ASSET_CONDITION_ASSET_MISMATCH',
          'Inventory condition assessment must belong to the assigned Asset.',
        );
      case 'tenancy_asset_assignment_version_step':
        return new DomainError(
          'TENANCY_ASSET_VERSION_CONFLICT',
          'Tenancy Asset assignment version is invalid.',
        );
      case 'tenancy_asset_assignment_delete_forbidden':
      case 'tenancy_asset_assignment_identity_immutable':
      case 'tenancy_asset_assignment_phase_mutation_invalid':
      case 'tenancy_asset_assignment_initial_state':
        return new DomainError(
          'TENANCY_ASSET_ASSIGNMENT_IMMUTABLE',
          'Tenancy Asset inventory history cannot be rewritten.',
        );
      default:
        return null;
    }
  }

  return null;
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

const assignmentSelect = `
  select
    id, tenancy_id, asset_id, assigned_at, assigned_by_user_id, version,
    move_in_presence, move_in_condition_assessment_id,
    move_in_recorded_at, move_in_recorded_by_user_id, move_in_notes,
    move_out_presence, move_out_condition_assessment_id,
    move_out_recorded_at, move_out_recorded_by_user_id, move_out_notes
  from public.tenancy_asset_assignments
`;

export class PostgresAssetInventoryRepository
  implements AssetInventoryRepository
{
  constructor(private readonly sql: Sql) {}

  async insertConditionAssessment(
    assessment: AssetConditionAssessment,
  ): Promise<void> {
    await translated(() => this.sql`
      insert into public.asset_condition_assessments (
        id, asset_id, condition, assessed_at, assessed_by_user_id, notes
      ) values (
        ${assessment.id}, ${assessment.assetId}, ${assessment.condition},
        ${assessment.assessedAt}, ${assessment.assessedByUserId},
        ${assessment.notes}
      )
    `);
  }

  async listConditionAssessments(
    assetId: AssetId,
  ): Promise<readonly AssetConditionAssessment[]> {
    const rows = await this.sql<ConditionRow[]>`
      select
        id, asset_id, condition, assessed_at,
        assessed_by_user_id, notes
      from public.asset_condition_assessments
      where asset_id = ${assetId}
      order by assessed_at, id
    `;
    return rows.map(mapCondition);
  }

  async getTenancyAssetAssignment(
    id: TenancyAssetAssignmentId,
  ): Promise<TenancyAssetAssignment | null> {
    const rows = await this.sql<AssignmentRow[]>`
      ${this.sql.unsafe(assignmentSelect)}
      where id = ${id}
      limit 1
    `;
    return rows.length === 0 ? null : mapAssignment(rows[0]!);
  }

  async listTenancyAssetAssignments(
    tenancyId: TenancyId,
  ): Promise<readonly TenancyAssetAssignment[]> {
    const rows = await this.sql<AssignmentRow[]>`
      ${this.sql.unsafe(assignmentSelect)}
      where tenancy_id = ${tenancyId}
      order by assigned_at, id
    `;
    return rows.map(mapAssignment);
  }

  async insertTenancyAssetAssignment(
    assignment: TenancyAssetAssignment,
  ): Promise<void> {
    await translated(() => this.sql`
      insert into public.tenancy_asset_assignments (
        id, tenancy_id, asset_id,
        assigned_at, assigned_by_user_id, version
      ) values (
        ${assignment.id}, ${assignment.tenancyId}, ${assignment.assetId},
        ${assignment.assignedAt}, ${assignment.assignedByUserId},
        ${assignment.version}
      )
    `);
  }

  async updateTenancyAssetInventory(
    assignment: TenancyAssetAssignment,
    expectedVersion: number,
    phase: TenancyAssetPhase,
    assessment: AssetConditionAssessment | null,
  ): Promise<void> {
    await translated(async () => {
      await this.sql.begin(async (tx) => {
        if (assessment !== null) {
          await tx`
            insert into public.asset_condition_assessments (
              id, asset_id, condition, assessed_at, assessed_by_user_id, notes
            ) values (
              ${assessment.id}, ${assessment.assetId}, ${assessment.condition},
              ${assessment.assessedAt}, ${assessment.assessedByUserId},
              ${assessment.notes}
            )
          `;
        }

        const snapshot =
          phase === 'move_in' ? assignment.moveIn : assignment.moveOut;
        if (snapshot === null) {
          throw new DomainError(
            'TENANCY_ASSET_INVALID_STATE',
            'Requested inventory phase snapshot is missing.',
          );
        }

        const rows =
          phase === 'move_in'
            ? await tx<{ id: string }[]>`
                update public.tenancy_asset_assignments
                set
                  move_in_presence = ${snapshot.presence},
                  move_in_condition_assessment_id = ${snapshot.conditionAssessmentId},
                  move_in_recorded_at = ${snapshot.recordedAt},
                  move_in_recorded_by_user_id = ${snapshot.recordedByUserId},
                  move_in_notes = ${snapshot.notes},
                  version = ${assignment.version},
                  updated_at = now()
                where id = ${assignment.id}
                  and version = ${expectedVersion}
                returning id
              `
            : await tx<{ id: string }[]>`
                update public.tenancy_asset_assignments
                set
                  move_out_presence = ${snapshot.presence},
                  move_out_condition_assessment_id = ${snapshot.conditionAssessmentId},
                  move_out_recorded_at = ${snapshot.recordedAt},
                  move_out_recorded_by_user_id = ${snapshot.recordedByUserId},
                  move_out_notes = ${snapshot.notes},
                  version = ${assignment.version},
                  updated_at = now()
                where id = ${assignment.id}
                  and version = ${expectedVersion}
                returning id
              `;

        if (rows.length === 0) {
          throw new DomainError(
            'TENANCY_ASSET_VERSION_CONFLICT',
            'Tenancy Asset assignment changed before inventory recording completed.',
          );
        }
      });
    });
  }
}
