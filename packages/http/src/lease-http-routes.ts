import {
  cancelLeaseAgreementCommand,
  cancelLeaseAmendmentCommand,
  createLeaseAgreementCommand,
  createLeaseAmendmentCommand,
  getEffectiveTenancyTermsQuery,
  getLeaseAgreementQuery,
  listLeaseAgreementsByTenancyQuery,
  listLeaseAmendmentsByAgreementQuery,
  signLeaseAgreementCommand,
  signLeaseAmendmentCommand,
  type Actor,
  type CreateLeaseAgreementCommandInput,
  type CreateLeaseAmendmentCommandInput,
  type IdGenerator,
  type LeaseRepository,
  type PartyRepository,
  type TenancyRepository,
} from '@portfolio/application';
import {
  contractVersionRequestSchema,
  createLeaseAgreementRequestSchema,
  createLeaseAmendmentRequestSchema,
  entityIdSchema,
  leaseTermsRequestSchema,
  signLeaseAgreementRequestSchema,
  signLeaseAmendmentRequestSchema,
} from '@portfolio/contracts';
import {
  asLeaseAgreementId,
  asLeaseAmendmentId,
  asPartyId,
  asTenancyId,
  type TermSnapshotInput,
} from '@portfolio/domain';

export interface LeaseHttpDependencies {
  readonly leaseRepository: LeaseRepository;
  readonly tenancyRepository: TenancyRepository;
  readonly partyRepository: PartyRepository;
  readonly idGenerator: IdGenerator;
}

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: JSON_HEADERS,
  });
}

async function requestJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return Symbol.for('invalid-json');
  }
}

function invalidRequest(): Response {
  return json(
    { error: { code: 'INVALID_REQUEST', message: 'Request payload is invalid.' } },
    400,
  );
}

function mapTerms(input: ReturnType<typeof leaseTermsRequestSchema.parse>): TermSnapshotInput {
  return {
    currency: input.currency,
    baseRent: input.baseRent,
    ...(input.serviceCharge !== undefined
      ? { serviceCharge: input.serviceCharge }
      : {}),
    ...(input.utilitiesAdvance !== undefined
      ? { utilitiesAdvance: input.utilitiesAdvance }
      : {}),
    ...(input.parkingRent !== undefined
      ? { parkingRent: input.parkingRent }
      : {}),
    ...(input.otherRecurringCharge !== undefined
      ? { otherRecurringCharge: input.otherRecurringCharge }
      : {}),
    ...(input.depositRequired !== undefined
      ? { depositRequired: input.depositRequired }
      : {}),
    ...(input.billingFrequency !== undefined
      ? { billingFrequency: input.billingFrequency }
      : {}),
    ...(input.noticePeriodTenantDays !== undefined
      ? { noticePeriodTenantDays: input.noticePeriodTenantDays }
      : {}),
    ...(input.noticePeriodLandlordDays !== undefined
      ? { noticePeriodLandlordDays: input.noticePeriodLandlordDays }
      : {}),
  };
}

export async function handleLeaseHttp(
  deps: LeaseHttpDependencies,
  actor: Actor,
  request: Request,
  path: string,
): Promise<Response | null> {
  const method = request.method.toUpperCase();

  const tenancyAgreementsMatch = /^\/tenancies\/([^/]+)\/agreements$/.exec(path);
  if (tenancyAgreementsMatch) {
    const parsedTenancyId = entityIdSchema.safeParse(tenancyAgreementsMatch[1]);
    if (!parsedTenancyId.success) return invalidRequest();
    const tenancyId = asTenancyId(parsedTenancyId.data);

    if (method === 'GET') {
      const agreements = await listLeaseAgreementsByTenancyQuery(
        {
          leaseRepository: deps.leaseRepository,
          tenancyRepository: deps.tenancyRepository,
        },
        actor,
        tenancyId,
      );

      return json({ data: { items: agreements } });
    }

    if (method === 'POST') {
      const body = await requestJson(request);
      if (typeof body === 'symbol') return invalidRequest();

      const parsed = createLeaseAgreementRequestSchema.safeParse(body);
      if (!parsed.success) return invalidRequest();

      const input: CreateLeaseAgreementCommandInput = {
        tenancyId,
        code: parsed.data.code,
        agreementType: parsed.data.agreementType,
        effectiveFrom: parsed.data.effectiveFrom,
        ...(parsed.data.effectiveTo !== undefined
          ? { effectiveTo: parsed.data.effectiveTo }
          : {}),
        parties: parsed.data.parties.map((party) => ({
          partyId: asPartyId(party.partyId),
          role: party.role,
        })),
      };

      const agreement = await createLeaseAgreementCommand(
        {
          leaseRepository: deps.leaseRepository,
          tenancyRepository: deps.tenancyRepository,
          partyRepository: deps.partyRepository,
          idGenerator: deps.idGenerator,
        },
        actor,
        input,
      );

      return json({ data: agreement }, 201);
    }

    return null;
  }

  const tenancyTermsMatch = /^\/tenancies\/([^/]+)\/terms$/.exec(path);
  if (method === 'GET' && tenancyTermsMatch) {
    const parsedTenancyId = entityIdSchema.safeParse(tenancyTermsMatch[1]);
    if (!parsedTenancyId.success) return invalidRequest();

    const at = new URL(request.url).searchParams.get('at');
    if (!at) return invalidRequest();

    const terms = await getEffectiveTenancyTermsQuery(
      {
        leaseRepository: deps.leaseRepository,
        tenancyRepository: deps.tenancyRepository,
      },
      actor,
      asTenancyId(parsedTenancyId.data),
      at,
    );

    return json({ data: terms });
  }

  const agreementMatch = /^\/agreements\/([^/]+)$/.exec(path);
  if (method === 'GET' && agreementMatch) {
    const parsedId = entityIdSchema.safeParse(agreementMatch[1]);
    if (!parsedId.success) return invalidRequest();

    const agreement = await getLeaseAgreementQuery(
      deps.leaseRepository,
      actor,
      asLeaseAgreementId(parsedId.data),
    );

    return json({ data: agreement });
  }

  const agreementSignMatch = /^\/agreements\/([^/]+)\/sign$/.exec(path);
  if (method === 'POST' && agreementSignMatch) {
    const parsedId = entityIdSchema.safeParse(agreementSignMatch[1]);
    if (!parsedId.success) return invalidRequest();

    const body = await requestJson(request);
    if (typeof body === 'symbol') return invalidRequest();

    const parsed = signLeaseAgreementRequestSchema.safeParse(body);
    if (!parsed.success) return invalidRequest();

    const agreement = await signLeaseAgreementCommand(
      {
        leaseRepository: deps.leaseRepository,
        tenancyRepository: deps.tenancyRepository,
        partyRepository: deps.partyRepository,
        idGenerator: deps.idGenerator,
      },
      actor,
      asLeaseAgreementId(parsedId.data),
      parsed.data.expectedVersion,
      parsed.data.signedAt,
      mapTerms(parsed.data.terms),
    );

    return json({ data: agreement });
  }

  const agreementCancelMatch = /^\/agreements\/([^/]+)\/cancel$/.exec(path);
  if (method === 'POST' && agreementCancelMatch) {
    const parsedId = entityIdSchema.safeParse(agreementCancelMatch[1]);
    if (!parsedId.success) return invalidRequest();

    const body = await requestJson(request);
    if (typeof body === 'symbol') return invalidRequest();

    const parsed = contractVersionRequestSchema.safeParse(body);
    if (!parsed.success) return invalidRequest();

    const agreement = await cancelLeaseAgreementCommand(
      { leaseRepository: deps.leaseRepository },
      actor,
      asLeaseAgreementId(parsedId.data),
      parsed.data.expectedVersion,
    );

    return json({ data: agreement });
  }

  const amendmentsMatch = /^\/agreements\/([^/]+)\/amendments$/.exec(path);
  if (amendmentsMatch) {
    const parsedAgreementId = entityIdSchema.safeParse(amendmentsMatch[1]);
    if (!parsedAgreementId.success) return invalidRequest();
    const agreementId = asLeaseAgreementId(parsedAgreementId.data);

    if (method === 'GET') {
      const amendments = await listLeaseAmendmentsByAgreementQuery(
        deps.leaseRepository,
        actor,
        agreementId,
      );
      return json({ data: { items: amendments } });
    }

    if (method === 'POST') {
      const body = await requestJson(request);
      if (typeof body === 'symbol') return invalidRequest();

      const parsed = createLeaseAmendmentRequestSchema.safeParse(body);
      if (!parsed.success) return invalidRequest();

      const input: CreateLeaseAmendmentCommandInput = {
        agreementId,
        code: parsed.data.code,
        title: parsed.data.title,
        ...(parsed.data.description !== undefined
          ? { description: parsed.data.description }
          : {}),
        effectiveFrom: parsed.data.effectiveFrom,
      };

      const amendment = await createLeaseAmendmentCommand(
        {
          leaseRepository: deps.leaseRepository,
          idGenerator: deps.idGenerator,
        },
        actor,
        input,
      );

      return json({ data: amendment }, 201);
    }

    return null;
  }

  const amendmentSignMatch = /^\/amendments\/([^/]+)\/sign$/.exec(path);
  if (method === 'POST' && amendmentSignMatch) {
    const parsedId = entityIdSchema.safeParse(amendmentSignMatch[1]);
    if (!parsedId.success) return invalidRequest();

    const body = await requestJson(request);
    if (typeof body === 'symbol') return invalidRequest();

    const parsed = signLeaseAmendmentRequestSchema.safeParse(body);
    if (!parsed.success) return invalidRequest();

    const amendment = await signLeaseAmendmentCommand(
      {
        leaseRepository: deps.leaseRepository,
        tenancyRepository: deps.tenancyRepository,
        idGenerator: deps.idGenerator,
      },
      actor,
      asLeaseAmendmentId(parsedId.data),
      parsed.data.expectedVersion,
      parsed.data.signedAt,
      mapTerms(parsed.data.terms),
    );

    return json({ data: amendment });
  }

  const amendmentCancelMatch = /^\/amendments\/([^/]+)\/cancel$/.exec(path);
  if (method === 'POST' && amendmentCancelMatch) {
    const parsedId = entityIdSchema.safeParse(amendmentCancelMatch[1]);
    if (!parsedId.success) return invalidRequest();

    const body = await requestJson(request);
    if (typeof body === 'symbol') return invalidRequest();

    const parsed = contractVersionRequestSchema.safeParse(body);
    if (!parsed.success) return invalidRequest();

    const amendment = await cancelLeaseAmendmentCommand(
      { leaseRepository: deps.leaseRepository },
      actor,
      asLeaseAmendmentId(parsedId.data),
      parsed.data.expectedVersion,
    );

    return json({ data: amendment });
  }

  return null;
}
