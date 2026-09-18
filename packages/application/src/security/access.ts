import type { UserId } from '@portfolio/domain';
import { ApplicationError } from '../shared/application-error.js';

export const STAFF_ROLES = ['admin', 'manager', 'inspector'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export const CAPABILITIES = ['portfolio:read', 'portfolio:write'] as const;
export type Capability = (typeof CAPABILITIES)[number];

export interface Actor {
  readonly userId: UserId;
  readonly role: StaffRole;
}

export interface VerifiedIdentity {
  readonly provider: string;
  readonly subject: string;
}

export interface UserAccessRepository {
  findActorByIdentity(identity: VerifiedIdentity): Promise<Actor | null>;
}

const ROLE_CAPABILITIES: Readonly<Record<StaffRole, ReadonlySet<Capability>>> = {
  admin: new Set<Capability>(['portfolio:read', 'portfolio:write']),
  manager: new Set<Capability>(['portfolio:read', 'portfolio:write']),
  inspector: new Set<Capability>(['portfolio:read']),
};

export async function resolveActor(
  repository: UserAccessRepository,
  identity: VerifiedIdentity,
): Promise<Actor> {
  const actor = await repository.findActorByIdentity(identity);
  if (!actor) {
    throw new ApplicationError('UNAUTHORIZED', 'Authenticated identity is not an active Portfolio user.');
  }
  return actor;
}

export function requireCapability(actor: Actor, capability: Capability): void {
  if (!ROLE_CAPABILITIES[actor.role].has(capability)) {
    throw new ApplicationError('FORBIDDEN', 'The current user is not allowed to perform this operation.');
  }
}
