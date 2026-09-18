import type postgres from 'postgres';
import type { OwnershipRepository } from '@portfolio/application';
import {
  DomainError,
  asDateOnly,
  asOwnershipPeriodId,
  asPartyId,
  asUnitId,
  type DateOnly,
  type OwnershipPeriod,
  type UnitId,
} from '@portfolio/domain';

type Sql = ReturnType<typeof postgres>;

interface PostgresErrorLike {
  code?: string;
  constraint_name?: string;
}

interface OwnershipShareJson {
  partyId: string;
  shareBasisPoints: number;
}

interface OwnershipPeriodRow {
  id: string;
  unit_id: string;
  valid_from: string | Date;
  valid_to: string | Date | null;
  owners: OwnershipShareJson[];
}

function dateString(value: string | Date): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value;
}

function mapPeriod(row: OwnershipPeriodRow): OwnershipPeriod {
  return {
    id: asOwnershipPeriodId(row.id),
    unitId: asUnitId(row.unit_id),
    validFrom: asDateOnly(dateString(row.valid_from)),
    validTo: row.valid_to === null ? null : asDateOnly(dateString(row.valid_to)),
    owners: row.owners.map((owner) => ({
      partyId: asPartyId(owner.partyId),
      shareBasisPoints: owner.shareBasisPoints,
    })),
  };
}

export class PostgresOwnershipRepository implements OwnershipRepository {
  constructor(private readonly sql: Sql) {}

  async listByUnit(unitId: UnitId): Promise<readonly OwnershipPeriod[]> {
    const rows = await this.sql<OwnershipPeriodRow[]>`
      select
        op.id,
        op.unit_id,
        op.valid_from,
        op.valid_to,
        coalesce(
          (
            select jsonb_agg(
              jsonb_build_object(
                'partyId', s.party_id,
                'shareBasisPoints', s.share_basis_points
              )
              order by s.party_id
            )
            from public.unit_ownership_shares s
            where s.ownership_period_id = op.id
          ),
          '[]'::jsonb
        ) as owners
      from public.unit_ownership_periods op
      where op.unit_id = ${unitId}
      order by op.valid_from, op.id
    `;

    return rows.map(mapPeriod);
  }

  async overlaps(
    unitId: UnitId,
    validFrom: DateOnly,
    validTo: DateOnly | null,
  ): Promise<boolean> {
    const rows = await this.sql<{ exists: boolean }[]>`
      select exists(
        select 1
        from public.unit_ownership_periods op
        where op.unit_id = ${unitId}
          and daterange(op.valid_from, op.valid_to + 1, '[)')
              && daterange(
                ${validFrom}::date,
                case
                  when ${validTo}::date is null then null
                  else ${validTo}::date + 1
                end,
                '[)'
              )
      ) as exists
    `;

    return rows[0]?.exists ?? false;
  }

  async insert(period: OwnershipPeriod): Promise<void> {
    try {
      await this.sql.begin(async (tx) => {
        await tx`
          insert into public.unit_ownership_periods (
            id, unit_id, valid_from, valid_to
          ) values (
            ${period.id}, ${period.unitId}, ${period.validFrom}, ${period.validTo}
          )
        `;

        for (const owner of period.owners) {
          await tx`
            insert into public.unit_ownership_shares (
              ownership_period_id, party_id, share_basis_points
            ) values (
              ${period.id}, ${owner.partyId}, ${owner.shareBasisPoints}
            )
          `;
        }
      });
    } catch (error) {
      const pg = error as PostgresErrorLike;
      if (
        pg.code === '23P01' &&
        pg.constraint_name === 'unit_ownership_periods_no_overlap'
      ) {
        throw new DomainError(
          'OWNERSHIP_PERIOD_OVERLAP',
          'Ownership periods for the same unit cannot overlap.',
        );
      }
      throw error;
    }
  }
}
