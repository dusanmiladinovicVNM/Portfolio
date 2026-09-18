import {
  cancelInspectionCommand,
  createInspectionCommand,
  createInspectionFindingCommand,
  createInspectionSchemaVersionCommand,
  getInspectionBundleQuery,
  getInspectionSchemaVersionQuery,
  listInspectionSchemaVersionsQuery,
  listInspectionsByUnitQuery,
  lockInspectionCommand,
  publishInspectionSchemaVersionCommand,
  saveInspectionSectionCommand,
  startInspectionCommand,
  type Actor,
  type ClockPort,
  type IdGenerator,
  type InspectionRepository,
  type PortfolioRepository,
  type StaffDirectoryRepository,
  type TenancyRepository,
} from '@portfolio/application';
import {
  createInspectionFindingRequestSchema,
  createInspectionRequestSchema,
  createInspectionSchemaVersionRequestSchema,
  entityIdSchema,
  expectedInspectionVersionRequestSchema,
  saveInspectionSectionRequestSchema,
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
  toInspectionFindingResponse,
  toInspectionItemResponse,
  toInspectionResponse,
  toInspectionSchemaVersionResponse,
} from './response-mappers.js';

export interface InspectionHttpDependencies {
  readonly inspectionRepository: InspectionRepository;
  readonly portfolioRepository: PortfolioRepository;
  readonly tenancyRepository: TenancyRepository;
  readonly staffDirectoryRepository: StaffDirectoryRepository;
  readonly idGenerator: IdGenerator;
  readonly clock: ClockPort;
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
  if (method === 'PUT' && sectionMatch) {
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
      parsed.data.items.map((item) => ({
        itemId: item.itemId,
        value: Array.isArray(item.value) ? [...item.value] : item.value,
        ...(item.comment !== undefined ? { comment: item.comment } : {}),
      })),
    );

    return json({
      data: {
        revision: result.revision,
        responses: result.responses.map(toInspectionItemResponse),
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

  return null;
}
