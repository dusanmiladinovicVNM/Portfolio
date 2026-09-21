import {
  createPartyCommand,
  getPartyQuery,
  listPartiesByIdsQuery,
  listPartiesQuery,
  type Actor,
  type CreatePartyCommandInput,
  type IdGenerator,
  type PartyRepository,
} from '@portfolio/application';
import {
  createPartyRequestSchema,
  entityIdSchema,
  partyIdsQuerySchema,
} from '@portfolio/contracts';
import { asPartyId } from '@portfolio/domain';
import {
  json,
  requestJson,
  validationFailure,
} from './http-utils.js';
import { toPartyResponse } from './response-mappers.js';

export interface PartyHttpDependencies {
  readonly partyRepository: PartyRepository;
  readonly idGenerator: IdGenerator;
}

export async function handlePartyHttp(
  deps: PartyHttpDependencies,
  actor: Actor,
  request: Request,
  path: string,
): Promise<Response | null> {
  const method = request.method.toUpperCase();

  if (method === 'GET' && path === '/parties') {
    const requestedIds = new URL(request.url).searchParams.getAll('id');

    if (requestedIds.length > 0) {
      const parsed = partyIdsQuerySchema.safeParse({ ids: requestedIds });
      if (!parsed.success) return validationFailure();

      const parties = await listPartiesByIdsQuery(
        deps.partyRepository,
        actor,
        parsed.data.ids.map(asPartyId),
      );

      return json({
        data: { items: parties.map(toPartyResponse) },
      });
    }

    const parties = await listPartiesQuery(deps.partyRepository, actor);
    return json({
      data: { items: parties.map(toPartyResponse) },
    });
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

    return json({ data: toPartyResponse(party) }, 201);
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

    return json({ data: toPartyResponse(party) });
  }

  return null;
}
