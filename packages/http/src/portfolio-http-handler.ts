import {
  ApplicationError,
  activateTenancyCommand,
  addTenancyPartyCommand,
  cancelTenancyCommand,
  createOwnershipPeriodCommand,
  createPartyCommand,
  createTenancyCommand,
  createPropertyCommand,
  createSpaceCommand,
  createUnitCommand,
  endTenancyCommand,
  getPartyQuery,
  getPropertyQuery,
  getTenancyQuery,
  giveTenancyNoticeCommand,
  listOwnershipPeriodsByUnitQuery,
  listPartiesQuery,
  listPropertiesQuery,
  listSpacesByUnitQuery,
  listTenanciesByUnitQuery,
  listUnitsByPropertyQuery,
  markTenancyMoveOutPendingCommand,
  planTenancyCommand,
  resolveActor,
  type CreateOwnershipPeriodCommandInput,
  type CreatePartyCommandInput,
  type CreateTenancyCommandInput,
  type CreatePropertyCommandInput,
  type CreateSpaceCommandInput,
  type CreateUnitCommandInput,
  type IdGenerator,
  type OwnershipRepository,
  type PartyRepository,
  type PortfolioRepository,
  type TenancyRepository,
  type UserAccessRepository,
  type VerifiedIdentity,
} from '@portfolio/application';
import {
  activateTenancyRequestSchema,
  addTenancyPartyRequestSchema,
  createOwnershipPeriodRequestSchema,
  createPartyRequestSchema,
  createTenancyRequestSchema,
  createPropertyRequestSchema,
  createSpaceRequestSchema,
  createUnitRequestSchema,
  endTenancyRequestSchema,
  entityIdSchema,
  giveTenancyNoticeRequestSchema,
  planTenancyRequestSchema,
  tenancyVersionRequestSchema,
} from '@portfolio/contracts';
import {
  DomainError,
  asPartyId,
  asPropertyId,
  asTenancyId,
  asUnitId,
  type OwnershipPeriod,
} from '@portfolio/domain';

export interface PortfolioHttpDependencies {
  readonly portfolioRepository: PortfolioRepository;
  readonly partyRepository: PartyRepository;
  readonly ownershipRepository: OwnershipRepository;
  readonly tenancyRepository: TenancyRepository;
  readonly userAccessRepository: UserAccessRepository;
  readonly idGenerator: IdGenerator;
  readonly onUnexpectedError?: (error: unknown) => void;
}

export interface PortfolioHttpOptions {
  readonly basePath?: string;
}

type Handler = (
  request: Request,
  identity: VerifiedIdentity | null,
) => Promise<Response>;

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: JSON_HEADERS,
  });
}

function errorResponse(code: string, message: string, status: number): Response {
  return json({ error: { code, message } }, status);
}

function normalizeBasePath(value: string | undefined): string {
  if (!value || value === '/') return '';
  const prefixed = value.startsWith('/') ? value : '/' + value;
  return prefixed.endsWith('/') ? prefixed.slice(0, -1) : prefixed;
}

function routePath(request: Request, basePath: string): string | null {
  const pathname = new URL(request.url).pathname;
  if (!basePath) return pathname;
  if (pathname === basePath) return '/';
  if (!pathname.startsWith(basePath + '/')) return null;
  return pathname.slice(basePath.length);
}

async function requestJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new ApplicationError('INVALID_REQUEST', 'Request body must be valid JSON.');
  }
}

function validationFailure(): Response {
  return errorResponse('INVALID_REQUEST', 'Request payload is invalid.', 400);
}

function errorStatus(code: string): number {
  if (code === 'UNAUTHORIZED') return 401;
  if (code === 'FORBIDDEN') return 403;
  if (code === 'INVALID_REQUEST') return 400;
  if (code.endsWith('_NOT_FOUND')) return 404;
  if (
    code.endsWith('_ALREADY_EXISTS') ||
    code === 'OWNERSHIP_PERIOD_OVERLAP' ||
    code === 'TENANCY_PERIOD_OVERLAP' ||
    code === 'TENANCY_VERSION_CONFLICT'
  ) {
    return 409;
  }
  return 422;
}

function ownershipResponse(period: OwnershipPeriod) {
  return {
    id: period.id,
    unitId: period.unitId,
    validFrom: period.validFrom,
    validTo: period.validTo,
    owners: period.owners.map((owner) => ({
      partyId: owner.partyId,
      sharePercent: owner.shareBasisPoints / 100,
    })),
  };
}

export function createPortfolioHttpHandler(
  deps: PortfolioHttpDependencies,
  options: PortfolioHttpOptions = {},
): Handler {
  const basePath = normalizeBasePath(options.basePath);

  return async (request, identity) => {
    try {
      const path = routePath(request, basePath);
      if (path === null) {
  
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

          return json({ data: { items: tenancies } });
        }

        if (method === 'POST') {
          const parsed = createTenancyRequestSchema.safeParse(
            await requestJson(request),
          );
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

          return json({ data: tenancy }, 201);
        }
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

        return json({ data: tenancy });
      }

      const tenancyPartiesMatch = /^\/tenancies\/([^/]+)\/parties$/.exec(path);
      if (method === 'POST' && tenancyPartiesMatch) {
        const parsedId = entityIdSchema.safeParse(tenancyPartiesMatch[1]);
        if (!parsedId.success) return validationFailure();

        const parsed = addTenancyPartyRequestSchema.safeParse(
          await requestJson(request),
        );
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

        return json({ data: tenancy });
      }

      const tenancyActionMatch =
        /^\/tenancies\/([^/]+)\/(plan|activate|give-notice|move-out-pending|end|cancel)$/.exec(path);

      if (method === 'POST' && tenancyActionMatch) {
        const parsedId = entityIdSchema.safeParse(tenancyActionMatch[1]);
        if (!parsedId.success) return validationFailure();
        const tenancyId = asTenancyId(parsedId.data);
        const action = tenancyActionMatch[2];

        if (action === 'plan') {
          const parsed = planTenancyRequestSchema.safeParse(await requestJson(request));
          if (!parsed.success) return validationFailure();

          const tenancy = await planTenancyCommand(
            { tenancyRepository: deps.tenancyRepository },
            actor,
            tenancyId,
            parsed.data.expectedVersion,
            parsed.data.plannedStart,
            parsed.data.plannedEnd,
          );

          return json({ data: tenancy });
        }

        if (action === 'activate') {
          const parsed = activateTenancyRequestSchema.safeParse(
            await requestJson(request),
          );
          if (!parsed.success) return validationFailure();

          const tenancy = await activateTenancyCommand(
            { tenancyRepository: deps.tenancyRepository },
            actor,
            tenancyId,
            parsed.data.expectedVersion,
            parsed.data.actualStart,
          );

          return json({ data: tenancy });
        }

        if (action === 'give-notice') {
          const parsed = giveTenancyNoticeRequestSchema.safeParse(
            await requestJson(request),
          );
          if (!parsed.success) return validationFailure();

          const tenancy = await giveTenancyNoticeCommand(
            { tenancyRepository: deps.tenancyRepository },
            actor,
            tenancyId,
            parsed.data.expectedVersion,
            parsed.data.noticeGivenAt,
            parsed.data.terminationEffectiveAt,
          );

          return json({ data: tenancy });
        }

        if (action === 'move-out-pending') {
          const parsed = tenancyVersionRequestSchema.safeParse(
            await requestJson(request),
          );
          if (!parsed.success) return validationFailure();

          const tenancy = await markTenancyMoveOutPendingCommand(
            { tenancyRepository: deps.tenancyRepository },
            actor,
            tenancyId,
            parsed.data.expectedVersion,
          );

          return json({ data: tenancy });
        }

        if (action === 'end') {
          const parsed = endTenancyRequestSchema.safeParse(await requestJson(request));
          if (!parsed.success) return validationFailure();

          const tenancy = await endTenancyCommand(
            { tenancyRepository: deps.tenancyRepository },
            actor,
            tenancyId,
            parsed.data.expectedVersion,
            parsed.data.actualEnd,
          );

          return json({ data: tenancy });
        }

        if (action === 'cancel') {
          const parsed = tenancyVersionRequestSchema.safeParse(
            await requestJson(request),
          );
          if (!parsed.success) return validationFailure();

          const tenancy = await cancelTenancyCommand(
            { tenancyRepository: deps.tenancyRepository },
            actor,
            tenancyId,
            parsed.data.expectedVersion,
          );

          return json({ data: tenancy });
        }
      }

      return errorResponse('NOT_FOUND', 'Route not found.', 404);
      }

      if (!identity) {
        return errorResponse('UNAUTHORIZED', 'Authentication is required.', 401);
      }

      const actor = await resolveActor(deps.userAccessRepository, identity);
      const method = request.method.toUpperCase();

      if (method === 'GET' && path === '/properties') {
        const properties = await listPropertiesQuery(deps.portfolioRepository, actor);
        return json({ data: { items: properties } });
      }

      if (method === 'POST' && path === '/properties') {
        const parsed = createPropertyRequestSchema.safeParse(await requestJson(request));
        if (!parsed.success) return validationFailure();

        const input: CreatePropertyCommandInput = {
          code: parsed.data.code,
          name: parsed.data.name,
          propertyType: parsed.data.propertyType,
          street: parsed.data.street,
          houseNumber: parsed.data.houseNumber,
          postalCode: parsed.data.postalCode,
          city: parsed.data.city,
          countryCode: parsed.data.countryCode,
          ...(parsed.data.yearBuilt !== undefined
            ? { yearBuilt: parsed.data.yearBuilt }
            : {}),
        };

        const property = await createPropertyCommand(
          {
            portfolioRepository: deps.portfolioRepository,
            idGenerator: deps.idGenerator,
          },
          actor,
          input,
        );

        return json({ data: property }, 201);
      }

      const propertyMatch = /^\/properties\/([^/]+)$/.exec(path);
      if (method === 'GET' && propertyMatch) {
        const parsedId = entityIdSchema.safeParse(propertyMatch[1]);
        if (!parsedId.success) return validationFailure();

        const property = await getPropertyQuery(
          deps.portfolioRepository,
          actor,
          asPropertyId(parsedId.data),
        );

        if (!property) {
          return errorResponse('PROPERTY_NOT_FOUND', 'Property not found.', 404);
        }

        return json({ data: property });
      }

      const propertyUnitsMatch = /^\/properties\/([^/]+)\/units$/.exec(path);
      if (method === 'GET' && propertyUnitsMatch) {
        const parsedId = entityIdSchema.safeParse(propertyUnitsMatch[1]);
        if (!parsedId.success) return validationFailure();

        const units = await listUnitsByPropertyQuery(
          deps.portfolioRepository,
          actor,
          asPropertyId(parsedId.data),
        );

        return json({ data: { items: units } });
      }

      if (method === 'POST' && path === '/units') {
        const parsed = createUnitRequestSchema.safeParse(await requestJson(request));
        if (!parsed.success) return validationFailure();

        const input: CreateUnitCommandInput = {
          propertyId: asPropertyId(parsed.data.propertyId),
          code: parsed.data.code,
          unitNumber: parsed.data.unitNumber,
          unitType: parsed.data.unitType,
          ...(parsed.data.floor !== undefined ? { floor: parsed.data.floor } : {}),
          ...(parsed.data.areaM2 !== undefined ? { areaM2: parsed.data.areaM2 } : {}),
          ...(parsed.data.rooms !== undefined ? { rooms: parsed.data.rooms } : {}),
          ...(parsed.data.notes !== undefined ? { notes: parsed.data.notes } : {}),
        };

        const unit = await createUnitCommand(
          {
            portfolioRepository: deps.portfolioRepository,
            idGenerator: deps.idGenerator,
          },
          actor,
          input,
        );

        return json({ data: unit }, 201);
      }

      const unitSpacesMatch = /^\/units\/([^/]+)\/spaces$/.exec(path);
      if (method === 'GET' && unitSpacesMatch) {
        const parsedId = entityIdSchema.safeParse(unitSpacesMatch[1]);
        if (!parsedId.success) return validationFailure();

        const spaces = await listSpacesByUnitQuery(
          deps.portfolioRepository,
          actor,
          asUnitId(parsedId.data),
        );

        return json({ data: { items: spaces } });
      }

      if (method === 'POST' && path === '/spaces') {
        const parsed = createSpaceRequestSchema.safeParse(await requestJson(request));
        if (!parsed.success) return validationFailure();

        const input: CreateSpaceCommandInput = {
          unitId: asUnitId(parsed.data.unitId),
          code: parsed.data.code,
          name: parsed.data.name,
          spaceType: parsed.data.spaceType,
          ...(parsed.data.areaM2 !== undefined ? { areaM2: parsed.data.areaM2 } : {}),
          ...(parsed.data.sortOrder !== undefined ? { sortOrder: parsed.data.sortOrder } : {}),
        };

        const space = await createSpaceCommand(
          {
            portfolioRepository: deps.portfolioRepository,
            idGenerator: deps.idGenerator,
          },
          actor,
          input,
        );

        return json({ data: space }, 201);
      }

      if (method === 'GET' && path === '/parties') {
        const parties = await listPartiesQuery(deps.partyRepository, actor);
        return json({ data: { items: parties } });
      }

      if (method === 'POST' && path === '/parties') {
        const parsed = createPartyRequestSchema.safeParse(await requestJson(request));
        if (!parsed.success) return validationFailure();

        const common = {
          code: parsed.data.code,
          ...(parsed.data.displayName !== undefined
            ? { displayName: parsed.data.displayName }
            : {}),
          ...(parsed.data.contactPoints !== undefined
            ? {
                contactPoints: parsed.data.contactPoints.map((contact) => ({
                  contactType: contact.contactType,
                  value: contact.value,
                  ...(contact.label !== undefined ? { label: contact.label } : {}),
                  ...(contact.isPrimary !== undefined
                    ? { isPrimary: contact.isPrimary }
                    : {}),
                })),
              }
            : {}),
          ...(parsed.data.addresses !== undefined
            ? {
                addresses: parsed.data.addresses.map((address) => ({
                  addressType: address.addressType,
                  line1: address.line1,
                  ...(address.line2 !== undefined ? { line2: address.line2 } : {}),
                  postalCode: address.postalCode,
                  city: address.city,
                  ...(address.region !== undefined ? { region: address.region } : {}),
                  countryCode: address.countryCode,
                  ...(address.isPrimary !== undefined
                    ? { isPrimary: address.isPrimary }
                    : {}),
                })),
              }
            : {}),
        };

        const input: CreatePartyCommandInput =
          parsed.data.partyType === 'person'
            ? {
                ...common,
                partyType: 'person',
                firstName: parsed.data.firstName,
                ...(parsed.data.middleName !== undefined
                  ? { middleName: parsed.data.middleName }
                  : {}),
                lastName: parsed.data.lastName,
              }
            : {
                ...common,
                partyType: 'company',
                legalName: parsed.data.legalName,
              };

        const party = await createPartyCommand(
          {
            partyRepository: deps.partyRepository,
            idGenerator: deps.idGenerator,
          },
          actor,
          input,
        );

        return json({ data: party }, 201);
      }

      const partyMatch = /^\/parties\/([^/]+)$/.exec(path);
      if (method === 'GET' && partyMatch) {
        const parsedId = entityIdSchema.safeParse(partyMatch[1]);
        if (!parsedId.success) return validationFailure();

        const party = await getPartyQuery(
          deps.partyRepository,
          actor,
          asPartyId(parsedId.data),
        );

        return json({ data: party });
      }

      const ownershipMatch = /^\/units\/([^/]+)\/ownership-periods$/.exec(path);
      if (ownershipMatch) {
        const parsedUnitId = entityIdSchema.safeParse(ownershipMatch[1]);
        if (!parsedUnitId.success) return validationFailure();
        const unitId = asUnitId(parsedUnitId.data);

        if (method === 'GET') {
          const periods = await listOwnershipPeriodsByUnitQuery(
            {
              portfolioRepository: deps.portfolioRepository,
              ownershipRepository: deps.ownershipRepository,
            },
            actor,
            unitId,
          );

          return json({
            data: {
              items: periods.map(ownershipResponse),
            },
          });
        }

        if (method === 'POST') {
          const parsed = createOwnershipPeriodRequestSchema.safeParse(
            await requestJson(request),
          );
          if (!parsed.success) return validationFailure();

          const input: CreateOwnershipPeriodCommandInput = {
            unitId,
            validFrom: parsed.data.validFrom,
            ...(parsed.data.validTo !== undefined
              ? { validTo: parsed.data.validTo }
              : {}),
            owners: parsed.data.owners.map((owner) => ({
              partyId: asPartyId(owner.partyId),
              shareBasisPoints: Math.round(owner.sharePercent * 100),
            })),
          };

          const period = await createOwnershipPeriodCommand(
            {
              portfolioRepository: deps.portfolioRepository,
              partyRepository: deps.partyRepository,
              ownershipRepository: deps.ownershipRepository,
              idGenerator: deps.idGenerator,
            },
            actor,
            input,
          );

          return json({ data: ownershipResponse(period) }, 201);
        }
      }

      return errorResponse('NOT_FOUND', 'Route not found.', 404);
    } catch (error) {
      if (error instanceof ApplicationError || error instanceof DomainError) {
        return errorResponse(error.code, error.message, errorStatus(error.code));
      }

      deps.onUnexpectedError?.(error);
      return errorResponse('INTERNAL_ERROR', 'An unexpected error occurred.', 500);
    }
  };
}
