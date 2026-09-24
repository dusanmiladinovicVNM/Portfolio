import { describe, expect, it } from 'vitest';
import { asUserId } from '@portfolio/domain';
import {
  createStaffCommand,
  getCurrentStaffQuery,
  inviteStaffCommand,
  listStaffQuery,
  updateStaffRoleCommand,
  updateStaffStatusCommand,
  type Actor,
  type StaffAccount,
  type StaffAdministrationRepository,
  type StaffAuthAdminPort,
  type StaffRole,
  type StaffStatus,
} from '../src/index.js';

class MemoryStaffRepository implements StaffAdministrationRepository {
  readonly staff = new Map<string, StaffAccount>();

  async listStaff() {
    return [...this.staff.values()];
  }

  async getStaffById(userId: import('@portfolio/domain').UserId) {
    return this.staff.get(userId) ?? null;
  }

  async insertStaff(staff: StaffAccount) {
    if ([...this.staff.values()].some(
      (item) => item.email?.toLowerCase() === staff.email?.toLowerCase(),
    )) {
      throw Object.assign(new Error('duplicate'), { code: 'STAFF_EMAIL_ALREADY_EXISTS' });
    }
    this.staff.set(staff.userId, staff);
  }

  async updateStaffRole(
    userId: import('@portfolio/domain').UserId,
    role: StaffRole,
    expectedRevision: number,
  ) {
    const current = this.staff.get(userId);
    if (!current || current.revision !== expectedRevision) return false;
    this.staff.set(userId, { ...current, role, revision: current.revision + 1 });
    return true;
  }

  async updateStaffStatus(
    userId: import('@portfolio/domain').UserId,
    status: StaffStatus,
    expectedRevision: number,
  ) {
    const current = this.staff.get(userId);
    if (!current || current.revision !== expectedRevision) return false;
    this.staff.set(userId, { ...current, status, revision: current.revision + 1 });
    return true;
  }

  async linkSupabaseIdentityAndActivate(
    userId: import('@portfolio/domain').UserId,
    subject: string,
    expectedRevision: number,
  ) {
    const current = this.staff.get(userId);
    if (!current || current.revision !== expectedRevision) return false;
    this.staff.set(userId, {
      ...current,
      status: 'active',
      revision: current.revision + 1,
      identities: [...current.identities, { provider: 'supabase', subject }],
    });
    return true;
  }
}

const adminId = asUserId('90000000-0000-4000-8000-000000000001');
const otherId = asUserId('90000000-0000-4000-8000-000000000002');

const admin: Actor = { userId: adminId, role: 'admin' };
const manager: Actor = { userId: otherId, role: 'manager' };

function activeAdmin(): StaffAccount {
  return {
    userId: adminId,
    displayName: 'Admin',
    email: 'admin@example.test',
    role: 'admin',
    status: 'active',
    revision: 1,
    identities: [{ provider: 'supabase', subject: 'admin-subject' }],
  };
}

describe('Staff Administration application boundary', () => {
  it('reserves staff administration for administrators', async () => {
    const repository = new MemoryStaffRepository();
    repository.staff.set(adminId, activeAdmin());

    await expect(listStaffQuery(repository, manager)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(
      createStaffCommand(
        {
          staffRepository: repository,
          idGenerator: { next: () => otherId },
        },
        manager,
        {
          displayName: 'Inspector',
          email: 'inspector@example.test',
          role: 'inspector',
        },
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    await expect(getCurrentStaffQuery(repository, admin)).resolves.toMatchObject({
      userId: adminId,
      role: 'admin',
    });
  });

  it('creates inactive staff then links the exact invited Supabase subject atomically', async () => {
    const repository = new MemoryStaffRepository();
    repository.staff.set(adminId, activeAdmin());

    const created = await createStaffCommand(
      {
        staffRepository: repository,
        idGenerator: { next: () => otherId },
      },
      admin,
      {
        displayName: ' Field Inspector ',
        email: 'Inspector@Example.Test ',
        role: 'inspector',
      },
    );

    expect(created).toMatchObject({
      userId: otherId,
      displayName: 'Field Inspector',
      email: 'inspector@example.test',
      status: 'inactive',
      revision: 1,
      identities: [],
    });

    const authAdmin: StaffAuthAdminPort = {
      async ensureInvitedUser(email) {
        expect(email).toBe('inspector@example.test');
        return { subject: 'supabase-inspector', email };
      },
    };

    const invited = await inviteStaffCommand(
      { staffRepository: repository, authAdmin },
      admin,
      otherId,
      1,
    );

    expect(invited).toMatchObject({
      status: 'active',
      revision: 2,
      identities: [{ provider: 'supabase', subject: 'supabase-inspector' }],
    });

    await expect(
      inviteStaffCommand(
        { staffRepository: repository, authAdmin },
        admin,
        otherId,
        2,
      ),
    ).resolves.toEqual(invited);
  });

  it('prevents self-demotion and self-deactivation before persistence', async () => {
    const repository = new MemoryStaffRepository();
    repository.staff.set(adminId, activeAdmin());

    await expect(
      updateStaffRoleCommand(repository, admin, adminId, 'manager', 1),
    ).rejects.toMatchObject({ code: 'STAFF_SELF_LOCKOUT' });

    await expect(
      updateStaffStatusCommand(repository, admin, adminId, 'inactive', 1),
    ).rejects.toMatchObject({ code: 'STAFF_SELF_LOCKOUT' });
  });

  it('requires an external identity before activation and applies CAS to role/status writes', async () => {
    const repository = new MemoryStaffRepository();
    repository.staff.set(adminId, activeAdmin());
    repository.staff.set(otherId, {
      userId: otherId,
      displayName: 'Manager',
      email: 'manager@example.test',
      role: 'manager',
      status: 'inactive',
      revision: 3,
      identities: [],
    });

    await expect(
      updateStaffStatusCommand(repository, admin, otherId, 'active', 3),
    ).rejects.toMatchObject({ code: 'STAFF_IDENTITY_REQUIRED' });

    await expect(
      updateStaffRoleCommand(repository, admin, otherId, 'inspector', 2),
    ).rejects.toMatchObject({ code: 'STAFF_VERSION_CONFLICT' });
  });
});
