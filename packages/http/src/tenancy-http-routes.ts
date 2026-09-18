import {
  activateTenancyCommand,
  addTenancyPartyCommand,
  cancelTenancyCommand,
  createTenancyCommand,
  endTenancyCommand,
  getTenancyQuery,
  giveTenancyNoticeCommand,
  listTenanciesByUnitQuery,
  markTenancyMoveOutPendingCommand,
  planTenancyCommand,
  type Actor,
  type CreateTenancyCommandInput,
  type IdGenerator,
  type PartyRepository,
  type PortfolioRepository,
  type TenancyRepository,
} from '@portfolio/application';
import {
  activateTenancyRequestSchema,
  addTenancyPartyRequestSchema,
  createTenancyRequestSchema,
  endTenancyRequestSchema,
  entityIdSchema,
  giveTenancyNoticeRequestSchema,
  planTenancyRequestSchema,
  tenancyVersionRequestSchema,
} from '@portfolio/contracts';
import {
  asPartyId,
  asTenancyId,
  asUnitId,
} from '@portfolio/domain';
import {
  json,
  requestJson,
  validationFailure,
} from './http-utils.js';
import { toTenancyResponse } from './response-mappers.js';

export interface TenancyHttpDependencies {
  readonly tenancyRepository: TenancyRepository;
  readonly portfolioRepository: PortfolioRepository;
  readonly partyRepository: PartyRepository;
  readonly idGenerator: IdGenerator;
}

export async function handleTenancyHttp(
  deps: TenancyHttpDependencies,
  actor: Actor,
  request: Request,
  path: string,
): Promise<Response | null> {
  const method = request.method.toUpperCase();

  const unitTenanciesMatch = /^\/units\/([^/]+)\/tenancies$/.exec(path);
  if (unitTenanciesMatch) {
    const parsedUnitId = entityIdSchema.safeParse(unitTenanciesMatch[1]);
    if (!parsedUnitId.success) return validationFailure();
    const unitId = asUnitId(parsedUnitId.data);

    if (method === 'GET') {
      const tenancies = await listTenanciesByUnitQuery(
        {
          tenancyRepository: deps.tenancyRepository,
          portfolioRepository: deps.portfolioRepository,
        },
        actor,
        unitId,
      );

      return json({ data: { items: tenancies.map(toTenancyResponse) } });
    }

    if (method === 'POST') {
      const body = await requestJson(request);
      const parsed = createTenancyRequestSchema.safeParse(body);
      if (!parsed.success) return validationFailure();

      const input: CreateTenancyCommandInput = {
        unitId,
        code: parsed.data.code,
        ...(parsed.data.parties !== undefined
          ? {
              parties: parsed.data.parties.map((party) => ({
                partyId: asPartyId(party.partyId),
                role: party.role,
                ...(party.isPrimary !== undefined
                  ? { isPrimary: party.isPrimary }
                  : {}),
              })),
            }
          : {}),
      };

      const tenancy = await createTenancyCommand(
        {
          tenancyRepository: deps.tenancyRepository,
          portfolioRepository: deps.portfolioRepository,
          partyRepository: deps.partyRepository,
          idGenerator: deps.idGenerator,
        },
        actor,
        input,
      );

      return json({ data: toTenancyResponse(tenancy) }, 201);
    }

    return null;
  }

  const tenancyMatch = /^\/tenancies\/([^/]+)$/.exec(path);
  if (method === 'GET' && tenancyMatch) {
    const parsedId = entityIdSchema.safeParse(tenancyMatch[1]);
    if (!parsedId.success) return validationFailure();

    const tenancy = await getTenancyQuery(
      deps.tenancyRepository,
      actor,
      asTenancyId(parsedId.data),
    );

    return json({ data: toTenancyResponse(tenancy) });
  }

  const tenancyPartiesMatch = /^\/tenancies\/([^/]+)\/parties$/.exec(path);
  if (method === 'POST' && tenancyPartiesMatch) {
    const parsedId = entityIdSchema.safeParse(tenancyPartiesMatch[1]);
    if (!parsedId.success) return validationFailure();

    const body = await requestJson(request);
    const parsed = addTenancyPartyRequestSchema.safeParse(body);
    if (!parsed.success) return validationFailure();

    const tenancy = await addTenancyPartyCommand(
      {
        tenancyRepository: deps.tenancyRepository,
        partyRepository: deps.partyRepository,
        idGenerator: deps.idGenerator,
      },
      actor,
      asTenancyId(parsedId.data),
      parsed.data.expectedVersion,
      {
        partyId: asPartyId(parsed.data.partyId),
        role: parsed.data.role,
        ...(parsed.data.isPrimary !== undefined
          ? { isPrimary: parsed.data.isPrimary }
          : {}),
      },
    );

    return json({ data: toTenancyResponse(tenancy) });
  }

  const tenancyActionMatch =
    /^\/tenancies\/([^/]+)\/(plan|activate|give-notice|move-out-pending|end|cancel)$/.exec(path);

  if (method !== 'POST' || !tenancyActionMatch) return null;

  const parsedId = entityIdSchema.safeParse(tenancyActionMatch[1]);
  if (!parsedId.success) return validationFailure();

  const tenancyId = asTenancyId(parsedId.data);
  const action = tenancyActionMatch[2];
  const body = await requestJson(request);

  if (action === 'plan') {
    const parsed = planTenancyRequestSchema.safeParse(body);
    if (!parsed.success) return validationFailure();

    const tenancy = await planTenancyCommand(
      { tenancyRepository: deps.tenancyRepository },
      actor,
      tenancyId,
      parsed.data.expectedVersion,
      parsed.data.plannedStart,
      parsed.data.plannedEnd,
    );

    return json({ data: toTenancyResponse(tenancy) });
  }

  if (action === 'activate') {
    const parsed = activateTenancyRequestSchema.safeParse(body);
    if (!parsed.success) return validationFailure();

    const tenancy = await activateTenancyCommand(
      { tenancyRepository: deps.tenancyRepository },
      actor,
      tenancyId,
      parsed.data.expectedVersion,
      parsed.data.actualStart,
    );

    return json({ data: toTenancyResponse(tenancy) });
  }

  if (action === 'give-notice') {
    const parsed = giveTenancyNoticeRequestSchema.safeParse(body);
    if (!parsed.success) return validationFailure();

    const tenancy = await giveTenancyNoticeCommand(
      { tenancyRepository: deps.tenancyRepository },
      actor,
      tenancyId,
      parsed.data.expectedVersion,
      parsed.data.noticeGivenAt,
      parsed.data.terminationEffectiveAt,
    );

    return json({ data: toTenancyResponse(tenancy) });
  }

  if (action === 'move-out-pending') {
    const parsed = tenancyVersionRequestSchema.safeParse(body);
    if (!parsed.success) return validationFailure();

    const tenancy = await markTenancyMoveOutPendingCommand(
      { tenancyRepository: deps.tenancyRepository },
      actor,
      tenancyId,
      parsed.data.expectedVersion,
    );

    return json({ data: toTenancyResponse(tenancy) });
  }

  if (action === 'end') {
    const parsed = endTenancyRequestSchema.safeParse(body);
    if (!parsed.success) return validationFailure();

    const tenancy = await endTenancyCommand(
      { tenancyRepository: deps.tenancyRepository },
      actor,
      tenancyId,
      parsed.data.expectedVersion,
      parsed.data.actualEnd,
    );

    return json({ data: toTenancyResponse(tenancy) });
  }

  const parsed = tenancyVersionRequestSchema.safeParse(body);
  if (!parsed.success) return validationFailure();

  const tenancy = await cancelTenancyCommand(
    { tenancyRepository: deps.tenancyRepository },
    actor,
    tenancyId,
    parsed.data.expectedVersion,
  );

  return json({ data: toTenancyResponse(tenancy) });
}
