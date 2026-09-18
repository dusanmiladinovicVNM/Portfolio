import type postgres from 'postgres';
import {
  type Actor,
  type StaffRole,
  type UserAccessRepository,
  type VerifiedIdentity,
} from '@portfolio/application';
import { asUserId } from '@portfolio/domain';

type Sql = ReturnType<typeof postgres>;

interface ActorRow {
  id: string;
  role: StaffRole;
}

export class PostgresUserAccessRepository implements UserAccessRepository {
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
