import {
  ApplicationError,
  createPropertyCommand,
  createSpaceCommand,
  createUnitCommand,
  getPropertyQuery,
  listPropertiesQuery,
  listSpacesByUnitQuery,
  listUnitsByPropertyQuery,
  resolveActor,
  type CreatePropertyCommandInput,
  type CreateSpaceCommandInput,
  type CreateUnitCommandInput,
  type IdGenerator,
  type PortfolioRepository,
  type UserAccessRepository,
  type VerifiedIdentity,
} from '@portfolio/application';
import {
  createPropertyRequestSchema,
  createSpaceRequestSchema,
  createUnitRequestSchema,
  entityIdSchema,
} from '@portfolio/contracts';
import {
  DomainError,
  asPropertyId,
  asUnitId,
} from '@portfolio/domain';

export interface PortfolioHttpDependencies {
  readonly portfolioRepository: PortfolioRepository;
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
  if (code.endsWith('_ALREADY_EXISTS')) return 409;
  return 422;
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
