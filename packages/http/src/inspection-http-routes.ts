import {
  addInspectionSignatureCommand,
  ApplicationError,
  attachInspectionEvidenceCommand,
  cancelInspectionCommand,
  createInspectionCommand,
  DEFAULT_BUFFERED_DOCUMENT_BINARY_POLICY,
  createInspectionFindingCommand,
  createInspectionSchemaVersionCommand,
  getInspectionBundleQuery,
  finalizeInspectionCommand,
  generateInspectionFinalReportCommand,
  getInspectionSchemaVersionQuery,
  listInspectionSchemaVersionsQuery,
  listInspectionsByUnitQuery,
  listAssignedInspectionsQuery,
  listAssignableInspectionStaffQuery,
  lockInspectionCommand,
  publishInspectionSchemaVersionCommand,
  saveInspectionSectionCommand,
  startInspectionCommand,
  unlockInspectionCommand,
  updateInspectionOrchestrationCommand,
  uploadInspectionBinaryCommand,
  type Actor,
  type ClockPort,
  type IdGenerator,
  type DocumentRepository,
  type FileStoragePort,
  type InspectionRepository,
  type OwnershipRepository,
  type PartyRepository,
  type PdfPort,
  type PortfolioRepository,
  type StaffDirectoryRepository,
  type TenancyRepository,
} from '@portfolio/application';
import {
  addInspectionSignatureRequestSchema,
  attachInspectionEvidenceRequestSchema,
  createInspectionFindingRequestSchema,
  createInspectionRequestSchema,
  createInspectionSchemaVersionRequestSchema,
  entityIdSchema,
  expectedInspectionVersionRequestSchema,
  finalizeInspectionRequestSchema,
  inspectionBinaryPurposeSchema,
  saveInspectionSectionRequestSchema,
  unlockInspectionRequestSchema,
  updateInspectionOrchestrationRequestSchema,
} from '@portfolio/contracts';
import {
  asInspectionId,
  asInspectionSchemaSectionId,
  asInspectionSchemaVersionId,
  asTenancyId,
  asUnitId,
  asUserId,
} from '@portfolio/domain';
import { json, requestJson, validationFailure } from './http-utils.js';
import {
  toInspectionEvidenceResponse,
  toInspectionFindingResponse,
  toInspectionFinalSnapshotResponse,
  toInspectionItemResponse,
  toInspectionResponse,
  toInspectionSchemaVersionResponse,
  toInspectionSignatureResponse,
  toDocumentVersionResponse,
} from './response-mappers.js';

export interface InspectionHttpDependencies {
  readonly inspectionRepository: InspectionRepository;
  readonly documentRepository: DocumentRepository;
  readonly fileStorage: FileStoragePort;
  readonly partyRepository: PartyRepository;
  readonly ownershipRepository: OwnershipRepository;
  readonly portfolioRepository: PortfolioRepository;
  readonly tenancyRepository: TenancyRepository;
  readonly staffDirectoryRepository: StaffDirectoryRepository;
  readonly idGenerator: IdGenerator;
  readonly clock: ClockPort;
  readonly pdfPort: PdfPort;
}

export async function handleInspectionHttp(
  deps: InspectionHttpDependencies,
  actor: Actor,
  request: Request,
  path: string,
): Promise<Response | null> {
  const method = request.method.toUpperCase();

  if (path === '/inspection-schemas') {
    if (method === 'GET') {
      const schemas = await listInspectionSchemaVersionsQuery(
        deps.inspectionRepository,
        actor,
      );
      return json({
        data: { items: schemas.map(toInspectionSchemaVersionResponse) },
      });
    }

    if (method === 'POST') {
      const parsed = createInspectionSchemaVersionRequestSchema.safeParse(
        await requestJson(request),
      );
      if (!parsed.success) return validationFailure();

      const schema = await createInspectionSchemaVersionCommand(
        {
          inspectionRepository: deps.inspectionRepository,
          idGenerator: deps.idGenerator,
        },
        actor,
        {
          schemaCode: parsed.data.schemaCode,
          inspectionType: parsed.data.inspectionType,
          title: parsed.data.title,
          requiredSignatureRoles: parsed.data.requiredSignatureRoles,
          sections: parsed.data.sections.map((section) => ({
            key: section.key,
            title: section.title,
            ...(section.description !== undefined
              ? { description: section.description }
              : {}),
            sortOrder: section.sortOrder,
            items: section.items.map((item) => ({
              key: item.key,
              type: item.type,
              label: item.label,
              ...(item.required !== undefined
                ? { required: item.required }
                : {}),
              sortOrder: item.sortOrder,
              ...(item.options !== undefined
                ? {
                    options: item.options.map((option) => ({
                      value: option.value,
                      label: option.label,
                    })),
                  }
                : {}),
              ...(item.visibleWhen !== undefined
                ? { visibleWhen: item.visibleWhen }
                : {}),
              ...(item.requiredWhen !== undefined
                ? { requiredWhen: item.requiredWhen }
                : {}),
            })),
          })),
        },
      );
      return json({ data: toInspectionSchemaVersionResponse(schema) }, 201);
    }

    return null;
  }

  const schemaMatch = /^\/inspection-schemas\/([^/]+)$/.exec(path);
  if (method === 'GET' && schemaMatch) {
    const parsedId = entityIdSchema.safeParse(schemaMatch[1]);
    if (!parsedId.success) return validationFailure();
    const schema = await getInspectionSchemaVersionQuery(
      deps.inspectionRepository,
      actor,
      asInspectionSchemaVersionId(parsedId.data),
    );
    return json({ data: toInspectionSchemaVersionResponse(schema) });
  }

  const publishSchemaMatch =
    /^\/inspection-schemas\/([^/]+)\/publish$/.exec(path);
  if (method === 'POST' && publishSchemaMatch) {
    const parsedId = entityIdSchema.safeParse(publishSchemaMatch[1]);
    if (!parsedId.success) return validationFailure();
    const schema = await publishInspectionSchemaVersionCommand(
      deps.inspectionRepository,
      actor,
      asInspectionSchemaVersionId(parsedId.data),
    );
    return json({ data: toInspectionSchemaVersionResponse(schema) });
  }

  if (method === 'GET' && path === '/inspection-staff') {
    const staff = await listAssignableInspectionStaffQuery(
      deps.staffDirectoryRepository,
      actor,
    );
    return json({
      data: {
        items: staff.map((entry) => ({
          userId: entry.userId,
          displayName: entry.displayName,
          email: entry.email,
          role: entry.role,
        })),
      },
    });
  }

  if (method === 'GET' && path === '/inspections/assigned-to-me') {
    const work = await listAssignedInspectionsQuery(
      deps.inspectionRepository,
      deps.portfolioRepository,
      actor,
    );
    return json({
      data: {
        items: work.map((item) => ({
          inspection: toInspectionResponse(item.inspection),
          propertyId: item.propertyId,
          unitCode: item.unitCode,
          unitNumber: item.unitNumber,
        })),
      },
    });
  }

  const unitInspectionsMatch = /^\/units\/([^/]+)\/inspections$/.exec(path);
  if (unitInspectionsMatch) {
    const parsedUnit = entityIdSchema.safeParse(unitInspectionsMatch[1]);
    if (!parsedUnit.success) return validationFailure();
    const unitId = asUnitId(parsedUnit.data);

    if (method === 'GET') {
      const inspections = await listInspectionsByUnitQuery(
        deps.inspectionRepository,
        actor,
        unitId,
      );
      return json({
        data: { items: inspections.map(toInspectionResponse) },
      });
    }

    if (method === 'POST') {
      const parsed = createInspectionRequestSchema.safeParse(
        await requestJson(request),
      );
      if (!parsed.success) return validationFailure();

      const inspection = await createInspectionCommand(
        deps,
        actor,
        {
          code: parsed.data.code,
          inspectionType: parsed.data.inspectionType,
          unitId,
          schemaVersionId: asInspectionSchemaVersionId(
            parsed.data.schemaVersionId,
          ),
          ...(parsed.data.tenancyId !== undefined
            ? {
                tenancyId:
                  parsed.data.tenancyId === null
                    ? null
                    : asTenancyId(parsed.data.tenancyId),
              }
            : {}),
          ...(parsed.data.assignedToUserId !== undefined
            ? {
                assignedToUserId: asUserId(parsed.data.assignedToUserId),
              }
            : {}),
          ...(parsed.data.scheduledFor !== undefined
            ? { scheduledFor: parsed.data.scheduledFor }
            : {}),
        },
      );
      return json({ data: toInspectionResponse(inspection) }, 201);
    }

    return null;
  }

  const orchestrationMatch =
    /^\/inspections\/([^/]+)\/orchestration$/.exec(path);
  if (method === 'POST' && orchestrationMatch) {
    const parsedId = entityIdSchema.safeParse(orchestrationMatch[1]);
    const parsed = updateInspectionOrchestrationRequestSchema.safeParse(
      await requestJson(request),
    );
    if (!parsedId.success || !parsed.success) return validationFailure();

    const inspection = await updateInspectionOrchestrationCommand(
      {
        inspectionRepository: deps.inspectionRepository,
        staffDirectoryRepository: deps.staffDirectoryRepository,
      },
      actor,
      asInspectionId(parsedId.data),
      parsed.data.expectedVersion,
      {
        assignedToUserId: asUserId(parsed.data.assignedToUserId),
        scheduledFor: parsed.data.scheduledFor,
      },
    );
    return json({ data: toInspectionResponse(inspection) });
  }

  const inspectionMatch = /^\/inspections\/([^/]+)$/.exec(path);
  if (method === 'GET' && inspectionMatch) {
    const parsedId = entityIdSchema.safeParse(inspectionMatch[1]);
    if (!parsedId.success) return validationFailure();

    const bundle = await getInspectionBundleQuery(
      deps.inspectionRepository,
      actor,
      asInspectionId(parsedId.data),
    );

    return json({
      data: {
        inspection: toInspectionResponse(bundle.inspection),
        schema: toInspectionSchemaVersionResponse(bundle.schema),
        sectionStates: bundle.sectionStates.map((state) => ({
          sectionId: state.sectionId,
          revision: state.revision,
        })),
        responses: bundle.responses.map(toInspectionItemResponse),
        findings: bundle.findings.map(toInspectionFindingResponse),
        evidence: bundle.evidence.map(toInspectionEvidenceResponse),
        signatures: bundle.signatures.map(toInspectionSignatureResponse),
        finalSnapshot:
          bundle.finalSnapshot === null
            ? null
            : toInspectionFinalSnapshotResponse(bundle.finalSnapshot),
      },
    });
  }

  for (const [suffix, command] of [
    ['start', startInspectionCommand],
    ['lock', lockInspectionCommand],
    ['cancel', cancelInspectionCommand],
  ] as const) {
    const match = new RegExp(
      `^/inspections/([^/]+)/${suffix}$`,
    ).exec(path);
    if (method === 'POST' && match) {
      const parsedId = entityIdSchema.safeParse(match[1]);
      const parsedBody = expectedInspectionVersionRequestSchema.safeParse(
        await requestJson(request),
      );
      if (!parsedId.success || !parsedBody.success) return validationFailure();

      const inspection = await command(
        {
          inspectionRepository: deps.inspectionRepository,
          clock: deps.clock,
        },
        actor,
        asInspectionId(parsedId.data),
        parsedBody.data.expectedVersion,
      );
      return json({ data: toInspectionResponse(inspection) });
    }
  }

  const sectionMatch =
    /^\/inspections\/([^/]+)\/sections\/([^/]+)$/.exec(path);
  if (method === 'PATCH' && sectionMatch) {
    const inspectionId = entityIdSchema.safeParse(sectionMatch[1]);
    const sectionId = entityIdSchema.safeParse(sectionMatch[2]);
    const parsed = saveInspectionSectionRequestSchema.safeParse(
      await requestJson(request),
    );
    if (!inspectionId.success || !sectionId.success || !parsed.success) {
      return validationFailure();
    }

    const result = await saveInspectionSectionCommand(
      {
        inspectionRepository: deps.inspectionRepository,
        idGenerator: deps.idGenerator,
        clock: deps.clock,
      },
      actor,
      asInspectionId(inspectionId.data),
      asInspectionSchemaSectionId(sectionId.data),
      parsed.data.expectedRevision,
      {
        set: parsed.data.set.map((item) => ({
          itemId: item.itemId,
          value: Array.isArray(item.value) ? [...item.value] : item.value,
          ...(item.comment !== undefined ? { comment: item.comment } : {}),
        })),
        clearItemIds: [...parsed.data.clear],
      },
    );

    return json({
      data: {
        revision: result.revision,
        contentRevision: result.contentRevision,
        responses: result.responses.map(toInspectionItemResponse),
        clearedItemIds: [...result.clearedItemIds],
      },
    });
  }

  const findingMatch = /^\/inspections\/([^/]+)\/findings$/.exec(path);
  if (method === 'POST' && findingMatch) {
    const parsedId = entityIdSchema.safeParse(findingMatch[1]);
    const parsed = createInspectionFindingRequestSchema.safeParse(
      await requestJson(request),
    );
    if (!parsedId.success || !parsed.success) return validationFailure();

    const finding = await createInspectionFindingCommand(
      {
        inspectionRepository: deps.inspectionRepository,
        idGenerator: deps.idGenerator,
        clock: deps.clock,
      },
      actor,
      asInspectionId(parsedId.data),
      {
        sectionId: asInspectionSchemaSectionId(parsed.data.sectionId),
        ...(parsed.data.itemId !== undefined
          ? { itemId: parsed.data.itemId }
          : {}),
        severity: parsed.data.severity,
        title: parsed.data.title,
        ...(parsed.data.description !== undefined
          ? { description: parsed.data.description }
          : {}),
      },
    );

    return json({ data: toInspectionFindingResponse(finding) }, 201);
  }


  const evidenceMatch = /^\/inspections\/([^/]+)\/evidence$/.exec(path);
  if (method === 'POST' && evidenceMatch) {
    const parsedId = entityIdSchema.safeParse(evidenceMatch[1]);
    const parsed = attachInspectionEvidenceRequestSchema.safeParse(
      await requestJson(request),
    );
    if (!parsedId.success || !parsed.success) return validationFailure();

    const evidence = await attachInspectionEvidenceCommand(
      {
        inspectionRepository: deps.inspectionRepository,
        documentRepository: deps.documentRepository,
        fileStorage: deps.fileStorage,
        idGenerator: deps.idGenerator,
        clock: deps.clock,
      },
      actor,
      asInspectionId(parsedId.data),
      {
        documentVersionId: parsed.data.documentVersionId,
        kind: parsed.data.kind,
        ...(parsed.data.sectionId !== undefined
          ? { sectionId: parsed.data.sectionId }
          : {}),
        ...(parsed.data.itemId !== undefined
          ? { itemId: parsed.data.itemId }
          : {}),
        ...(parsed.data.caption !== undefined
          ? { caption: parsed.data.caption }
          : {}),
      },
    );
    return json({ data: toInspectionEvidenceResponse(evidence) }, 201);
  }

  const binaryMatch = /^\/inspections\/([^/]+)\/binaries$/.exec(path);
  if (method === 'POST' && binaryMatch) {
    const parsedId = entityIdSchema.safeParse(binaryMatch[1]);
    const url = new URL(request.url);
    const purpose = inspectionBinaryPurposeSchema.safeParse(
      url.searchParams.get('purpose'),
    );
    const uploadKey = entityIdSchema.safeParse(
      url.searchParams.get('uploadKey'),
    );
    const fileName = url.searchParams.get('fileName')?.trim();
    const mimeType = request.headers.get('content-type')?.split(';')[0]?.trim();

    if (
      !parsedId.success ||
      !purpose.success ||
      !uploadKey.success ||
      !fileName ||
      !mimeType
    ) {
      return validationFailure();
    }

    const content = new Uint8Array(await request.arrayBuffer());
    if (content.byteLength > DEFAULT_BUFFERED_DOCUMENT_BINARY_POLICY.maxBytes) {
      throw new ApplicationError(
        'DOCUMENT_BINARY_UPLOAD_LIMIT_EXCEEDED',
        `Buffered Inspection upload supports files up to ${DEFAULT_BUFFERED_DOCUMENT_BINARY_POLICY.maxBytes} bytes until streaming upload is implemented.`,
      );
    }

    const version = await uploadInspectionBinaryCommand(
      {
        inspectionRepository: deps.inspectionRepository,
        documentRepository: deps.documentRepository,
        fileStorage: deps.fileStorage,
        idGenerator: deps.idGenerator,
        clock: deps.clock,
      },
      actor,
      asInspectionId(parsedId.data),
      {
        purpose: purpose.data,
        uploadKey: uploadKey.data,
        fileName,
        mimeType,
        content,
      },
    );

    return json({ data: toDocumentVersionResponse(version) }, 201);
  }

  const signatureMatch = /^\/inspections\/([^/]+)\/signatures$/.exec(path);
  if (method === 'POST' && signatureMatch) {
    const parsedId = entityIdSchema.safeParse(signatureMatch[1]);
    const parsed = addInspectionSignatureRequestSchema.safeParse(
      await requestJson(request),
    );
    if (!parsedId.success || !parsed.success) return validationFailure();

    const signature = await addInspectionSignatureCommand(
      {
        inspectionRepository: deps.inspectionRepository,
        documentRepository: deps.documentRepository,
        fileStorage: deps.fileStorage,
        partyRepository: deps.partyRepository,
        ownershipRepository: deps.ownershipRepository,
        tenancyRepository: deps.tenancyRepository,
        idGenerator: deps.idGenerator,
        clock: deps.clock,
      },
      actor,
      asInspectionId(parsedId.data),
      {
        signerRole: parsed.data.signerRole,
        ...(parsed.data.signerPartyId !== undefined
          ? { signerPartyId: parsed.data.signerPartyId }
          : {}),
        signerName: parsed.data.signerName,
        signatureDocumentVersionId: parsed.data.signatureDocumentVersionId,
      },
    );
    return json({ data: toInspectionSignatureResponse(signature) }, 201);
  }

  const unlockMatch = /^\/inspections\/([^/]+)\/unlock$/.exec(path);
  if (method === 'POST' && unlockMatch) {
    const parsedId = entityIdSchema.safeParse(unlockMatch[1]);
    const parsed = unlockInspectionRequestSchema.safeParse(
      await requestJson(request),
    );
    if (!parsedId.success || !parsed.success) return validationFailure();

    const inspection = await unlockInspectionCommand(
      {
        inspectionRepository: deps.inspectionRepository,
        idGenerator: deps.idGenerator,
        clock: deps.clock,
      },
      actor,
      asInspectionId(parsedId.data),
      parsed.data.expectedVersion,
      parsed.data.reason,
    );
    return json({ data: toInspectionResponse(inspection) });
  }

  const finalizeMatch = /^\/inspections\/([^/]+)\/finalize$/.exec(path);
  if (method === 'POST' && finalizeMatch) {
    const parsedId = entityIdSchema.safeParse(finalizeMatch[1]);
    const parsed = finalizeInspectionRequestSchema.safeParse(
      await requestJson(request),
    );
    if (!parsedId.success || !parsed.success) return validationFailure();

    const result = await finalizeInspectionCommand(
      {
        inspectionRepository: deps.inspectionRepository,
        documentRepository: deps.documentRepository,
        fileStorage: deps.fileStorage,
        idGenerator: deps.idGenerator,
        clock: deps.clock,
      },
      actor,
      asInspectionId(parsedId.data),
      parsed.data.expectedVersion,
    );
    return json({
      data: {
        inspection: toInspectionResponse(result.inspection),
        snapshot: toInspectionFinalSnapshotResponse(result.snapshot),
      },
    });
  }

  const finalReportMatch =
    /^\/inspections\/([^/]+)\/final-report$/.exec(path);
  if (method === 'POST' && finalReportMatch) {
    const parsedId = entityIdSchema.safeParse(finalReportMatch[1]);
    if (!parsedId.success) return validationFailure();

    const version = await generateInspectionFinalReportCommand(
      {
        inspectionRepository: deps.inspectionRepository,
        documentRepository: deps.documentRepository,
        fileStorage: deps.fileStorage,
        pdfPort: deps.pdfPort,
        idGenerator: deps.idGenerator,
        clock: deps.clock,
      },
      actor,
      asInspectionId(parsedId.data),
    );

    return json({ data: toDocumentVersionResponse(version) });
  }

  return null;
}
