import {
  createDocumentCommand,
  finalizeDocumentVersionCommand,
  getDocumentQuery,
  getDocumentVersionContentQuery,
  linkDocumentCommand,
  listDocumentLinksQuery,
  listDocumentsQuery,
  listDocumentVersionsQuery,
  listLeaseAgreementDocumentsQuery,
  listLeaseAmendmentDocumentsQuery,
  listUnitDocumentsQuery,
  uploadDocumentVersionCommand,
  type Actor,
  type ClockPort,
  type DocumentRepository,
  type FileStoragePort,
  type IdGenerator,
  type LeaseRepository,
  type PartyRepository,
  type PortfolioRepository,
  type TenancyRepository,
} from '@portfolio/application';
import {
  createDocumentRequestSchema,
  documentLinkRequestSchema,
  entityIdSchema,
} from '@portfolio/contracts';
import {
  asDocumentId,
  asDocumentVersionId,
  asLeaseAgreementId,
  asLeaseAmendmentId,
  asPartyId,
  asPropertyId,
  asTenancyId,
  asUnitId,
} from '@portfolio/domain';
import {
  json,
  requestJson,
  validationFailure,
} from './http-utils.js';
import {
  toDocumentLinkResponse,
  toDocumentResponse,
  toDocumentVersionResponse,
} from './response-mappers.js';

export interface DocumentHttpDependencies {
  readonly documentRepository: DocumentRepository;
  readonly fileStorage: FileStoragePort;
  readonly clock: ClockPort;
  readonly portfolioRepository: PortfolioRepository;
  readonly partyRepository: PartyRepository;
  readonly tenancyRepository: TenancyRepository;
  readonly leaseRepository: LeaseRepository;
  readonly idGenerator: IdGenerator;
}

function contentDisposition(fileName: string): string {
  const normalized = fileName.replace(/[\r\n]/g, '').trim() || 'document';
  const fallback = normalized
    .replace(/[^\x20-\x7e]/g, '_')
    .replace(/["\\]/g, '_');

  return (
    `attachment; filename="${fallback}"; filename*=UTF-8''` +
    encodeURIComponent(normalized)
  );
}

function binaryResponse(
  version: {
    readonly fileName: string;
    readonly mimeType: string;
    readonly byteSize: number;
  },
  content: Uint8Array,
): Response {
  const copy = new Uint8Array(content.byteLength);
  copy.set(content);

  return new Response(copy.buffer, {
    status: 200,
    headers: {
      'cache-control': 'private, no-store',
      'content-disposition': contentDisposition(version.fileName),
      'content-length': String(version.byteSize),
      'content-type': version.mimeType,
      'x-content-type-options': 'nosniff',
    },
  });
}

export async function handleDocumentHttp(
  deps: DocumentHttpDependencies,
  actor: Actor,
  request: Request,
  path: string,
): Promise<Response | null> {
  const method = request.method.toUpperCase();

  if (path === '/documents') {
    if (method === 'GET') {
      const documents = await listDocumentsQuery(
        deps.documentRepository,
        actor,
      );
      return json({ data: { items: documents.map(toDocumentResponse) } });
    }

    if (method === 'POST') {
      const parsed = createDocumentRequestSchema.safeParse(
        await requestJson(request),
      );
      if (!parsed.success) return validationFailure();

      const document = await createDocumentCommand(
        {
          documentRepository: deps.documentRepository,
          idGenerator: deps.idGenerator,
        },
        actor,
        parsed.data,
      );

      return json({ data: toDocumentResponse(document) }, 201);
    }

    return null;
  }

  const unitDocumentsMatch = /^\/units\/([^/]+)\/documents$/.exec(path);
  if (method === 'GET' && unitDocumentsMatch) {
    const parsedId = entityIdSchema.safeParse(unitDocumentsMatch[1]);
    if (!parsedId.success) return validationFailure();

    const references = await listUnitDocumentsQuery(
      deps.documentRepository,
      deps.portfolioRepository,
      actor,
      asUnitId(parsedId.data),
    );

    return json({
      data: {
        items: references.map((reference) => ({
          document: toDocumentResponse(reference.document),
          link: toDocumentLinkResponse(reference.link),
          linkedVersion:
            reference.linkedVersion === null
              ? null
              : toDocumentVersionResponse(reference.linkedVersion),
        })),
      },
    });
  }

  const agreementDocumentsMatch =
    /^\/agreements\/([^/]+)\/documents$/.exec(path);
  if (method === 'GET' && agreementDocumentsMatch) {
    const parsedId = entityIdSchema.safeParse(agreementDocumentsMatch[1]);
    if (!parsedId.success) return validationFailure();

    const references = await listLeaseAgreementDocumentsQuery(
      deps.documentRepository,
      deps.leaseRepository,
      actor,
      asLeaseAgreementId(parsedId.data),
    );

    return json({
      data: {
        items: references.map((reference) => ({
          document: toDocumentResponse(reference.document),
          link: toDocumentLinkResponse(reference.link),
          linkedVersion:
            reference.linkedVersion === null
              ? null
              : toDocumentVersionResponse(reference.linkedVersion),
        })),
      },
    });
  }

  const amendmentDocumentsMatch =
    /^\/amendments\/([^/]+)\/documents$/.exec(path);
  if (method === 'GET' && amendmentDocumentsMatch) {
    const parsedId = entityIdSchema.safeParse(amendmentDocumentsMatch[1]);
    if (!parsedId.success) return validationFailure();

    const references = await listLeaseAmendmentDocumentsQuery(
      deps.documentRepository,
      deps.leaseRepository,
      actor,
      asLeaseAmendmentId(parsedId.data),
    );

    return json({
      data: {
        items: references.map((reference) => ({
          document: toDocumentResponse(reference.document),
          link: toDocumentLinkResponse(reference.link),
          linkedVersion:
            reference.linkedVersion === null
              ? null
              : toDocumentVersionResponse(reference.linkedVersion),
        })),
      },
    });
  }

  const documentMatch = /^\/documents\/([^/]+)$/.exec(path);
  if (method === 'GET' && documentMatch) {
    const parsedId = entityIdSchema.safeParse(documentMatch[1]);
    if (!parsedId.success) return validationFailure();

    const document = await getDocumentQuery(
      deps.documentRepository,
      actor,
      asDocumentId(parsedId.data),
    );

    return json({ data: toDocumentResponse(document) });
  }

  const versionsMatch = /^\/documents\/([^/]+)\/versions$/.exec(path);
  if (versionsMatch) {
    const parsedId = entityIdSchema.safeParse(versionsMatch[1]);
    if (!parsedId.success) return validationFailure();
    const documentId = asDocumentId(parsedId.data);

    if (method === 'GET') {
      const versions = await listDocumentVersionsQuery(
        deps.documentRepository,
        actor,
        documentId,
      );
      return json({
        data: { items: versions.map(toDocumentVersionResponse) },
      });
    }

    if (method === 'POST') {
      const url = new URL(request.url);
      const fileName = url.searchParams.get('fileName')?.trim();
      const mimeType = request.headers.get('content-type')?.split(';')[0]?.trim();

      if (!fileName || !mimeType) return validationFailure();

      const content = new Uint8Array(await request.arrayBuffer());
      const version = await uploadDocumentVersionCommand(
        {
          documentRepository: deps.documentRepository,
          fileStorage: deps.fileStorage,
          idGenerator: deps.idGenerator,
        },
        actor,
        {
          documentId,
          fileName,
          mimeType,
          content,
        },
      );

      return json({ data: toDocumentVersionResponse(version) }, 201);
    }

    return null;
  }

  const contentMatch = /^\/document-versions\/([^/]+)\/content$/.exec(path);
  if (method === 'GET' && contentMatch) {
    const parsedId = entityIdSchema.safeParse(contentMatch[1]);
    if (!parsedId.success) return validationFailure();

    const result = await getDocumentVersionContentQuery(
      {
        documentRepository: deps.documentRepository,
        fileStorage: deps.fileStorage,
      },
      actor,
      asDocumentVersionId(parsedId.data),
    );

    return binaryResponse(result.version, result.content);
  }

  const finalizeMatch = /^\/document-versions\/([^/]+)\/finalize$/.exec(path);
  if (method === 'POST' && finalizeMatch) {
    const parsedId = entityIdSchema.safeParse(finalizeMatch[1]);
    if (!parsedId.success) return validationFailure();

    const version = await finalizeDocumentVersionCommand(
      {
        documentRepository: deps.documentRepository,
        fileStorage: deps.fileStorage,
        clock: deps.clock,
      },
      actor,
      asDocumentVersionId(parsedId.data),
    );

    return json({ data: toDocumentVersionResponse(version) });
  }

  const linksMatch = /^\/documents\/([^/]+)\/links$/.exec(path);
  if (linksMatch) {
    const parsedId = entityIdSchema.safeParse(linksMatch[1]);
    if (!parsedId.success) return validationFailure();
    const documentId = asDocumentId(parsedId.data);

    if (method === 'GET') {
      const links = await listDocumentLinksQuery(
        deps.documentRepository,
        actor,
        documentId,
      );
      return json({ data: { items: links.map(toDocumentLinkResponse) } });
    }

    if (method === 'POST') {
      const parsed = documentLinkRequestSchema.safeParse(
        await requestJson(request),
      );
      if (!parsed.success) return validationFailure();

      const common = {
        documentId,
        ...(parsed.data.documentVersionId !== undefined
          ? {
              documentVersionId:
                parsed.data.documentVersionId === null
                  ? null
                  : asDocumentVersionId(parsed.data.documentVersionId),
            }
          : {}),
        relation: parsed.data.relation,
      };

      const target =
        parsed.data.targetType === 'property'
          ? { targetType: 'property' as const, targetId: asPropertyId(parsed.data.targetId) }
          : parsed.data.targetType === 'unit'
            ? { targetType: 'unit' as const, targetId: asUnitId(parsed.data.targetId) }
            : parsed.data.targetType === 'party'
              ? { targetType: 'party' as const, targetId: asPartyId(parsed.data.targetId) }
              : parsed.data.targetType === 'tenancy'
                ? { targetType: 'tenancy' as const, targetId: asTenancyId(parsed.data.targetId) }
                : parsed.data.targetType === 'lease_agreement'
                  ? {
                      targetType: 'lease_agreement' as const,
                      targetId: asLeaseAgreementId(parsed.data.targetId),
                    }
                  : {
                      targetType: 'lease_amendment' as const,
                      targetId: asLeaseAmendmentId(parsed.data.targetId),
                    };

      const link = await linkDocumentCommand(
        {
          documentRepository: deps.documentRepository,
          portfolioRepository: deps.portfolioRepository,
          partyRepository: deps.partyRepository,
          tenancyRepository: deps.tenancyRepository,
          leaseRepository: deps.leaseRepository,
          idGenerator: deps.idGenerator,
        },
        actor,
        { ...common, ...target },
      );

      return json({ data: toDocumentLinkResponse(link) }, 201);
    }

    return null;
  }

  return null;
}
