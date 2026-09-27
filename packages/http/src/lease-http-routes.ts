import {
  ApplicationError,
  cancelLeaseAgreementCommand,
  cancelLeaseAmendmentCommand,
  createLeaseAgreementCommand,
  createLeaseAmendmentCommand,
  getEffectiveTenancyTermsQuery,
  getLeaseAgreementQuery,
  getLuzernerLeaseFormQuery,
  generateLuzernerLeaseFinalDocumentCommand,
  listLeaseAgreementsByTenancyQuery,
  renderLuzernerLeasePdfCommand,
  listLeaseAmendmentsByAgreementQuery,
  saveLuzernerLeaseFormCommand,
  signLeaseAgreementCommand,
  signLeaseAmendmentCommand,
  type Actor,
  type CreateLeaseAgreementCommandInput,
  type ClockPort,
  type CreateLeaseAmendmentCommandInput,
  type DocumentRepository,
  type FileStorageWritePort,
  type IdGenerator,
  type LeaseRepository,
  type LuzernerLeasePdfPort,
  type PartyRepository,
  type PortfolioRepository,
  type TenancyRepository,
} from '@portfolio/application';
import {
  contractVersionRequestSchema,
  createLeaseAgreementRequestSchema,
  createLeaseAmendmentRequestSchema,
  entityIdSchema,
  leaseTermsRequestSchema,
  putLuzernerLeaseFormRequestSchema,
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
import {
  json,
  requestJson,
  validationFailure,
} from './http-utils.js';
import {
  toDocumentVersionResponse,
  toLeaseAgreementResponse,
  toLeaseAmendmentResponse,
  toTenancyTermVersionResponse,
} from './response-mappers.js';

export interface LeaseHttpDependencies {
  readonly leaseRepository: LeaseRepository;
  readonly tenancyRepository: TenancyRepository;
  readonly partyRepository: PartyRepository;
  readonly portfolioRepository: PortfolioRepository;
  readonly documentRepository: DocumentRepository;
  readonly fileStorage: FileStorageWritePort;
  readonly clock: ClockPort;
  readonly luzernerLeasePdfPort?: LuzernerLeasePdfPort;
  readonly idGenerator: IdGenerator;
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
    if (!parsedTenancyId.success) return validationFailure();
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

      return json({ data: { items: agreements.map(toLeaseAgreementResponse) } });
    }

    if (method === 'POST') {
      const body = await requestJson(request);
      const parsed = createLeaseAgreementRequestSchema.safeParse(body);
      if (!parsed.success) return validationFailure();

      const input: CreateLeaseAgreementCommandInput = {
        tenancyId,
        code: parsed.data.code,
        agreementType: parsed.data.agreementType,
        ...(parsed.data.predecessorAgreementId !== undefined
          ? { predecessorAgreementId: asLeaseAgreementId(parsed.data.predecessorAgreementId) }
          : {}),
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

      return json({ data: toLeaseAgreementResponse(agreement) }, 201);
    }

    return null;
  }

  const tenancyTermsMatch = /^\/tenancies\/([^/]+)\/terms$/.exec(path);
  if (method === 'GET' && tenancyTermsMatch) {
    const parsedTenancyId = entityIdSchema.safeParse(tenancyTermsMatch[1]);
    if (!parsedTenancyId.success) return validationFailure();

    const at = new URL(request.url).searchParams.get('at');
    if (!at) return validationFailure();

    const terms = await getEffectiveTenancyTermsQuery(
      {
        leaseRepository: deps.leaseRepository,
        tenancyRepository: deps.tenancyRepository,
      },
      actor,
      asTenancyId(parsedTenancyId.data),
      at,
    );

    return json({ data: toTenancyTermVersionResponse(terms) });
  }


  const luzernerPdfMatch =
    /^\/agreements\/([^/]+)\/luzerner-form\/pdf$/.exec(path);
  if (method === 'GET' && luzernerPdfMatch) {
    const parsedId = entityIdSchema.safeParse(luzernerPdfMatch[1]);
    if (!parsedId.success) return validationFailure();

    if (!deps.luzernerLeasePdfPort) {
      throw new ApplicationError(
        'LUZERNER_PDF_RENDERER_UNAVAILABLE',
        'Luzerner PDF rendering is not configured.',
      );
    }

    const rendered = await renderLuzernerLeasePdfCommand(
      {
        leaseRepository: deps.leaseRepository,
        tenancyRepository: deps.tenancyRepository,
        portfolioRepository: deps.portfolioRepository,
        partyRepository: deps.partyRepository,
        luzernerLeasePdfPort: deps.luzernerLeasePdfPort,
      },
      actor,
      asLeaseAgreementId(parsedId.data),
    );

    const copy = new Uint8Array(rendered.content.byteLength);
    copy.set(rendered.content);

    return new Response(copy.buffer, {
      status: 200,
      headers: {
        'cache-control': 'private, no-store',
        'content-disposition': `inline; filename="${rendered.fileName}"`,
        'content-length': String(copy.byteLength),
        'content-type': 'application/pdf',
        'x-content-type-options': 'nosniff',
      },
    });
  }

  const luzernerFinalDocumentMatch =
    /^\/agreements\/([^/]+)\/luzerner-form\/final-document$/.exec(path);
  if (method === 'POST' && luzernerFinalDocumentMatch) {
    const parsedId = entityIdSchema.safeParse(luzernerFinalDocumentMatch[1]);
    if (!parsedId.success) return validationFailure();

    if (!deps.luzernerLeasePdfPort) {
      throw new ApplicationError(
        'LUZERNER_PDF_RENDERER_UNAVAILABLE',
        'Luzerner PDF rendering is not configured.',
      );
    }

    const version = await generateLuzernerLeaseFinalDocumentCommand(
      {
        leaseRepository: deps.leaseRepository,
        tenancyRepository: deps.tenancyRepository,
        portfolioRepository: deps.portfolioRepository,
        partyRepository: deps.partyRepository,
        documentRepository: deps.documentRepository,
        fileStorage: deps.fileStorage,
        luzernerLeasePdfPort: deps.luzernerLeasePdfPort,
        idGenerator: deps.idGenerator,
        clock: deps.clock,
      },
      actor,
      asLeaseAgreementId(parsedId.data),
    );

    return json({ data: toDocumentVersionResponse(version) });
  }

  const luzernerFormMatch =
    /^\/agreements\/([^/]+)\/luzerner-form$/.exec(path);
  if (luzernerFormMatch) {
    const parsedId = entityIdSchema.safeParse(luzernerFormMatch[1]);
    if (!parsedId.success) return validationFailure();
    const agreementId = asLeaseAgreementId(parsedId.data);

    if (method === 'GET') {
      const form = await getLuzernerLeaseFormQuery(
        deps.leaseRepository,
        actor,
        agreementId,
      );
      return json({ data: form });
    }

    if (method === 'PUT') {
      const body = await requestJson(request);
      const parsed = putLuzernerLeaseFormRequestSchema.safeParse(body);
      if (!parsed.success) return validationFailure();

      const form = await saveLuzernerLeaseFormCommand(
        deps.leaseRepository,
        actor,
        agreementId,
        parsed.data.expectedRevision,
        parsed.data.content,
      );
      return json({ data: form });
    }

    return null;
  }

  const agreementMatch = /^\/agreements\/([^/]+)$/.exec(path);
  if (method === 'GET' && agreementMatch) {
    const parsedId = entityIdSchema.safeParse(agreementMatch[1]);
    if (!parsedId.success) return validationFailure();

    const agreement = await getLeaseAgreementQuery(
      deps.leaseRepository,
      actor,
      asLeaseAgreementId(parsedId.data),
    );

    return json({ data: toLeaseAgreementResponse(agreement) });
  }

  const agreementSignMatch = /^\/agreements\/([^/]+)\/sign$/.exec(path);
  if (method === 'POST' && agreementSignMatch) {
    const parsedId = entityIdSchema.safeParse(agreementSignMatch[1]);
    if (!parsedId.success) return validationFailure();

    const body = await requestJson(request);
    const parsed = signLeaseAgreementRequestSchema.safeParse(body);
    if (!parsed.success) return validationFailure();

    if (!deps.luzernerLeasePdfPort) {
      throw new ApplicationError(
        'LUZERNER_PDF_RENDERER_UNAVAILABLE',
        'Luzerner PDF rendering is not configured.',
      );
    }

    const agreement = await signLeaseAgreementCommand(
      {
        leaseRepository: deps.leaseRepository,
        tenancyRepository: deps.tenancyRepository,
        partyRepository: deps.partyRepository,
        portfolioRepository: deps.portfolioRepository,
        luzernerLeasePdfPort: deps.luzernerLeasePdfPort,
        idGenerator: deps.idGenerator,
      },
      actor,
      asLeaseAgreementId(parsedId.data),
      parsed.data.expectedVersion,
      parsed.data.signedAt,
      mapTerms(parsed.data.terms),
    );

    return json({ data: toLeaseAgreementResponse(agreement) });
  }

  const agreementCancelMatch = /^\/agreements\/([^/]+)\/cancel$/.exec(path);
  if (method === 'POST' && agreementCancelMatch) {
    const parsedId = entityIdSchema.safeParse(agreementCancelMatch[1]);
    if (!parsedId.success) return validationFailure();

    const body = await requestJson(request);
    const parsed = contractVersionRequestSchema.safeParse(body);
    if (!parsed.success) return validationFailure();

    const agreement = await cancelLeaseAgreementCommand(
      { leaseRepository: deps.leaseRepository },
      actor,
      asLeaseAgreementId(parsedId.data),
      parsed.data.expectedVersion,
    );

    return json({ data: toLeaseAgreementResponse(agreement) });
  }

  const amendmentsMatch = /^\/agreements\/([^/]+)\/amendments$/.exec(path);
  if (amendmentsMatch) {
    const parsedAgreementId = entityIdSchema.safeParse(amendmentsMatch[1]);
    if (!parsedAgreementId.success) return validationFailure();
    const agreementId = asLeaseAgreementId(parsedAgreementId.data);

    if (method === 'GET') {
      const amendments = await listLeaseAmendmentsByAgreementQuery(
        deps.leaseRepository,
        actor,
        agreementId,
      );
      return json({ data: { items: amendments.map(toLeaseAmendmentResponse) } });
    }

    if (method === 'POST') {
      const body = await requestJson(request);
      const parsed = createLeaseAmendmentRequestSchema.safeParse(body);
      if (!parsed.success) return validationFailure();

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

      return json({ data: toLeaseAmendmentResponse(amendment) }, 201);
    }

    return null;
  }

  const amendmentSignMatch = /^\/amendments\/([^/]+)\/sign$/.exec(path);
  if (method === 'POST' && amendmentSignMatch) {
    const parsedId = entityIdSchema.safeParse(amendmentSignMatch[1]);
    if (!parsedId.success) return validationFailure();

    const body = await requestJson(request);
    const parsed = signLeaseAmendmentRequestSchema.safeParse(body);
    if (!parsed.success) return validationFailure();

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

    return json({ data: toLeaseAmendmentResponse(amendment) });
  }

  const amendmentCancelMatch = /^\/amendments\/([^/]+)\/cancel$/.exec(path);
  if (method === 'POST' && amendmentCancelMatch) {
    const parsedId = entityIdSchema.safeParse(amendmentCancelMatch[1]);
    if (!parsedId.success) return validationFailure();

    const body = await requestJson(request);
    const parsed = contractVersionRequestSchema.safeParse(body);
    if (!parsed.success) return validationFailure();

    const amendment = await cancelLeaseAmendmentCommand(
      { leaseRepository: deps.leaseRepository },
      actor,
      asLeaseAmendmentId(parsedId.data),
      parsed.data.expectedVersion,
    );

    return json({ data: toLeaseAmendmentResponse(amendment) });
  }

  return null;
}
