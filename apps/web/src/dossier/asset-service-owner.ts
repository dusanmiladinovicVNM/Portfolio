import type {
  ServiceEventResponse,
  ServicePlanResponse,
  WarrantyClaimResponse,
  WarrantyResponse,
} from '@portfolio/contracts';

export function assertAssetWarrantiesOwner(
  assetId: string,
  warranties: readonly WarrantyResponse[],
): void {
  if (warranties.some((warranty) => warranty.assetId !== assetId)) {
    throw new Error(
      'Asset Warranty list contains coverage owned by another Asset.',
    );
  }
}

export function assertWarrantyClaimsOwner(
  warrantyId: string,
  claims: readonly WarrantyClaimResponse[],
): void {
  if (claims.some((claim) => claim.warrantyId !== warrantyId)) {
    throw new Error(
      'Warranty Claim list contains a claim owned by another Warranty.',
    );
  }
}

export function assertAssetServicePlansOwner(
  assetId: string,
  plans: readonly ServicePlanResponse[],
): void {
  if (plans.some((plan) => plan.assetId !== assetId)) {
    throw new Error(
      'Asset ServicePlan list contains policy owned by another Asset.',
    );
  }
}

export function assertAssetServiceEventsOwner(
  assetId: string,
  events: readonly ServiceEventResponse[],
): void {
  if (events.some((event) => event.assetId !== assetId)) {
    throw new Error(
      'Asset ServiceEvent list contains an occurrence owned by another Asset.',
    );
  }
}

export function assertCreatedWarranty(
  assetId: string,
  expected: {
    readonly warrantyType: WarrantyResponse['warrantyType'];
    readonly providerPartyId: string | null;
    readonly reference: string | null;
    readonly validFrom: string;
    readonly validTo: string | null;
    readonly terms: string | null;
  },
  warranty: WarrantyResponse,
): void {
  if (
    warranty.assetId !== assetId ||
    warranty.warrantyType !== expected.warrantyType ||
    warranty.providerPartyId !== expected.providerPartyId ||
    warranty.reference !== expected.reference ||
    warranty.validFrom !== expected.validFrom ||
    warranty.validTo !== expected.validTo ||
    warranty.terms !== expected.terms
  ) {
    throw new Error(
      'Created Warranty does not match submitted Asset coverage.',
    );
  }
}

export function assertCreatedWarrantyClaim(
  warrantyId: string,
  expected: {
    readonly incidentOn: string;
    readonly description: string;
  },
  claim: WarrantyClaimResponse,
): void {
  if (
    claim.warrantyId !== warrantyId ||
    claim.incidentOn !== expected.incidentOn ||
    claim.description !== expected.description ||
    claim.status !== 'draft' ||
    claim.providerReference !== null ||
    claim.submittedAt !== null ||
    claim.resolvedAt !== null ||
    claim.closedAt !== null ||
    claim.cancelledAt !== null ||
    claim.version !== 1
  ) {
    throw new Error(
      'Created WarrantyClaim does not match submitted incident.',
    );
  }
}

function sameClaimIdentity(
  current: WarrantyClaimResponse,
  next: WarrantyClaimResponse,
): boolean {
  return (
    next.id === current.id &&
    next.warrantyId === current.warrantyId &&
    next.incidentOn === current.incidentOn &&
    next.description === current.description &&
    next.recordedAt === current.recordedAt &&
    next.recordedByUserId === current.recordedByUserId
  );
}

export function assertWarrantyClaimTransition(
  current: WarrantyClaimResponse,
  next: WarrantyClaimResponse,
  expected: {
    readonly status: WarrantyClaimResponse['status'];
    readonly providerReference?: string | null;
  },
): void {
  if (
    !sameClaimIdentity(current, next) ||
    next.version !== current.version + 1 ||
    next.status !== expected.status ||
    (expected.providerReference !== undefined &&
      next.providerReference !== expected.providerReference)
  ) {
    throw new Error(
      'WarrantyClaim response does not match requested lifecycle transition.',
    );
  }

  if (
    expected.status === 'submitted' &&
    (next.submittedAt === null ||
      next.resolvedAt !== null ||
      next.closedAt !== null ||
      next.cancelledAt !== null)
  ) {
    throw new Error('Submitted WarrantyClaim has invalid lifecycle timestamps.');
  }
  if (
    (expected.status === 'approved' || expected.status === 'rejected') &&
    (next.submittedAt === null ||
      next.resolvedAt === null ||
      next.closedAt !== null ||
      next.cancelledAt !== null)
  ) {
    throw new Error('Resolved WarrantyClaim has invalid lifecycle timestamps.');
  }
  if (
    expected.status === 'closed' &&
    (next.submittedAt === null ||
      next.resolvedAt === null ||
      next.closedAt === null ||
      next.cancelledAt !== null)
  ) {
    throw new Error('Closed WarrantyClaim has invalid lifecycle timestamps.');
  }
  if (
    expected.status === 'cancelled' &&
    next.cancelledAt === null
  ) {
    throw new Error('Cancelled WarrantyClaim is missing cancellation time.');
  }
}

export function assertCreatedServicePlan(
  assetId: string,
  expected: {
    readonly name: string;
    readonly scheduleKind: ServicePlanResponse['scheduleKind'];
    readonly firstDueOn: string;
    readonly intervalMonths: number | null;
    readonly providerPartyId: string | null;
    readonly notes: string | null;
  },
  plan: ServicePlanResponse,
): void {
  if (
    plan.assetId !== assetId ||
    plan.name !== expected.name ||
    plan.scheduleKind !== expected.scheduleKind ||
    plan.firstDueOn !== expected.firstDueOn ||
    plan.intervalMonths !== expected.intervalMonths ||
    plan.providerPartyId !== expected.providerPartyId ||
    plan.notes !== expected.notes ||
    plan.status !== 'active' ||
    plan.version !== 1
  ) {
    throw new Error(
      'Created ServicePlan does not match submitted service policy.',
    );
  }
}

export function assertServicePlanTransition(
  current: ServicePlanResponse,
  next: ServicePlanResponse,
  status: ServicePlanResponse['status'],
): void {
  if (
    next.id !== current.id ||
    next.assetId !== current.assetId ||
    next.name !== current.name ||
    next.scheduleKind !== current.scheduleKind ||
    next.firstDueOn !== current.firstDueOn ||
    next.intervalMonths !== current.intervalMonths ||
    next.providerPartyId !== current.providerPartyId ||
    next.notes !== current.notes ||
    next.createdAt !== current.createdAt ||
    next.createdByUserId !== current.createdByUserId ||
    next.status !== status ||
    next.version !== current.version + 1
  ) {
    throw new Error(
      'ServicePlan response does not match requested lifecycle transition.',
    );
  }
}

export function assertCreatedStandaloneServiceEvent(
  assetId: string,
  expected: {
    readonly servicePlanId: string | null;
    readonly warrantyClaimId: string | null;
    readonly eventType: ServiceEventResponse['eventType'];
    readonly performedAt: string;
    readonly providerPartyId: string | null;
    readonly description: string;
    readonly reference: string | null;
  },
  event: ServiceEventResponse,
): void {
  if (
    event.assetId !== assetId ||
    event.servicePlanId !== expected.servicePlanId ||
    event.warrantyClaimId !== expected.warrantyClaimId ||
    event.eventType !== expected.eventType ||
    event.performedAt !== expected.performedAt ||
    event.providerPartyId !== expected.providerPartyId ||
    event.description !== expected.description ||
    event.reference !== expected.reference ||
    event.parts.length !== 0
  ) {
    throw new Error(
      'Created ServiceEvent does not match submitted Asset occurrence.',
    );
  }
}
