import { asDateOnly, type DateOnly } from '../shared/date-only.js';
import { DomainError } from '../shared/domain-error.js';
import type {
  AssetId,
  PartyId,
  ServiceEventId,
  ServicePartId,
  ServicePlanId,
  UserId,
  WarrantyClaimId,
  WarrantyId,
} from '../shared/entity-id.js';

export const WARRANTY_TYPES = [
  'manufacturer',
  'seller',
  'extended',
  'other',
] as const;

export const WARRANTY_CLAIM_STATUSES = [
  'draft',
  'submitted',
  'approved',
  'rejected',
  'cancelled',
  'closed',
] as const;

export const SERVICE_PLAN_KINDS = ['one_time', 'recurring'] as const;
export const SERVICE_PLAN_STATUSES = [
  'active',
  'paused',
  'ended',
  'cancelled',
] as const;

export const SERVICE_EVENT_TYPES = [
  'routine_service',
  'repair',
  'diagnostic',
  'warranty_service',
  'other',
] as const;

export type WarrantyType = (typeof WARRANTY_TYPES)[number];
export type WarrantyClaimStatus = (typeof WARRANTY_CLAIM_STATUSES)[number];
export type ServicePlanKind = (typeof SERVICE_PLAN_KINDS)[number];
export type ServicePlanStatus = (typeof SERVICE_PLAN_STATUSES)[number];
export type ServiceEventType = (typeof SERVICE_EVENT_TYPES)[number];

export interface Warranty {
  readonly id: WarrantyId;
  readonly assetId: AssetId;
  readonly warrantyType: WarrantyType;
  readonly providerPartyId: PartyId | null;
  readonly reference: string | null;
  readonly validFrom: DateOnly;
  readonly validTo: DateOnly | null;
  readonly terms: string | null;
  readonly recordedAt: string;
  readonly recordedByUserId: UserId;
}

export interface WarrantyClaim {
  readonly id: WarrantyClaimId;
  readonly warrantyId: WarrantyId;
  readonly incidentOn: DateOnly;
  readonly description: string;
  readonly status: WarrantyClaimStatus;
  readonly providerReference: string | null;
  readonly submittedAt: string | null;
  readonly resolvedAt: string | null;
  readonly closedAt: string | null;
  readonly cancelledAt: string | null;
  readonly version: number;
}

export interface ServicePlan {
  readonly id: ServicePlanId;
  readonly assetId: AssetId;
  readonly name: string;
  readonly scheduleKind: ServicePlanKind;
  readonly firstDueOn: DateOnly;
  readonly intervalMonths: number | null;
  readonly providerPartyId: PartyId | null;
  readonly notes: string | null;
  readonly status: ServicePlanStatus;
  readonly version: number;
  readonly createdAt: string;
  readonly createdByUserId: UserId;
}

export interface ServicePart {
  readonly id: ServicePartId;
  readonly serviceEventId: ServiceEventId;
  readonly name: string;
  readonly partNumber: string | null;
  readonly serialNumber: string | null;
  readonly quantity: number;
  readonly notes: string | null;
}

export interface ServiceEvent {
  readonly id: ServiceEventId;
  readonly assetId: AssetId;
  readonly servicePlanId: ServicePlanId | null;
  readonly warrantyClaimId: WarrantyClaimId | null;
  readonly eventType: ServiceEventType;
  readonly performedAt: string;
  readonly providerPartyId: PartyId | null;
  readonly description: string;
  readonly reference: string | null;
  readonly parts: readonly ServicePart[];
  readonly recordedAt: string;
  readonly recordedByUserId: UserId;
}

function required(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new DomainError('ASSET_SERVICE_REQUIRED_FIELD', `${field} is required.`);
  }
  return normalized;
}

function optional(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const normalized = value.trim();
  return normalized || null;
}

function instant(value: string, field: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T/.test(value) || Number.isNaN(Date.parse(value))) {
    throw new DomainError(
      'ASSET_SERVICE_INVALID_TIMESTAMP',
      `${field} must be a valid ISO timestamp.`,
    );
  }
  return value;
}

function assertWarrantyCoverage(
  warranty: Warranty,
  incidentOn: DateOnly,
): void {
  if (
    incidentOn < warranty.validFrom ||
    (warranty.validTo !== null && incidentOn > warranty.validTo)
  ) {
    throw new DomainError(
      'WARRANTY_CLAIM_OUTSIDE_COVERAGE',
      'Warranty claim incident date must fall inside the warranty coverage interval.',
    );
  }
}

export function createWarranty(input: {
  readonly id: WarrantyId;
  readonly assetId: AssetId;
  readonly warrantyType: WarrantyType;
  readonly providerPartyId?: PartyId | null;
  readonly reference?: string | null;
  readonly validFrom: string;
  readonly validTo?: string | null;
  readonly terms?: string | null;
  readonly recordedAt: string;
  readonly recordedByUserId: UserId;
}): Warranty {
  const validFrom = asDateOnly(input.validFrom);
  const validTo =
    input.validTo === undefined || input.validTo === null
      ? null
      : asDateOnly(input.validTo);

  if (validTo !== null && validTo < validFrom) {
    throw new DomainError(
      'WARRANTY_INVALID_INTERVAL',
      'Warranty validTo cannot be before validFrom.',
    );
  }

  return {
    id: input.id,
    assetId: input.assetId,
    warrantyType: input.warrantyType,
    providerPartyId: input.providerPartyId ?? null,
    reference: optional(input.reference),
    validFrom,
    validTo,
    terms: optional(input.terms),
    recordedAt: instant(input.recordedAt, 'recordedAt'),
    recordedByUserId: input.recordedByUserId,
  };
}

export function createWarrantyClaim(input: {
  readonly id: WarrantyClaimId;
  readonly warranty: Warranty;
  readonly incidentOn: string;
  readonly description: string;
}): WarrantyClaim {
  const incidentOn = asDateOnly(input.incidentOn);
  assertWarrantyCoverage(input.warranty, incidentOn);

  return {
    id: input.id,
    warrantyId: input.warranty.id,
    incidentOn,
    description: required(input.description, 'description'),
    status: 'draft',
    providerReference: null,
    submittedAt: null,
    resolvedAt: null,
    closedAt: null,
    cancelledAt: null,
    version: 1,
  };
}

export function submitWarrantyClaim(
  claim: WarrantyClaim,
  submittedAtValue: string,
  providerReference?: string | null,
): WarrantyClaim {
  if (claim.status !== 'draft') {
    throw new DomainError(
      'WARRANTY_CLAIM_INVALID_TRANSITION',
      `Cannot submit WarrantyClaim from ${claim.status}.`,
    );
  }

  return {
    ...claim,
    status: 'submitted',
    providerReference: optional(providerReference),
    submittedAt: instant(submittedAtValue, 'submittedAt'),
    version: claim.version + 1,
  };
}

export function resolveWarrantyClaim(
  claim: WarrantyClaim,
  decision: 'approved' | 'rejected',
  resolvedAtValue: string,
): WarrantyClaim {
  if (claim.status !== 'submitted') {
    throw new DomainError(
      'WARRANTY_CLAIM_INVALID_TRANSITION',
      `Cannot resolve WarrantyClaim from ${claim.status}.`,
    );
  }

  return {
    ...claim,
    status: decision,
    resolvedAt: instant(resolvedAtValue, 'resolvedAt'),
    version: claim.version + 1,
  };
}

export function closeWarrantyClaim(
  claim: WarrantyClaim,
  closedAtValue: string,
): WarrantyClaim {
  if (claim.status !== 'approved') {
    throw new DomainError(
      'WARRANTY_CLAIM_INVALID_TRANSITION',
      `Cannot close WarrantyClaim from ${claim.status}.`,
    );
  }

  return {
    ...claim,
    status: 'closed',
    closedAt: instant(closedAtValue, 'closedAt'),
    version: claim.version + 1,
  };
}

export function cancelWarrantyClaim(
  claim: WarrantyClaim,
  cancelledAtValue: string,
): WarrantyClaim {
  if (claim.status !== 'draft' && claim.status !== 'submitted') {
    throw new DomainError(
      'WARRANTY_CLAIM_INVALID_TRANSITION',
      `Cannot cancel WarrantyClaim from ${claim.status}.`,
    );
  }

  return {
    ...claim,
    status: 'cancelled',
    cancelledAt: instant(cancelledAtValue, 'cancelledAt'),
    version: claim.version + 1,
  };
}

export function createServicePlan(input: {
  readonly id: ServicePlanId;
  readonly assetId: AssetId;
  readonly name: string;
  readonly scheduleKind: ServicePlanKind;
  readonly firstDueOn: string;
  readonly intervalMonths?: number | null;
  readonly providerPartyId?: PartyId | null;
  readonly notes?: string | null;
  readonly createdAt: string;
  readonly createdByUserId: UserId;
}): ServicePlan {
  const intervalMonths = input.intervalMonths ?? null;

  if (input.scheduleKind === 'one_time' && intervalMonths !== null) {
    throw new DomainError(
      'SERVICE_PLAN_INVALID_SCHEDULE',
      'One-time ServicePlan cannot have intervalMonths.',
    );
  }

  if (
    input.scheduleKind === 'recurring' &&
    (!Number.isInteger(intervalMonths) || (intervalMonths ?? 0) <= 0)
  ) {
    throw new DomainError(
      'SERVICE_PLAN_INVALID_SCHEDULE',
      'Recurring ServicePlan requires a positive integer intervalMonths.',
    );
  }

  return {
    id: input.id,
    assetId: input.assetId,
    name: required(input.name, 'name'),
    scheduleKind: input.scheduleKind,
    firstDueOn: asDateOnly(input.firstDueOn),
    intervalMonths,
    providerPartyId: input.providerPartyId ?? null,
    notes: optional(input.notes),
    status: 'active',
    version: 1,
    createdAt: instant(input.createdAt, 'createdAt'),
    createdByUserId: input.createdByUserId,
  };
}

export function changeServicePlanStatus(
  plan: ServicePlan,
  target: ServicePlanStatus,
): ServicePlan {
  if (target === plan.status) return plan;

  if (plan.status === 'ended' || plan.status === 'cancelled') {
    throw new DomainError(
      'SERVICE_PLAN_TERMINAL',
      `ServicePlan in status ${plan.status} cannot transition.`,
    );
  }

  const allowed =
    plan.status === 'active'
      ? target === 'paused' || target === 'ended' || target === 'cancelled'
      : target === 'active' || target === 'ended' || target === 'cancelled';

  if (!allowed) {
    throw new DomainError(
      'SERVICE_PLAN_INVALID_TRANSITION',
      `Cannot transition ServicePlan from ${plan.status} to ${target}.`,
    );
  }

  return {
    ...plan,
    status: target,
    version: plan.version + 1,
  };
}

export function createServiceEvent(input: {
  readonly id: ServiceEventId;
  readonly assetId: AssetId;
  readonly servicePlan?: ServicePlan | null;
  readonly warrantyClaim?: {
    readonly claim: WarrantyClaim;
    readonly warranty: Warranty;
  } | null;
  readonly eventType: ServiceEventType;
  readonly performedAt: string;
  readonly providerPartyId?: PartyId | null;
  readonly description: string;
  readonly reference?: string | null;
  readonly parts?: readonly {
    readonly id: ServicePartId;
    readonly name: string;
    readonly partNumber?: string | null;
    readonly serialNumber?: string | null;
    readonly quantity: number;
    readonly notes?: string | null;
  }[];
  readonly recordedAt: string;
  readonly recordedByUserId: UserId;
}): ServiceEvent {
  if (input.servicePlan && input.servicePlan.assetId !== input.assetId) {
    throw new DomainError(
      'SERVICE_EVENT_PLAN_ASSET_MISMATCH',
      'ServicePlan must belong to the serviced Asset.',
    );
  }

  if (input.warrantyClaim) {
    if (
      input.warrantyClaim.claim.warrantyId !== input.warrantyClaim.warranty.id ||
      input.warrantyClaim.warranty.assetId !== input.assetId
    ) {
      throw new DomainError(
        'SERVICE_EVENT_CLAIM_ASSET_MISMATCH',
        'WarrantyClaim must resolve to the serviced Asset.',
      );
    }
  }

  const performedAt = instant(input.performedAt, 'performedAt');
  const recordedAt = instant(input.recordedAt, 'recordedAt');
  if (Date.parse(performedAt) > Date.parse(recordedAt)) {
    throw new DomainError(
      'SERVICE_EVENT_PERFORMED_IN_FUTURE',
      'ServiceEvent performedAt cannot be after recordedAt.',
    );
  }

  const seenPartIds = new Set<ServicePartId>();
  const parts = (input.parts ?? []).map((part): ServicePart => {
    if (seenPartIds.has(part.id)) {
      throw new DomainError(
        'SERVICE_EVENT_DUPLICATE_PART',
        'ServicePart ids must be unique inside one ServiceEvent.',
      );
    }
    seenPartIds.add(part.id);

    if (!Number.isInteger(part.quantity) || part.quantity <= 0) {
      throw new DomainError(
        'SERVICE_PART_INVALID_QUANTITY',
        'ServicePart quantity must be a positive integer.',
      );
    }

    return {
      id: part.id,
      serviceEventId: input.id,
      name: required(part.name, 'part.name'),
      partNumber: optional(part.partNumber),
      serialNumber: optional(part.serialNumber),
      quantity: part.quantity,
      notes: optional(part.notes),
    };
  });

  return {
    id: input.id,
    assetId: input.assetId,
    servicePlanId: input.servicePlan?.id ?? null,
    warrantyClaimId: input.warrantyClaim?.claim.id ?? null,
    eventType: input.eventType,
    performedAt,
    providerPartyId: input.providerPartyId ?? null,
    description: required(input.description, 'description'),
    reference: optional(input.reference),
    parts,
    recordedAt,
    recordedByUserId: input.recordedByUserId,
  };
}
