import {
  cancelWarrantyClaimCommand,
  changeServicePlanStatusCommand,
  closeWarrantyClaimCommand,
  createServicePlanCommand,
  createWarrantyClaimCommand,
  createWarrantyCommand,
  listServiceEventsByAssetQuery,
  listServicePlansByAssetQuery,
  listWarrantyClaimsQuery,
  listWarrantiesByAssetQuery,
  recordServiceEventCommand,
  resolveWarrantyClaimCommand,
  submitWarrantyClaimCommand,
  type Actor,
  type AssetRepository,
  type AssetServiceRepository,
  type ClockPort,
  type IdGenerator,
  type PartyRepository,
} from '@portfolio/application';
import {
  changeServicePlanStatusRequestSchema,
  createServicePlanRequestSchema,
  createWarrantyClaimRequestSchema,
  createWarrantyRequestSchema,
  entityIdSchema,
  recordServiceEventRequestSchema,
  resolveWarrantyClaimRequestSchema,
  submitWarrantyClaimRequestSchema,
  warrantyClaimVersionRequestSchema,
} from '@portfolio/contracts';
import {
  asAssetId,
  asPartyId,
  asServicePlanId,
  asWarrantyClaimId,
  asWarrantyId,
} from '@portfolio/domain';
import { json, requestJson, validationFailure } from './http-utils.js';
import {
  toServiceEventResponse,
  toServicePlanResponse,
  toWarrantyClaimResponse,
  toWarrantyResponse,
} from './response-mappers.js';

export interface AssetServiceRoutesDependencies {
  readonly assetRepository: AssetRepository;
  readonly assetServiceRepository: AssetServiceRepository;
  readonly partyRepository: PartyRepository;
  readonly idGenerator: IdGenerator;
  readonly clock: ClockPort;
}

export async function handleAssetServiceHttp(
  deps: AssetServiceRoutesDependencies,
  actor: Actor,
  request: Request,
  path: string,
): Promise<Response | null> {
  const method = request.method.toUpperCase();

  const warrantiesMatch = /^\/assets\/([^/]+)\/warranties$/.exec(path);
  if (warrantiesMatch) {
    const parsedId = entityIdSchema.safeParse(warrantiesMatch[1]);
    if (!parsedId.success) return validationFailure();
    const assetId = asAssetId(parsedId.data);

    if (method === 'POST') {
      const parsed = createWarrantyRequestSchema.safeParse(
        await requestJson(request),
      );
      if (!parsed.success) return validationFailure();

      const warranty = await createWarrantyCommand(deps, actor, assetId, {
        warrantyType: parsed.data.warrantyType,
        ...(parsed.data.providerPartyId !== undefined
          ? {
              providerPartyId:
                parsed.data.providerPartyId === null
                  ? null
                  : asPartyId(parsed.data.providerPartyId),
            }
          : {}),
        ...(parsed.data.reference !== undefined
          ? { reference: parsed.data.reference }
          : {}),
        validFrom: parsed.data.validFrom,
        ...(parsed.data.validTo !== undefined
          ? { validTo: parsed.data.validTo }
          : {}),
        ...(parsed.data.terms !== undefined ? { terms: parsed.data.terms } : {}),
      });
      return json({ data: toWarrantyResponse(warranty) }, 201);
    }

    if (method === 'GET') {
      const warranties = await listWarrantiesByAssetQuery(
        deps.assetRepository,
        deps.assetServiceRepository,
        actor,
        assetId,
      );
      return json({
        data: { items: warranties.map(toWarrantyResponse) },
      });
    }
  }

  const claimsMatch = /^\/warranties\/([^/]+)\/claims$/.exec(path);
  if (claimsMatch) {
    const parsedId = entityIdSchema.safeParse(claimsMatch[1]);
    if (!parsedId.success) return validationFailure();
    const warrantyId = asWarrantyId(parsedId.data);

    if (method === 'POST') {
      const parsed = createWarrantyClaimRequestSchema.safeParse(
        await requestJson(request),
      );
      if (!parsed.success) return validationFailure();
      const claim = await createWarrantyClaimCommand(
        deps,
        actor,
        warrantyId,
        parsed.data,
      );
      return json({ data: toWarrantyClaimResponse(claim) }, 201);
    }

    if (method === 'GET') {
      const claims = await listWarrantyClaimsQuery(
        deps.assetServiceRepository,
        actor,
        warrantyId,
      );
      return json({
        data: { items: claims.map(toWarrantyClaimResponse) },
      });
    }
  }

  const claimActionMatch =
    /^\/warranty-claims\/([^/]+)\/(submit|resolve|close|cancel)$/.exec(path);
  if (method === 'POST' && claimActionMatch) {
    const parsedId = entityIdSchema.safeParse(claimActionMatch[1]);
    if (!parsedId.success) return validationFailure();
    const claimId = asWarrantyClaimId(parsedId.data);
    const action = claimActionMatch[2];

    if (action === 'submit') {
      const parsed = submitWarrantyClaimRequestSchema.safeParse(
        await requestJson(request),
      );
      if (!parsed.success) return validationFailure();
      const claim = await submitWarrantyClaimCommand(
        deps,
        actor,
        claimId,
        parsed.data.expectedVersion,
        parsed.data.providerReference,
      );
      return json({ data: toWarrantyClaimResponse(claim) });
    }

    if (action === 'resolve') {
      const parsed = resolveWarrantyClaimRequestSchema.safeParse(
        await requestJson(request),
      );
      if (!parsed.success) return validationFailure();
      const claim = await resolveWarrantyClaimCommand(
        deps,
        actor,
        claimId,
        parsed.data.expectedVersion,
        parsed.data.decision,
      );
      return json({ data: toWarrantyClaimResponse(claim) });
    }

    const parsed = warrantyClaimVersionRequestSchema.safeParse(
      await requestJson(request),
    );
    if (!parsed.success) return validationFailure();

    const claim =
      action === 'close'
        ? await closeWarrantyClaimCommand(
            deps,
            actor,
            claimId,
            parsed.data.expectedVersion,
          )
        : await cancelWarrantyClaimCommand(
            deps,
            actor,
            claimId,
            parsed.data.expectedVersion,
          );
    return json({ data: toWarrantyClaimResponse(claim) });
  }

  const plansMatch = /^\/assets\/([^/]+)\/service-plans$/.exec(path);
  if (plansMatch) {
    const parsedId = entityIdSchema.safeParse(plansMatch[1]);
    if (!parsedId.success) return validationFailure();
    const assetId = asAssetId(parsedId.data);

    if (method === 'POST') {
      const parsed = createServicePlanRequestSchema.safeParse(
        await requestJson(request),
      );
      if (!parsed.success) return validationFailure();

      const plan = await createServicePlanCommand(deps, actor, assetId, {
        name: parsed.data.name,
        scheduleKind: parsed.data.scheduleKind,
        firstDueOn: parsed.data.firstDueOn,
        ...(parsed.data.intervalMonths !== undefined
          ? { intervalMonths: parsed.data.intervalMonths }
          : {}),
        ...(parsed.data.providerPartyId !== undefined
          ? {
              providerPartyId:
                parsed.data.providerPartyId === null
                  ? null
                  : asPartyId(parsed.data.providerPartyId),
            }
          : {}),
        ...(parsed.data.notes !== undefined ? { notes: parsed.data.notes } : {}),
      });
      return json({ data: toServicePlanResponse(plan) }, 201);
    }

    if (method === 'GET') {
      const plans = await listServicePlansByAssetQuery(
        deps.assetRepository,
        deps.assetServiceRepository,
        actor,
        assetId,
      );
      return json({ data: { items: plans.map(toServicePlanResponse) } });
    }
  }

  const planStatusMatch = /^\/service-plans\/([^/]+)\/status$/.exec(path);
  if (method === 'POST' && planStatusMatch) {
    const parsedId = entityIdSchema.safeParse(planStatusMatch[1]);
    const parsed = changeServicePlanStatusRequestSchema.safeParse(
      await requestJson(request),
    );
    if (!parsedId.success || !parsed.success) return validationFailure();

    const plan = await changeServicePlanStatusCommand(
      deps.assetServiceRepository,
      actor,
      asServicePlanId(parsedId.data),
      parsed.data.expectedVersion,
      parsed.data.status,
    );
    return json({ data: toServicePlanResponse(plan) });
  }

  const eventsMatch = /^\/assets\/([^/]+)\/service-events$/.exec(path);
  if (eventsMatch) {
    const parsedId = entityIdSchema.safeParse(eventsMatch[1]);
    if (!parsedId.success) return validationFailure();
    const assetId = asAssetId(parsedId.data);

    if (method === 'POST') {
      const parsed = recordServiceEventRequestSchema.safeParse(
        await requestJson(request),
      );
      if (!parsed.success) return validationFailure();

      const event = await recordServiceEventCommand(deps, actor, assetId, {
        ...(parsed.data.servicePlanId !== undefined
          ? {
              servicePlanId:
                parsed.data.servicePlanId === null
                  ? null
                  : asServicePlanId(parsed.data.servicePlanId),
            }
          : {}),
        ...(parsed.data.warrantyClaimId !== undefined
          ? {
              warrantyClaimId:
                parsed.data.warrantyClaimId === null
                  ? null
                  : asWarrantyClaimId(parsed.data.warrantyClaimId),
            }
          : {}),
        eventType: parsed.data.eventType,
        performedAt: parsed.data.performedAt,
        ...(parsed.data.providerPartyId !== undefined
          ? {
              providerPartyId:
                parsed.data.providerPartyId === null
                  ? null
                  : asPartyId(parsed.data.providerPartyId),
            }
          : {}),
        description: parsed.data.description,
        ...(parsed.data.reference !== undefined
          ? { reference: parsed.data.reference }
          : {}),
        ...(parsed.data.parts !== undefined ? { parts: parsed.data.parts } : {}),
      });
      return json({ data: toServiceEventResponse(event) }, 201);
    }

    if (method === 'GET') {
      const events = await listServiceEventsByAssetQuery(
        deps.assetRepository,
        deps.assetServiceRepository,
        actor,
        assetId,
      );
      return json({ data: { items: events.map(toServiceEventResponse) } });
    }
  }

  return null;
}
