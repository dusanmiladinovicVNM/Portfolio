import type postgres from 'postgres';
import {
  ApplicationError,
  type Actor,
  type StaffAccount,
  type StaffAdministrationRepository,
  type StaffDirectoryEntry,
  type StaffDirectoryRepository,
  type StaffIdentity,
  type StaffRole,
  type StaffStatus,
  type UserAccessRepository,
  type VerifiedIdentity,
} from '@portfolio/application';
import { asUserId, type UserId } from '@portfolio/domain';

type Sql = ReturnType<typeof postgres>;

interface PostgresErrorLike {
  code?: string;
  constraint_name?: string;
}

interface ActorRow {
  id: string;
  role: StaffRole;
}

interface ActiveStaffRow {
  id: string;
  display_name: string;
  email: string | null;
  role: StaffRole;
}

interface StaffRow {
  id: string;
  display_name: string;
  email: string | null;
  role: StaffRole;
  status: StaffStatus;
  revision: number;
  identities: StaffIdentity[];
}

function mapStaff(row: StaffRow): StaffAccount {
  return {
    userId: asUserId(row.id),
    displayName: row.display_name,
    email: row.email,
    role: row.role,
    status: row.status,
    revision: row.revision,
    identities: row.identities,
  };
}

function translateStaffError(error: unknown): ApplicationError | null {
  const pg = error as PostgresErrorLike;
  if (pg.code === '23505' && pg.constraint_name === 'app_users_email_uq') {
    return new ApplicationError(
      'STAFF_EMAIL_ALREADY_EXISTS',
      'A Portfolio staff user already uses this email address.',
    );
  }
  if (
    pg.code === '23505' &&
    (pg.constraint_name === 'auth_identities_provider_subject_uq' ||
      pg.constraint_name === 'auth_identities_user_provider_uq')
  ) {
    return new ApplicationError(
      'STAFF_IDENTITY_CONFLICT',
      'The Supabase identity is already linked to another Portfolio staff user.',
    );
  }
  if (
    pg.code === '23514' &&
    pg.constraint_name === 'app_users_active_admin_required'
  ) {
    return new ApplicationError(
      'STAFF_LAST_ADMIN_REQUIRED',
      'Portfolio requires at least one active administrator.',
    );
  }
  return null;
}

const staffSelect = `
  select
    u.id,
    u.display_name,
    u.email,
    u.role,
    u.status,
    u.revision,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'provider', ai.provider,
            'subject', ai.subject
          )
          order by lower(ai.provider), ai.id
        )
        from public.auth_identities ai
        where ai.user_id = u.id
      ),
      '[]'::jsonb
    ) as identities
  from public.app_users u
`;

export class PostgresUserAccessRepository
  implements
    UserAccessRepository,
    StaffDirectoryRepository,
    StaffAdministrationRepository {
  constructor(private readonly sql: Sql) {}

  async findActorByIdentity(identity: VerifiedIdentity): Promise<Actor | null> {
    const rows = await this.sql<ActorRow[]>`
      select u.id, u.role
      from public.auth_identities ai
      join public.app_users u on u.id = ai.user_id
      where lower(ai.provider) = lower(${identity.provider})
        and ai.subject = ${identity.subject}
        and u.status = 'active'
      limit 1
    `;

    const row = rows[0];
    if (!row) return null;
    return { userId: asUserId(row.id), role: row.role };
  }

  async getActiveStaffById(userId: UserId): Promise<StaffDirectoryEntry | null> {
    const rows = await this.sql<ActiveStaffRow[]>`
      select id, display_name, email, role
      from public.app_users
      where id = ${userId}
        and status = 'active'
      limit 1
    `;
    const row = rows[0];
    return row
      ? {
          userId: asUserId(row.id),
          displayName: row.display_name,
          email: row.email,
          role: row.role,
        }
      : null;
  }

  async listActiveStaff(): Promise<readonly StaffDirectoryEntry[]> {
    const rows = await this.sql<ActiveStaffRow[]>`
      select id, display_name, email, role
      from public.app_users
      where status = 'active'
      order by lower(display_name), id
    `;
    return rows.map((row) => ({
      userId: asUserId(row.id),
      displayName: row.display_name,
      email: row.email,
      role: row.role,
    }));
  }

  async listStaff(): Promise<readonly StaffAccount[]> {
    const rows = await this.sql<StaffRow[]>`
      ${this.sql.unsafe(staffSelect)}
      order by lower(u.display_name), u.id
    `;
    return rows.map(mapStaff);
  }

  async getStaffById(userId: UserId): Promise<StaffAccount | null> {
    const rows = await this.sql<StaffRow[]>`
      ${this.sql.unsafe(staffSelect)}
      where u.id = ${userId}
      limit 1
    `;
    return rows[0] ? mapStaff(rows[0]) : null;
  }

  async insertStaff(staff: StaffAccount): Promise<void> {
    try {
      await this.sql`
        insert into public.app_users (
          id, display_name, email, role, status, revision
        ) values (
          ${staff.userId},
          ${staff.displayName},
          ${staff.email},
          ${staff.role},
          ${staff.status},
          ${staff.revision}
        )
      `;
    } catch (error) {
      const translated = translateStaffError(error);
      if (translated) throw translated;
      throw error;
    }
  }

  async updateStaffRole(
    userId: UserId,
    role: StaffRole,
    expectedRevision: number,
  ): Promise<boolean> {
    try {
      const rows = await this.sql<{ id: string }[]>`
        update public.app_users
        set role = ${role},
            revision = revision + 1
        where id = ${userId}
          and revision = ${expectedRevision}
        returning id
      `;
      return rows.length === 1;
    } catch (error) {
      const translated = translateStaffError(error);
      if (translated) throw translated;
      throw error;
    }
  }

  async updateStaffStatus(
    userId: UserId,
    status: StaffStatus,
    expectedRevision: number,
  ): Promise<boolean> {
    try {
      const rows = await this.sql<{ id: string }[]>`
        update public.app_users
        set status = ${status},
            revision = revision + 1
        where id = ${userId}
          and revision = ${expectedRevision}
        returning id
      `;
      return rows.length === 1;
    } catch (error) {
      const translated = translateStaffError(error);
      if (translated) throw translated;
      throw error;
    }
  }

  async linkSupabaseIdentityAndActivate(
    userId: UserId,
    subject: string,
    expectedRevision: number,
  ): Promise<boolean> {
    try {
      return await this.sql.begin(async (tx) => {
        const rows = await tx<{ id: string }[]>`
          update public.app_users
          set status = 'active',
              revision = revision + 1
          where id = ${userId}
            and revision = ${expectedRevision}
            and status = 'inactive'
          returning id
        `;
        if (rows.length !== 1) return false;

        await tx`
          insert into public.auth_identities (
            user_id, provider, subject
          ) values (
            ${userId}, 'supabase', ${subject}
          )
        `;
        return true;
      });
    } catch (error) {
      const translated = translateStaffError(error);
      if (translated) throw translated;
      throw error;
    }
  }
}
