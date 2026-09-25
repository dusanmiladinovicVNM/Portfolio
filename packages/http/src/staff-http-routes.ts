import {
  createStaffCommand,
  getCurrentStaffQuery,
  inviteStaffCommand,
  listStaffQuery,
  updateStaffRoleCommand,
  updateStaffStatusCommand,
  type Actor,
  type IdGenerator,
  type StaffAccount,
  type StaffAdministrationRepository,
  type StaffAuthAdminPort,
} from '@portfolio/application';
import {
  createStaffRequestSchema,
  entityIdSchema,
  staffCommandRevisionSchema,
  updateStaffRoleRequestSchema,
  updateStaffStatusRequestSchema,
} from '@portfolio/contracts';
import { asUserId } from '@portfolio/domain';
import { json, requestJson, validationFailure } from './http-utils.js';

export interface StaffHttpDependencies {
  readonly staffRepository: StaffAdministrationRepository;
  readonly authAdmin: StaffAuthAdminPort;
  readonly idGenerator: IdGenerator;
}

function toStaffResponse(staff: StaffAccount) {
  return {
    userId: staff.userId,
    displayName: staff.displayName,
    email: staff.email,
    role: staff.role,
    status: staff.status,
    revision: staff.revision,
    identityProviders: staff.identities.map((identity) => identity.provider),
  };
}

export async function handleStaffHttp(
  deps: StaffHttpDependencies,
  actor: Actor,
  request: Request,
  path: string,
): Promise<Response | null> {
  const method = request.method.toUpperCase();

  if (method === 'GET' && path === '/me') {
    return json({ data: toStaffResponse(await getCurrentStaffQuery(deps.staffRepository, actor)) });
  }

  if (path === '/staff') {
    if (method === 'GET') {
      const staff = await listStaffQuery(deps.staffRepository, actor);
      return json({ data: { items: staff.map(toStaffResponse) } });
    }
    if (method === 'POST') {
      const parsed = createStaffRequestSchema.safeParse(await requestJson(request));
      if (!parsed.success) return validationFailure();
      const staff = await createStaffCommand(
        { staffRepository: deps.staffRepository, idGenerator: deps.idGenerator },
        actor,
        parsed.data,
      );
      return json({ data: toStaffResponse(staff) }, 201);
    }
    return null;
  }

  const inviteMatch = /^\/staff\/([^/]+)\/invite$/.exec(path);
  if (method === 'POST' && inviteMatch) {
    const id = entityIdSchema.safeParse(inviteMatch[1]);
    const body = staffCommandRevisionSchema.safeParse(await requestJson(request));
    if (!id.success || !body.success) return validationFailure();
    const staff = await inviteStaffCommand(
      { staffRepository: deps.staffRepository, authAdmin: deps.authAdmin },
      actor,
      asUserId(id.data),
      body.data.expectedRevision,
    );
    return json({ data: toStaffResponse(staff) });
  }

  const roleMatch = /^\/staff\/([^/]+)\/role$/.exec(path);
  if (method === 'PATCH' && roleMatch) {
    const id = entityIdSchema.safeParse(roleMatch[1]);
    const body = updateStaffRoleRequestSchema.safeParse(await requestJson(request));
    if (!id.success || !body.success) return validationFailure();
    const staff = await updateStaffRoleCommand(
      deps.staffRepository, actor, asUserId(id.data),
      body.data.role, body.data.expectedRevision,
    );
    return json({ data: toStaffResponse(staff) });
  }

  const statusMatch = /^\/staff\/([^/]+)\/status$/.exec(path);
  if (method === 'PATCH' && statusMatch) {
    const id = entityIdSchema.safeParse(statusMatch[1]);
    const body = updateStaffStatusRequestSchema.safeParse(await requestJson(request));
    if (!id.success || !body.success) return validationFailure();
    const staff = await updateStaffStatusCommand(
      deps.staffRepository, actor, asUserId(id.data),
      body.data.status, body.data.expectedRevision,
    );
    return json({ data: toStaffResponse(staff) });
  }

  return null;
}
