import {
  createOwnershipPeriodCommand,
  listOwnershipPeriodsByUnitQuery,
  type Actor,
  type CreateOwnershipPeriodCommandInput,
  type IdGenerator,
  type OwnershipRepository,
  type PartyRepository,
  type PortfolioRepository,
} from '@portfolio/application';
import {
  createOwnershipPeriodRequestSchema,
  entityIdSchema,
} from '@portfolio/contracts';
import {
  asPartyId,
  asUnitId,
} from '@portfolio/domain';
import {
  json,
  requestJson,
  validationFailure,
} from './http-utils.js';
import { toOwnershipPeriodResponse } from './response-mappers.js';

export interface OwnershipHttpDependencies {
  readonly portfolioRepository: PortfolioRepository;
  readonly partyRepository: PartyRepository;
  readonly ownershipRepository: OwnershipRepository;
  readonly idGenerator: IdGenerator;
}

export async function handleOwnershipHttp(
  deps: OwnershipHttpDependencies,
  actor: Actor,
  request: Request,
  path: string,
): Promise<Response | null> {
  const ownershipMatch = /^\/units\/([^/]+)\/ownership-periods$/.exec(path);
  if (!ownershipMatch) return null;

  const parsedUnitId = entityIdSchema.safeParse(ownershipMatch[1]);
  if (!parsedUnitId.success) return validationFailure();
  const unitId = asUnitId(parsedUnitId.data);

  const method = request.method.toUpperCase();

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
      data: { items: periods.map(toOwnershipPeriodResponse) },
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

    return json({ data: toOwnershipPeriodResponse(period) }, 201);
  }

  return null;
}
