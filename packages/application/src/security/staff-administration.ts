import { asUserId, type UserId } from '@portfolio/domain';
import {
  requireCapability,
  type Actor,
  type StaffRole,
} from './access.js';
import { ApplicationError } from '../shared/application-error.js';
import type { IdGenerator } from '../shared/id-generator.js';

export const STAFF_STATUSES = ['active', 'inactive'] as const;
export type StaffStatus = (typeof STAFF_STATUSES)[number];

export interface StaffIdentity {
  readonly provider: string;
  readonly subject: string;
}

export interface StaffAccount {
  readonly userId: UserId;
  readonly displayName: string;
  readonly email: string | null;
  readonly role: StaffRole;
  readonly status: StaffStatus;
  readonly revision: number;
  readonly identities: readonly StaffIdentity[];
}

export interface StaffAdministrationRepository {
  listStaff(): Promise<readonly StaffAccount[]>;
  getStaffById(userId: UserId): Promise<StaffAccount | null>;
  insertStaff(staff: StaffAccount): Promise<void>;
  updateStaffRole(
    userId: UserId,
    role: StaffRole,
    expectedRevision: number,
  ): Promise<boolean>;
  updateStaffStatus(
    userId: UserId,
    status: StaffStatus,
    expectedRevision: number,
  ): Promise<boolean>;
  linkSupabaseIdentityAndActivate(
    userId: UserId,
    subject: string,
    expectedRevision: number,
  ): Promise<boolean>;
}

export interface StaffAuthAdminPort {
  ensureInvitedUser(email: string): Promise<{
    readonly subject: string;
    readonly email: string;
  }>;
  sendAccessEmail(email: string, expectedSubject: string): Promise<void>;
}

function requireStaffAdmin(actor: Actor): void {
  requireCapability(actor, 'staff:admin');
}

async function requireStaff(
  repository: StaffAdministrationRepository,
  userId: UserId,
): Promise<StaffAccount> {
  const staff = await repository.getStaffById(userId);
  if (!staff) {
    throw new ApplicationError('STAFF_NOT_FOUND', 'Portfolio staff user was not found.');
  }
  return staff;
}

function requireExpectedRevision(
  staff: StaffAccount,
  expectedRevision: number,
): void {
  if (staff.revision !== expectedRevision) {
    throw new ApplicationError(
      'STAFF_VERSION_CONFLICT',
      'Portfolio staff user changed since it was loaded.',
    );
  }
}

export async function listStaffQuery(
  repository: StaffAdministrationRepository,
  actor: Actor,
): Promise<readonly StaffAccount[]> {
  requireStaffAdmin(actor);
  return repository.listStaff();
}

export async function getCurrentStaffQuery(
  repository: StaffAdministrationRepository,
  actor: Actor,
): Promise<StaffAccount> {
  return requireStaff(repository, actor.userId);
}

export async function createStaffCommand(
  deps: {
    readonly staffRepository: StaffAdministrationRepository;
    readonly idGenerator: IdGenerator;
  },
  actor: Actor,
  input: {
    readonly displayName: string;
    readonly email: string;
    readonly role: StaffRole;
  },
): Promise<StaffAccount> {
  requireStaffAdmin(actor);

  const displayName = input.displayName.trim();
  const email = input.email.trim().toLowerCase();
  if (!displayName || !email) {
    throw new ApplicationError(
      'INVALID_REQUEST',
      'Staff display name and email are required.',
    );
  }

  const staff: StaffAccount = {
    userId: asUserId(deps.idGenerator.next()),
    displayName,
    email,
    role: input.role,
    status: 'inactive',
    revision: 1,
    identities: [],
  };

  await deps.staffRepository.insertStaff(staff);
  return staff;
}

export async function inviteStaffCommand(
  deps: {
    readonly staffRepository: StaffAdministrationRepository;
    readonly authAdmin: StaffAuthAdminPort;
  },
  actor: Actor,
  userId: UserId,
  expectedRevision: number,
): Promise<StaffAccount> {
  requireStaffAdmin(actor);

  const staff = await requireStaff(deps.staffRepository, userId);
  requireExpectedRevision(staff, expectedRevision);

  const linked = staff.identities.find(
    (identity) => identity.provider.toLowerCase() === 'supabase',
  );

  if (!staff.email) {
    throw new ApplicationError(
      'STAFF_EMAIL_REQUIRED',
      'A staff email address is required before invitation.',
    );
  }

  if (linked) {
    await deps.authAdmin.sendAccessEmail(staff.email, linked.subject);
    return staff;
  }

  const invited = await deps.authAdmin.ensureInvitedUser(staff.email);
  if (invited.email.trim().toLowerCase() !== staff.email.trim().toLowerCase()) {
    throw new ApplicationError(
      'STAFF_AUTH_IDENTITY_MISMATCH',
      'Supabase returned an identity for a different email address.',
    );
  }

  const updated = await deps.staffRepository.linkSupabaseIdentityAndActivate(
    staff.userId,
    invited.subject,
    expectedRevision,
  );

  if (!updated) {
    const current = await requireStaff(deps.staffRepository, staff.userId);
    const reconciled = current.identities.some(
      (identity) =>
        identity.provider.toLowerCase() === 'supabase' &&
        identity.subject === invited.subject,
    );
    if (reconciled && current.status === 'active') return current;

    throw new ApplicationError(
      'STAFF_VERSION_CONFLICT',
      'Portfolio staff user changed while the invitation was being linked.',
    );
  }

  return requireStaff(deps.staffRepository, staff.userId);
}

export async function updateStaffRoleCommand(
  repository: StaffAdministrationRepository,
  actor: Actor,
  userId: UserId,
  role: StaffRole,
  expectedRevision: number,
): Promise<StaffAccount> {
  requireStaffAdmin(actor);
  const staff = await requireStaff(repository, userId);
  requireExpectedRevision(staff, expectedRevision);

  if (staff.userId === actor.userId && role !== 'admin') {
    throw new ApplicationError(
      'STAFF_SELF_LOCKOUT',
      'An administrator cannot remove their own administrator role.',
    );
  }

  if (staff.role === role) return staff;

  if (!(await repository.updateStaffRole(userId, role, expectedRevision))) {
    throw new ApplicationError(
      'STAFF_VERSION_CONFLICT',
      'Portfolio staff user changed before the role update completed.',
    );
  }
  return requireStaff(repository, userId);
}

export async function updateStaffStatusCommand(
  repository: StaffAdministrationRepository,
  actor: Actor,
  userId: UserId,
  status: StaffStatus,
  expectedRevision: number,
): Promise<StaffAccount> {
  requireStaffAdmin(actor);
  const staff = await requireStaff(repository, userId);
  requireExpectedRevision(staff, expectedRevision);

  if (staff.userId === actor.userId && status !== 'active') {
    throw new ApplicationError(
      'STAFF_SELF_LOCKOUT',
      'An administrator cannot deactivate their own Portfolio access.',
    );
  }

  if (status === 'active' && staff.identities.length === 0) {
    throw new ApplicationError(
      'STAFF_IDENTITY_REQUIRED',
      'A staff user must have a linked external identity before activation.',
    );
  }

  if (staff.status === status) return staff;

  if (!(await repository.updateStaffStatus(userId, status, expectedRevision))) {
    throw new ApplicationError(
      'STAFF_VERSION_CONFLICT',
      'Portfolio staff user changed before the status update completed.',
    );
  }
  return requireStaff(repository, userId);
}
