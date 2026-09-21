import {
  createPropertyCommand,
  createSpaceCommand,
  createUnitCommand,
  getPropertyQuery,
  getUnitQuery,
  listPropertiesQuery,
  listSpacesByUnitQuery,
  listUnitsByPropertyQuery,
  type Actor,
  type CreatePropertyCommandInput,
  type CreateSpaceCommandInput,
  type CreateUnitCommandInput,
  type IdGenerator,
  type PortfolioRepository,
} from '@portfolio/application';
import {
  createPropertyRequestSchema,
  createSpaceRequestSchema,
  createUnitRequestSchema,
  entityIdSchema,
} from '@portfolio/contracts';
import {
  asPropertyId,
  asUnitId,
} from '@portfolio/domain';
import {
  json,
  requestJson,
  validationFailure,
} from './http-utils.js';
import {
  toPropertyResponse,
  toSpaceResponse,
  toUnitResponse,
} from './response-mappers.js';

export interface PortfolioRoutesDependencies {
  readonly portfolioRepository: PortfolioRepository;
  readonly idGenerator: IdGenerator;
}

export async function handlePortfolioHttp(
  deps: PortfolioRoutesDependencies,
  actor: Actor,
  request: Request,
  path: string,
): Promise<Response | null> {
  const method = request.method.toUpperCase();

  if (method === 'GET' && path === '/properties') {
    const properties = await listPropertiesQuery(deps.portfolioRepository, actor);
    return json({
      data: { items: properties.map(toPropertyResponse) },
    });
  }

  if (method === 'POST' && path === '/properties') {
    const parsed = createPropertyRequestSchema.safeParse(
      await requestJson(request),
    );
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

    return json({ data: toPropertyResponse(property) }, 201);
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
      return json(
        { error: { code: 'PROPERTY_NOT_FOUND', message: 'Property not found.' } },
        404,
      );
    }

    return json({ data: toPropertyResponse(property) });
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

    return json({
      data: { items: units.map(toUnitResponse) },
    });
  }

  const unitMatch = /^\/units\/([^/]+)$/.exec(path);
  if (method === 'GET' && unitMatch) {
    const parsedId = entityIdSchema.safeParse(unitMatch[1]);
    if (!parsedId.success) return validationFailure();

    const unit = await getUnitQuery(
      deps.portfolioRepository,
      actor,
      asUnitId(parsedId.data),
    );

    if (!unit) {
      return json(
        { error: { code: 'UNIT_NOT_FOUND', message: 'Unit not found.' } },
        404,
      );
    }

    return json({ data: toUnitResponse(unit) });
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

    return json({ data: toUnitResponse(unit) }, 201);
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

    return json({
      data: { items: spaces.map(toSpaceResponse) },
    });
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
      ...(parsed.data.sortOrder !== undefined
        ? { sortOrder: parsed.data.sortOrder }
        : {}),
    };

    const space = await createSpaceCommand(
      {
        portfolioRepository: deps.portfolioRepository,
        idGenerator: deps.idGenerator,
      },
      actor,
      input,
    );

    return json({ data: toSpaceResponse(space) }, 201);
  }

  return null;
}
