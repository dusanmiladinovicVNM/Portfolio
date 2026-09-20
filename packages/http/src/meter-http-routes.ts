import {
  createMeterCommand,
  getMeterQuery,
  linkMeterReadingBoundaryCommand,
  listMeterReadingBoundariesByTenancyQuery,
  listMetersByUnitQuery,
  recordMeterReadingCommand,
  retireMeterCommand,
  updateMeterLabelCommand,
  type Actor,
  type MeterDependencies,
} from '@portfolio/application';
import {
  createMeterRequestSchema,
  entityIdSchema,
  linkMeterReadingBoundaryRequestSchema,
  recordMeterReadingRequestSchema,
  retireMeterRequestSchema,
  updateMeterRequestSchema,
} from '@portfolio/contracts';
import {
  asMeterId,
  asMeterReadingId,
  asSpaceId,
  asTenancyId,
  asUnitId,
} from '@portfolio/domain';
import { json, requestJson, validationFailure } from './http-utils.js';
import {
  toMeterReadingBoundaryResponse,
  toMeterReadingResponse,
  toMeterResponse,
} from './response-mappers.js';

export type MeterRoutesDependencies = MeterDependencies;

export async function handleMeterHttp(
  deps: MeterRoutesDependencies,
  actor: Actor,
  request: Request,
  path: string,
): Promise<Response | null> {
  const method = request.method.toUpperCase();

  if (method === 'POST' && path === '/meters') {
    const parsed = createMeterRequestSchema.safeParse(await requestJson(request));
    if (!parsed.success) return validationFailure();

    const meter = await createMeterCommand(deps, actor, {
      code: parsed.data.code,
      serialNumber: parsed.data.serialNumber,
      utilityType: parsed.data.utilityType,
      measurementUnit: parsed.data.measurementUnit,
      unitId: asUnitId(parsed.data.unitId),
      ...(parsed.data.spaceId !== undefined
        ? {
            spaceId:
              parsed.data.spaceId === null
                ? null
                : asSpaceId(parsed.data.spaceId),
          }
        : {}),
      label: parsed.data.label,
      installedAt: parsed.data.installedAt,
    });

    return json({ data: toMeterResponse(meter) }, 201);
  }

  const unitList = /^\/units\/([^/]+)\/meters$/.exec(path);
  if (method === 'GET' && unitList) {
    const id = entityIdSchema.safeParse(unitList[1]);
    if (!id.success) return validationFailure();

    const meters = await listMetersByUnitQuery(
      deps.meterRepository,
      actor,
      asUnitId(id.data),
    );
    return json({ data: { meters: meters.map(toMeterResponse) } });
  }

  const tenancyBoundaries =
    /^\/tenancies\/([^/]+)\/meter-reading-boundaries$/.exec(path);
  if (method === 'GET' && tenancyBoundaries) {
    const id = entityIdSchema.safeParse(tenancyBoundaries[1]);
    if (!id.success) return validationFailure();

    const entries = await listMeterReadingBoundariesByTenancyQuery(
      deps.meterRepository,
      actor,
      asTenancyId(id.data),
    );

    return json({
      data: {
        entries: entries.map(({ boundary, reading }) => ({
          boundary: toMeterReadingBoundaryResponse(boundary),
          reading: toMeterReadingResponse(reading),
        })),
      },
    });
  }

  const readingBoundary =
    /^\/meter-readings\/([^/]+)\/boundaries$/.exec(path);
  if (method === 'POST' && readingBoundary) {
    const id = entityIdSchema.safeParse(readingBoundary[1]);
    const parsed = linkMeterReadingBoundaryRequestSchema.safeParse(
      await requestJson(request),
    );
    if (!id.success || !parsed.success) return validationFailure();

    const boundary = await linkMeterReadingBoundaryCommand(
      deps,
      actor,
      asMeterReadingId(id.data),
      {
        tenancyId: asTenancyId(parsed.data.tenancyId),
        type: parsed.data.type,
      },
    );

    return json({ data: toMeterReadingBoundaryResponse(boundary) }, 201);
  }

  const retireMatch = /^\/meters\/([^/]+)\/retire$/.exec(path);
  if (method === 'POST' && retireMatch) {
    const id = entityIdSchema.safeParse(retireMatch[1]);
    const parsed = retireMeterRequestSchema.safeParse(await requestJson(request));
    if (!id.success || !parsed.success) return validationFailure();

    const meter = await retireMeterCommand(
      deps,
      actor,
      asMeterId(id.data),
      {
        expectedVersion: parsed.data.expectedVersion,
        retiredAt: parsed.data.retiredAt,
        retirementReason: parsed.data.retirementReason,
      },
    );

    return json({ data: toMeterResponse(meter) });
  }

  const readingsMatch = /^\/meters\/([^/]+)\/readings$/.exec(path);
  if (method === 'POST' && readingsMatch) {
    const id = entityIdSchema.safeParse(readingsMatch[1]);
    const parsed = recordMeterReadingRequestSchema.safeParse(
      await requestJson(request),
    );
    if (!id.success || !parsed.success) return validationFailure();

    const reading = await recordMeterReadingCommand(
      deps,
      actor,
      asMeterId(id.data),
      {
        value: parsed.data.value,
        readAt: parsed.data.readAt,
        ...(parsed.data.note !== undefined ? { note: parsed.data.note } : {}),
      },
    );

    return json({ data: toMeterReadingResponse(reading) }, 201);
  }

  const meterMatch = /^\/meters\/([^/]+)$/.exec(path);
  if (meterMatch) {
    const id = entityIdSchema.safeParse(meterMatch[1]);
    if (!id.success) return validationFailure();
    const meterId = asMeterId(id.data);

    if (method === 'GET') {
      const detail = await getMeterQuery(deps.meterRepository, actor, meterId);
      return json({
        data: {
          meter: toMeterResponse(detail.meter),
          readings: detail.readings.map(toMeterReadingResponse),
          boundaries: detail.boundaries.map(toMeterReadingBoundaryResponse),
          consumptionIntervals: detail.consumptionIntervals.map((interval) => ({
            fromReadingId: interval.fromReadingId,
            toReadingId: interval.toReadingId,
            fromReadAt: interval.fromReadAt,
            toReadAt: interval.toReadAt,
            fromValue: interval.fromValue,
            toValue: interval.toValue,
            consumption: interval.consumption,
            continuity: interval.continuity,
          })),
        },
      });
    }

    if (method === 'PATCH') {
      const parsed = updateMeterRequestSchema.safeParse(await requestJson(request));
      if (!parsed.success) return validationFailure();

      const meter = await updateMeterLabelCommand(
        deps,
        actor,
        meterId,
        parsed.data.expectedVersion,
        parsed.data.label,
      );

      return json({ data: toMeterResponse(meter) });
    }
  }

  return null;
}
