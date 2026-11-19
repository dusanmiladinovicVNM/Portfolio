import type { UserId } from '@portfolio/domain';
import { ApplicationError } from '../shared/application-error.js';

export const STAFF_ROLES = ['admin', 'manager', 'inspector'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export const CAPABILITIES = [
  'portfolio:read',
  'portfolio:write',
  'parties:read',
  'parties:write',
  'ownership:read',
  'ownership:write',
  'tenancy:read',
  'tenancy:write',
  'contracts:read',
  'contracts:write',
  'documents:read',
  'documents:write',
  'inspections:read',
  'inspections:write',
  'inspection_schemas:read',
  'inspection_schemas:write',
  'assets:read',
  'assets:write',
  'service:read',
  'service:write',
  'improvements:read',
  'improvements:write',
  'costs:read',
  'costs:write',
  'maintenance:read',
  'maintenance:write',
  'access_items:read',
  'access_items:write',
  'meters:read',
  'meters:write',
  'meter_readings:write',
  'staff:admin',
] as const;
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
  admin: new Set<Capability>(CAPABILITIES),
  manager: new Set<Capability>(CAPABILITIES.filter((capability) => capability !== 'staff:admin')),
  inspector: new Set<Capability>([
    'portfolio:read',
    'parties:read',
    'ownership:read',
    'tenancy:read',
    'contracts:read',
    'documents:read',
    'inspections:read',
    'inspections:write',
    'inspection_schemas:read',
    'assets:read',
    'service:read',
    'improvements:read',
    'maintenance:read',
    'access_items:read',
    'meters:read',
    'meter_readings:write',
  ]),
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

export function actorHasCapability(actor: Actor, capability: Capability): boolean {
  return ROLE_CAPABILITIES[actor.role].has(capability);
}

/**
 * Mirrors the existing server-side Inspection lifecycle guard.
 * An Inspector can lock an assigned Inspection and register signatures, but
 * only Manager/Admin may unlock or finalize it.
 */
export function canControlInspectionLifecycle(actor: Actor): boolean {
  return actorHasCapability(actor, 'inspections:write') && actor.role !== 'inspector';
}

export function requireCapability(actor: Actor, capability: Capability): void {
  if (!actorHasCapability(actor, capability)) {
    throw new ApplicationError('FORBIDDEN', 'The current user is not allowed to perform this operation.');
  }
}
