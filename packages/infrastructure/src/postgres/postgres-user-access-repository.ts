import type postgres from 'postgres';
import {
  type Actor,
  type StaffDirectoryEntry,
  type StaffDirectoryRepository,
  type StaffRole,
  type UserAccessRepository,
  type VerifiedIdentity,
} from '@portfolio/application';
import { asUserId } from '@portfolio/domain';

type Sql = ReturnType<typeof postgres>;

interface ActorRow {
  id: string;
  role: StaffRole;
  async getActiveStaffById(
    userId: import('@portfolio/domain').UserId,
  ): Promise<StaffDirectoryEntry | null> {
    const rows = await this.sql<ActorRow[]>`
      select id, role
      from public.app_users
      where id = ${userId}
        and status = 'active'
      limit 1
    `;

    const row = rows[0];
    return row
      ? { userId: asUserId(row.id), role: row.role }
      : null;
  }
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
}
