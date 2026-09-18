import type postgres from 'postgres';
import {
  type Actor,
  type StaffDirectoryEntry,
  type StaffDirectoryRepository,
  type StaffRole,
  type UserAccessRepository,
  type VerifiedIdentity,
} from '@portfolio/application';
import { asUserId, type UserId } from '@portfolio/domain';

type Sql = ReturnType<typeof postgres>;

interface ActorRow {
  id: string;
  role: StaffRole;
}

interface StaffRow extends ActorRow {
  display_name: string;
}

export class PostgresUserAccessRepository
  implements UserAccessRepository, StaffDirectoryRepository {
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

    return {
      userId: asUserId(row.id),
      role: row.role,
    };
  }

  async getActiveStaffById(
    userId: UserId,
  ): Promise<StaffDirectoryEntry | null> {
    const rows = await this.sql<StaffRow[]>`
      select id, display_name, role
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
          role: row.role,
        }
      : null;
  }
}
