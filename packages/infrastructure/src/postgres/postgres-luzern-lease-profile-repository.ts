import type postgres from 'postgres';
import type { LuzernLeaseProfileRepository } from '@portfolio/application';
import {
  DomainError,
  createLuzernLeaseProfile,
  type LeaseAgreementId,
  type LuzernLeaseProfile,
  type LuzernLeaseProfileDraftInput,
} from '@portfolio/domain';

type Sql = ReturnType<typeof postgres>;

interface ProfileRow {
  agreement_id: string;
  revision: number;
  payload: LuzernLeaseProfileDraftInput;
}

function payloadFromProfile(
  profile: LuzernLeaseProfile,
): LuzernLeaseProfileDraftInput {
  const {
    agreementId: _agreementId,
    revision: _revision,
    ...payload
  } = profile;
  return payload;
}

function mapProfile(row: ProfileRow): LuzernLeaseProfile {
  return createLuzernLeaseProfile(
    row.agreement_id as LeaseAgreementId,
    row.payload,
    row.revision,
  );
}

function translateProfileWriteError(error: unknown): never {
  const pg = error as { code?: string; constraint_name?: string };
  if (
    pg.constraint_name ===
      'luzern_lease_profiles_draft_owner_required'
  ) {
    throw new DomainError(
      'LUZERN_LEASE_PROFILE_IMMUTABLE',
      'Luzerner Mietvertrag preparation is immutable after Agreement leaves draft.',
    );
  }
  throw error;
}

export class PostgresLuzernLeaseProfileRepository
  implements LuzernLeaseProfileRepository
{
  constructor(private readonly sql: Sql) {}

  async getByAgreementId(
    agreementId: LeaseAgreementId,
  ): Promise<LuzernLeaseProfile | null> {
    const rows = await this.sql<ProfileRow[]>\`
      select agreement_id, revision, payload
      from public.luzern_lease_profiles
      where agreement_id = \${agreementId}
      limit 1
    \`;
    return rows.length === 0 ? null : mapProfile(rows[0]!);
  }

  async save(
    profile: LuzernLeaseProfile,
    expectedRevision: number | null,
  ): Promise<void> {
    const payload = JSON.stringify(payloadFromProfile(profile));

    try {
      if (expectedRevision === null) {
        const inserted = await this.sql<{ agreement_id: string }[]>\`
          insert into public.luzern_lease_profiles (
            agreement_id,
            revision,
            payload
          ) values (
            \${profile.agreementId},
            \${profile.revision},
            \${payload}::jsonb
          )
          on conflict (agreement_id) do nothing
          returning agreement_id
        \`;
        if (inserted.length === 0) {
          throw new DomainError(
            'LUZERN_LEASE_PROFILE_VERSION_CONFLICT',
            'Luzerner Mietvertrag preparation already exists.',
          );
        }
        return;
      }

      const updated = await this.sql<{ agreement_id: string }[]>\`
        update public.luzern_lease_profiles
        set
          revision = \${profile.revision},
          payload = \${payload}::jsonb,
          updated_at = now()
        where agreement_id = \${profile.agreementId}
          and revision = \${expectedRevision}
        returning agreement_id
      \`;
      if (updated.length === 0) {
        throw new DomainError(
          'LUZERN_LEASE_PROFILE_VERSION_CONFLICT',
          'Luzerner Mietvertrag preparation changed concurrently.',
        );
      }
    } catch (error) {
      if (error instanceof DomainError) throw error;
      translateProfileWriteError(error);
    }
  }
}
