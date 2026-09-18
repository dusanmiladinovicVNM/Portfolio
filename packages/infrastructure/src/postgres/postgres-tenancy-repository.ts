import type postgres from 'postgres';
import type { TenancyRepository } from '@portfolio/application';
import {
  DomainError,
  asDateOnly,
  asPartyId,
  asTenancyId,
  asTenancyPartyId,
  asUnitId,
  type DateOnly,
  type Tenancy,
  type TenancyId,
  type TenancyParty,
  type TenancyPartyRole,
  type TenancyStatus,
  type UnitId,
} from '@portfolio/domain';

type Sql = ReturnType<typeof postgres>;

interface PostgresErrorLike {
  code?: string;
  constraint_name?: string;
}

interface TenancyPartyJson {
  id: string;
  tenancyId: string;
  partyId: string;
  role: TenancyPartyRole;
  isPrimary: boolean;
}

interface TenancyRow {
  id: string;
  code: string;
  unit_id: string;
  status: TenancyStatus;
  planned_start: string | Date | null;
  planned_end: string | Date | null;
  actual_start: string | Date | null;
  actual_end: string | Date | null;
  notice_given_at: string | Date | null;
  termination_effective_at: string | Date | null;
  version: number;
  parties: TenancyPartyJson[];
}

const tenancySelect = `
  select
    t.id,
    t.code,
    t.unit_id,
    t.status,
    t.planned_start,
    t.planned_end,
    t.actual_start,
    t.actual_end,
    t.notice_given_at,
    t.termination_effective_at,
    t.version,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', tp.id,
            'tenancyId', tp.tenancy_id,
            'partyId', tp.party_id,
            'role', tp.role,
            'isPrimary', tp.is_primary
          )
          order by tp.created_at, tp.id
        )
        from public.tenancy_parties tp
        where tp.tenancy_id = t.id
      ),
      '[]'::jsonb
    ) as parties
  from public.tenancies t
`;

function dateString(value: string | Date | null): DateOnly | null {
  if (value === null) return null;
  return asDateOnly(value instanceof Date ? value.toISOString().slice(0, 10) : value);
}

function mapTenancy(row: TenancyRow): Tenancy {
  return {
    id: asTenancyId(row.id),
    code: row.code,
    unitId: asUnitId(row.unit_id),
    status: row.status,
    plannedStart: dateString(row.planned_start),
    plannedEnd: dateString(row.planned_end),
    actualStart: dateString(row.actual_start),
    actualEnd: dateString(row.actual_end),
    noticeGivenAt: dateString(row.notice_given_at),
    terminationEffectiveAt: dateString(row.termination_effective_at),
    version: row.version,
    parties: row.parties.map((party) => ({
      id: asTenancyPartyId(party.id),
      tenancyId: asTenancyId(party.tenancyId),
      partyId: asPartyId(party.partyId),
      role: party.role,
      isPrimary: party.isPrimary,
    })),
  };
}

function translateTenancyError(error: unknown): DomainError | null {
  const pg = error as PostgresErrorLike;

  if (pg.code === '23P01') {
    switch (pg.constraint_name) {
      case 'tenancies_unit_planned_period_no_overlap':
        return new DomainError(
          'TENANCY_PLANNED_RESERVATION_OVERLAP',
          'Planned tenancy periods for the same unit cannot overlap.',
        );
      case 'tenancies_unit_actual_period_no_overlap':
        return new DomainError(
          'TENANCY_ACTUAL_OCCUPANCY_OVERLAP',
          'Actual occupancy periods for the same unit cannot overlap.',
        );
      case 'tenancies_planned_against_actual_conflict':
        return new DomainError(
          'TENANCY_PLANNED_OCCUPANCY_CONFLICT',
          'A planned tenancy cannot overlap known actual occupancy.',
        );
      default:
        return null;
    }
  }

  if (
    pg.code === '23514' &&
    pg.constraint_name === 'tenancy_parties_change_state_guard'
  ) {
    return new DomainError(
      'TENANCY_PARTY_CHANGE_NOT_ALLOWED',
      'Parties may only be changed while a tenancy is draft or planned.',
    );
  }

  if (pg.code === '23505') {
    switch (pg.constraint_name) {
      case 'tenancies_code_uq':
        return new DomainError(
          'TENANCY_CODE_ALREADY_EXISTS',
          'Tenancy code already exists.',
        );
      case 'tenancy_parties_tenancy_party_role_uq':
        return new DomainError(
          'TENANCY_PARTY_ALREADY_EXISTS',
          'The same party already has this tenancy role.',
        );
      case 'tenancy_parties_one_primary_occupant_uq':
        return new DomainError(
          'TENANCY_PRIMARY_PARTY_ALREADY_EXISTS',
          'Only one primary tenant/co-tenant is allowed.',
        );
      default:
        return null;
    }
  }

  return null;
}

async function withTranslatedErrors<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    const translated = translateTenancyError(error);
    if (translated) throw translated;
    throw error;
  }
}

export class PostgresTenancyRepository implements TenancyRepository {
  constructor(private readonly sql: Sql) {}

  async getById(id: TenancyId): Promise<Tenancy | null> {
    const rows = await this.sql<TenancyRow[]>`
      ${this.sql.unsafe(tenancySelect)}
      where t.id = ${id}
      limit 1
    `;

    return rows.length === 0 ? null : mapTenancy(rows[0]!);
  }

  async listByUnit(unitId: UnitId): Promise<readonly Tenancy[]> {
    const rows = await this.sql<TenancyRow[]>`
      ${this.sql.unsafe(tenancySelect)}
      where t.unit_id = ${unitId}
      order by
        coalesce(t.actual_start, t.planned_start) nulls last,
        lower(t.code),
        t.id
    `;

    return rows.map(mapTenancy);
  }

  async codeExists(code: string): Promise<boolean> {
    const rows = await this.sql<{ exists: boolean }[]>`
      select exists(
        select 1
        from public.tenancies
        where lower(code) = lower(${code})
      ) as exists
    `;

    return rows[0]?.exists ?? false;
  }

  async hasPlannedReservationOverlap(
    unitId: UnitId,
    validFrom: DateOnly,
    validTo: DateOnly | null,
    excludeTenancyId?: TenancyId,
  ): Promise<boolean> {
    const excludedId = excludeTenancyId ?? null;

    const rows = await this.sql<{ exists: boolean }[]>`
      select exists(
        select 1
        from public.tenancies t
        where t.unit_id = ${unitId}
          and t.status = 'planned'
          and (
            ${excludedId}::uuid is null
            or t.id <> ${excludedId}::uuid
          )
          and daterange(
            t.planned_start,
            case when t.planned_end is null then null else t.planned_end + 1 end,
            '[)'
          ) && daterange(
            ${validFrom}::date,
            case when ${validTo}::date is null then null else ${validTo}::date + 1 end,
            '[)'
          )
      ) as exists
    `;

    return rows[0]?.exists ?? false;
  }

  async hasActualOccupancyOverlap(
    unitId: UnitId,
    validFrom: DateOnly,
    validTo: DateOnly | null,
    excludeTenancyId?: TenancyId,
  ): Promise<boolean> {
    const excludedId = excludeTenancyId ?? null;

    const rows = await this.sql<{ exists: boolean }[]>`
      select exists(
        select 1
        from public.tenancies t
        where t.unit_id = ${unitId}
          and t.status in ('active', 'notice_given', 'move_out_pending', 'ended')
          and (
            ${excludedId}::uuid is null
            or t.id <> ${excludedId}::uuid
          )
          and daterange(
            t.actual_start,
            case
              when t.status in ('notice_given', 'move_out_pending')
                then t.termination_effective_at + 1
              when t.status = 'ended'
                then t.actual_end + 1
              else null
            end,
            '[)'
          ) && daterange(
            ${validFrom}::date,
            case when ${validTo}::date is null then null else ${validTo}::date + 1 end,
            '[)'
          )
      ) as exists
    `;

    return rows[0]?.exists ?? false;
  }

  async insert(tenancy: Tenancy): Promise<void> {
    await withTranslatedErrors(async () => {
      await this.sql.begin(async (tx) => {
        await tx`
          insert into public.tenancies (
            id, code, unit_id, status,
            planned_start, planned_end,
            actual_start, actual_end,
            notice_given_at, termination_effective_at,
            version
          ) values (
            ${tenancy.id}, ${tenancy.code}, ${tenancy.unitId}, ${tenancy.status},
            ${tenancy.plannedStart}, ${tenancy.plannedEnd},
            ${tenancy.actualStart}, ${tenancy.actualEnd},
            ${tenancy.noticeGivenAt}, ${tenancy.terminationEffectiveAt},
            ${tenancy.version}
          )
        `;

        for (const party of tenancy.parties) {
          await tx`
            insert into public.tenancy_parties (
              id, tenancy_id, party_id, role, is_primary
            ) values (
              ${party.id}, ${party.tenancyId}, ${party.partyId},
              ${party.role}, ${party.isPrimary}
            )
          `;
        }
      });
    });
  }

  async insertParty(
    tenancyParty: TenancyParty,
    expectedTenancyVersion: number,
    newTenancyVersion: number,
  ): Promise<void> {
    await withTranslatedErrors(async () => {
      await this.sql.begin(async (tx) => {
        const updated = await tx<{ id: string }[]>`
          update public.tenancies
          set
            version = ${newTenancyVersion},
            updated_at = now()
          where id = ${tenancyParty.tenancyId}
            and version = ${expectedTenancyVersion}
          returning id
        `;

        if (updated.length === 0) {
          throw new DomainError(
            'TENANCY_VERSION_CONFLICT',
            'Tenancy was modified concurrently.',
          );
        }

        await tx`
          insert into public.tenancy_parties (
            id, tenancy_id, party_id, role, is_primary
          ) values (
            ${tenancyParty.id}, ${tenancyParty.tenancyId},
            ${tenancyParty.partyId}, ${tenancyParty.role},
            ${tenancyParty.isPrimary}
          )
        `;
      });
    });
  }

  async updateLifecycle(
    tenancy: Tenancy,
    expectedVersion: number,
  ): Promise<void> {
    await withTranslatedErrors(async () => {
      const rows = await this.sql<{ id: string }[]>`
        update public.tenancies
        set
          status = ${tenancy.status},
          planned_start = ${tenancy.plannedStart},
          planned_end = ${tenancy.plannedEnd},
          actual_start = ${tenancy.actualStart},
          actual_end = ${tenancy.actualEnd},
          notice_given_at = ${tenancy.noticeGivenAt},
          termination_effective_at = ${tenancy.terminationEffectiveAt},
          version = ${tenancy.version},
          updated_at = now()
        where id = ${tenancy.id}
          and version = ${expectedVersion}
        returning id
      `;

      if (rows.length === 0) {
        throw new DomainError(
          'TENANCY_VERSION_CONFLICT',
          'Tenancy was modified concurrently.',
        );
      }
    });
  }
}
