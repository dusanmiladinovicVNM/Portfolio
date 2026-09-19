import {
  DomainError,
  asServiceEventId,
  asServicePartId,
  asServicePlanId,
  asWarrantyClaimId,
  asWarrantyId,
  cancelWarrantyClaim,
  changeServicePlanStatus,
  closeWarrantyClaim,
  createServiceEvent,
  createServicePlan,
  createWarranty,
  createWarrantyClaim,
  resolveWarrantyClaim,
  submitWarrantyClaim,
  type AssetId,
  type PartyId,
  type ServiceEventType,
  type ServicePlanKind,
  type ServicePlanStatus,
  type ServicePlanId,
  type WarrantyClaimId,
  type WarrantyType,
  type WarrantyId,
} from '@portfolio/domain';
import type { AssetRepository } from './asset-repository.js';
import type { AssetServiceRepository } from './asset-service-repository.js';
import type { PartyRepository } from '../parties/party-repository.js';
import type { ClockPort } from '../shared/clock.js';
import type { IdGenerator } from '../shared/id-generator.js';
import {
  requireCapability,
  type Actor,
} from '../security/access.js';

export interface AssetServiceDependencies {
  readonly assetRepository: AssetRepository;
  readonly assetServiceRepository: AssetServiceRepository;
  readonly partyRepository: PartyRepository;
  readonly idGenerator: IdGenerator;
  readonly clock: ClockPort;
}

async function requireAsset(
  repository: AssetRepository,
  assetId: AssetId,
): Promise<void> {
  if (!(await repository.getById(assetId))) {
    throw new DomainError('ASSET_NOT_FOUND', 'Asset not found.');
  }
}

async function requireParty(
  repository: PartyRepository,
  partyId: PartyId | null | undefined,
): Promise<void> {
  if (partyId == null) return;
  if (!(await repository.getById(partyId))) {
    throw new DomainError('PARTY_NOT_FOUND', 'Party not found.');
  }
}

function assertExpectedVersion(
  actual: number,
  expected: number,
  code: string,
  message: string,
): void {
  if (actual !== expected) {
    throw new DomainError(code, message);
  }
}

export async function createWarrantyCommand(
  deps: AssetServiceDependencies,
  actor: Actor,
  assetId: AssetId,
  input: {
    readonly warrantyType: WarrantyType;
    readonly providerPartyId?: PartyId | null;
    readonly reference?: string | null;
    readonly validFrom: string;
    readonly validTo?: string | null;
    readonly terms?: string | null;
  },
) {
  requireCapability(actor, 'service:write');
  await Promise.all([
    requireAsset(deps.assetRepository, assetId),
    requireParty(deps.partyRepository, input.providerPartyId),
  ]);

  const warranty = createWarranty({
    id: asWarrantyId(deps.idGenerator.next()),
    assetId,
    warrantyType: input.warrantyType,
    ...(input.providerPartyId !== undefined
      ? { providerPartyId: input.providerPartyId }
      : {}),
    ...(input.reference !== undefined ? { reference: input.reference } : {}),
    validFrom: input.validFrom,
    ...(input.validTo !== undefined ? { validTo: input.validTo } : {}),
    ...(input.terms !== undefined ? { terms: input.terms } : {}),
    recordedAt: deps.clock.now(),
    recordedByUserId: actor.userId,
  });

  await deps.assetServiceRepository.insertWarranty(warranty);
  return warranty;
}

export async function createWarrantyClaimCommand(
  deps: Pick<
    AssetServiceDependencies,
    'assetServiceRepository' | 'idGenerator'
  >,
  actor: Actor,
  warrantyId: WarrantyId,
  input: {
    readonly incidentOn: string;
    readonly description: string;
  },
) {
  requireCapability(actor, 'service:write');
  const warranty = await deps.assetServiceRepository.getWarrantyById(warrantyId);
  if (!warranty) {
    throw new DomainError('WARRANTY_NOT_FOUND', 'Warranty not found.');
  }

  const claim = createWarrantyClaim({
    id: asWarrantyClaimId(deps.idGenerator.next()),
    warranty,
    incidentOn: input.incidentOn,
    description: input.description,
  });
  await deps.assetServiceRepository.insertWarrantyClaim(claim);
  return claim;
}

export async function submitWarrantyClaimCommand(
  deps: Pick<AssetServiceDependencies, 'assetServiceRepository' | 'clock'>,
  actor: Actor,
  claimId: WarrantyClaimId,
  expectedVersion: number,
  providerReference?: string | null,
) {
  requireCapability(actor, 'service:write');
  const claim = await deps.assetServiceRepository.getWarrantyClaimById(claimId);
  if (!claim) {
    throw new DomainError('WARRANTY_CLAIM_NOT_FOUND', 'WarrantyClaim not found.');
  }
  assertExpectedVersion(
    claim.version,
    expectedVersion,
    'WARRANTY_CLAIM_VERSION_CONFLICT',
    'WarrantyClaim has changed since the caller last read it.',
  );

  const submitted = submitWarrantyClaim(
    claim,
    deps.clock.now(),
    providerReference,
  );
  await deps.assetServiceRepository.updateWarrantyClaim(
    submitted,
    expectedVersion,
  );
  return submitted;
}

export async function resolveWarrantyClaimCommand(
  deps: Pick<AssetServiceDependencies, 'assetServiceRepository' | 'clock'>,
  actor: Actor,
  claimId: WarrantyClaimId,
  expectedVersion: number,
  decision: 'approved' | 'rejected',
) {
  requireCapability(actor, 'service:write');
  const claim = await deps.assetServiceRepository.getWarrantyClaimById(claimId);
  if (!claim) {
    throw new DomainError('WARRANTY_CLAIM_NOT_FOUND', 'WarrantyClaim not found.');
  }
  assertExpectedVersion(
    claim.version,
    expectedVersion,
    'WARRANTY_CLAIM_VERSION_CONFLICT',
    'WarrantyClaim has changed since the caller last read it.',
  );

  const resolved = resolveWarrantyClaim(claim, decision, deps.clock.now());
  await deps.assetServiceRepository.updateWarrantyClaim(resolved, expectedVersion);
  return resolved;
}

export async function closeWarrantyClaimCommand(
  deps: Pick<AssetServiceDependencies, 'assetServiceRepository' | 'clock'>,
  actor: Actor,
  claimId: WarrantyClaimId,
  expectedVersion: number,
) {
  requireCapability(actor, 'service:write');
  const claim = await deps.assetServiceRepository.getWarrantyClaimById(claimId);
  if (!claim) {
    throw new DomainError('WARRANTY_CLAIM_NOT_FOUND', 'WarrantyClaim not found.');
  }
  assertExpectedVersion(
    claim.version,
    expectedVersion,
    'WARRANTY_CLAIM_VERSION_CONFLICT',
    'WarrantyClaim has changed since the caller last read it.',
  );

  const closed = closeWarrantyClaim(claim, deps.clock.now());
  await deps.assetServiceRepository.updateWarrantyClaim(closed, expectedVersion);
  return closed;
}

export async function cancelWarrantyClaimCommand(
  deps: Pick<AssetServiceDependencies, 'assetServiceRepository' | 'clock'>,
  actor: Actor,
  claimId: WarrantyClaimId,
  expectedVersion: number,
) {
  requireCapability(actor, 'service:write');
  const claim = await deps.assetServiceRepository.getWarrantyClaimById(claimId);
  if (!claim) {
    throw new DomainError('WARRANTY_CLAIM_NOT_FOUND', 'WarrantyClaim not found.');
  }
  assertExpectedVersion(
    claim.version,
    expectedVersion,
    'WARRANTY_CLAIM_VERSION_CONFLICT',
    'WarrantyClaim has changed since the caller last read it.',
  );

  const cancelled = cancelWarrantyClaim(claim, deps.clock.now());
  await deps.assetServiceRepository.updateWarrantyClaim(
    cancelled,
    expectedVersion,
  );
  return cancelled;
}

export async function createServicePlanCommand(
  deps: AssetServiceDependencies,
  actor: Actor,
  assetId: AssetId,
  input: {
    readonly name: string;
    readonly scheduleKind: ServicePlanKind;
    readonly firstDueOn: string;
    readonly intervalMonths?: number | null;
    readonly providerPartyId?: PartyId | null;
    readonly notes?: string | null;
  },
) {
  requireCapability(actor, 'service:write');
  await Promise.all([
    requireAsset(deps.assetRepository, assetId),
    requireParty(deps.partyRepository, input.providerPartyId),
  ]);

  const plan = createServicePlan({
    id: asServicePlanId(deps.idGenerator.next()),
    assetId,
    name: input.name,
    scheduleKind: input.scheduleKind,
    firstDueOn: input.firstDueOn,
    ...(input.intervalMonths !== undefined
      ? { intervalMonths: input.intervalMonths }
      : {}),
    ...(input.providerPartyId !== undefined
      ? { providerPartyId: input.providerPartyId }
      : {}),
    ...(input.notes !== undefined ? { notes: input.notes } : {}),
    createdAt: deps.clock.now(),
    createdByUserId: actor.userId,
  });

  await deps.assetServiceRepository.insertServicePlan(plan);
  return plan;
}

export async function changeServicePlanStatusCommand(
  repository: AssetServiceRepository,
  actor: Actor,
  planId: ServicePlanId,
  expectedVersion: number,
  status: ServicePlanStatus,
) {
  requireCapability(actor, 'service:write');
  const plan = await repository.getServicePlanById(planId);
  if (!plan) {
    throw new DomainError('SERVICE_PLAN_NOT_FOUND', 'ServicePlan not found.');
  }
  assertExpectedVersion(
    plan.version,
    expectedVersion,
    'SERVICE_PLAN_VERSION_CONFLICT',
    'ServicePlan has changed since the caller last read it.',
  );

  const changed = changeServicePlanStatus(plan, status);
  if (changed === plan) return plan;
  await repository.updateServicePlan(changed, expectedVersion);
  return changed;
}

export async function recordServiceEventCommand(
  deps: AssetServiceDependencies,
  actor: Actor,
  assetId: AssetId,
  input: {
    readonly servicePlanId?: ServicePlanId | null;
    readonly warrantyClaimId?: WarrantyClaimId | null;
    readonly eventType: ServiceEventType;
    readonly performedAt: string;
    readonly providerPartyId?: PartyId | null;
    readonly description: string;
    readonly reference?: string | null;
    readonly parts?: readonly {
      readonly name: string;
      readonly partNumber?: string | null;
      readonly serialNumber?: string | null;
      readonly quantity: number;
      readonly notes?: string | null;
    }[];
  },
) {
  requireCapability(actor, 'service:write');
  await Promise.all([
    requireAsset(deps.assetRepository, assetId),
    requireParty(deps.partyRepository, input.providerPartyId),
  ]);

  const servicePlan =
    input.servicePlanId == null
      ? null
      : await deps.assetServiceRepository.getServicePlanById(input.servicePlanId);
  if (input.servicePlanId != null && !servicePlan) {
    throw new DomainError('SERVICE_PLAN_NOT_FOUND', 'ServicePlan not found.');
  }

  const claim =
    input.warrantyClaimId == null
      ? null
      : await deps.assetServiceRepository.getWarrantyClaimById(
          input.warrantyClaimId,
        );
  if (input.warrantyClaimId != null && !claim) {
    throw new DomainError(
      'WARRANTY_CLAIM_NOT_FOUND',
      'WarrantyClaim not found.',
    );
  }

  const warranty =
    claim === null
      ? null
      : await deps.assetServiceRepository.getWarrantyById(claim.warrantyId);
  if (claim !== null && !warranty) {
    throw new DomainError(
      'WARRANTY_NOT_FOUND',
      'Warranty for WarrantyClaim not found.',
    );
  }

  const eventId = asServiceEventId(deps.idGenerator.next());
  const event = createServiceEvent({
    id: eventId,
    assetId,
    ...(servicePlan !== null ? { servicePlan } : {}),
    ...(claim !== null && warranty !== null
      ? { warrantyClaim: { claim, warranty } }
      : {}),
    eventType: input.eventType,
    performedAt: input.performedAt,
    ...(input.providerPartyId !== undefined
      ? { providerPartyId: input.providerPartyId }
      : {}),
    description: input.description,
    ...(input.reference !== undefined ? { reference: input.reference } : {}),
    parts: (input.parts ?? []).map((part) => ({
      id: asServicePartId(deps.idGenerator.next()),
      name: part.name,
      ...(part.partNumber !== undefined ? { partNumber: part.partNumber } : {}),
      ...(part.serialNumber !== undefined
        ? { serialNumber: part.serialNumber }
        : {}),
      quantity: part.quantity,
      ...(part.notes !== undefined ? { notes: part.notes } : {}),
    })),
    recordedAt: deps.clock.now(),
    recordedByUserId: actor.userId,
  });

  await deps.assetServiceRepository.insertServiceEvent(event);
  return event;
}
