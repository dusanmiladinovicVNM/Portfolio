import { asDateOnly, type DateOnly } from '../shared/date-only.js';
import { DomainError } from '../shared/domain-error.js';
import {
  asCurrencyCode,
  asMoneyAmount,
  type CurrencyCode,
  type MoneyAmount,
} from '../shared/money.js';
import type {
  AssetId,
  CostId,
  CostReversalId,
  ImprovementProjectId,
  PartyId,
  PropertyId,
  ServiceEventId,
  SpaceId,
  UnitId,
  UserId,
  WarrantyClaimId,
  WorkItemId,
  WorkMaterialId,
  WorkRecordId,
} from '../shared/entity-id.js';

export const COST_REPORTING_CLASSES = [
  'capex',
  'opex',
  'unclassified',
] as const;

export type CostReportingClass = (typeof COST_REPORTING_CLASSES)[number];

export type CostSource =
  | { readonly kind: 'property'; readonly propertyId: PropertyId }
  | { readonly kind: 'unit'; readonly unitId: UnitId }
  | { readonly kind: 'space'; readonly spaceId: SpaceId }
  | { readonly kind: 'asset'; readonly assetId: AssetId }
  | {
      readonly kind: 'warranty_claim';
      readonly warrantyClaimId: WarrantyClaimId;
    }
  | {
      readonly kind: 'service_event';
      readonly serviceEventId: ServiceEventId;
    }
  | {
      readonly kind: 'improvement_project';
      readonly improvementProjectId: ImprovementProjectId;
    }
  | { readonly kind: 'work_item'; readonly workItemId: WorkItemId }
  | { readonly kind: 'work_record'; readonly workRecordId: WorkRecordId }
  | {
      readonly kind: 'work_material';
      readonly workMaterialId: WorkMaterialId;
    };

export interface Cost {
  readonly id: CostId;
  readonly source: CostSource;
  readonly description: string;
  readonly amount: MoneyAmount;
  readonly currency: CurrencyCode;
  readonly incurredOn: DateOnly;
  readonly reportingClass: CostReportingClass;
  readonly supplierPartyId: PartyId | null;
  readonly invoiceReference: string | null;
  readonly recordedAt: string;
  readonly recordedByUserId: UserId;
}

export interface CostReversal {
  readonly id: CostReversalId;
  readonly costId: CostId;
  readonly replacementCostId: CostId | null;
  readonly reason: string;
  readonly recordedAt: string;
  readonly recordedByUserId: UserId;
}

function required(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new DomainError('COST_REQUIRED_FIELD', `${field} is required.`);
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
      'COST_INVALID_TIMESTAMP',
      `${field} must be a valid ISO timestamp.`,
    );
  }
  return value;
}

function utcDateOfInstant(value: string): string {
  return new Date(value).toISOString().slice(0, 10);
}

function positiveMoney(value: string): MoneyAmount {
  const amount = asMoneyAmount(value);
  if (amount === '0.00') {
    throw new DomainError(
      'COST_AMOUNT_NOT_POSITIVE',
      'Cost amount must be greater than zero.',
    );
  }
  return amount;
}

export function createCost(input: {
  readonly id: CostId;
  readonly source: CostSource;
  readonly description: string;
  readonly amount: string;
  readonly currency: string;
  readonly incurredOn: string;
  readonly reportingClass: CostReportingClass;
  readonly supplierPartyId?: PartyId | null;
  readonly invoiceReference?: string | null;
  readonly recordedAt: string;
  readonly recordedByUserId: UserId;
}): Cost {
  const recordedAt = instant(input.recordedAt, 'recordedAt');
  const incurredOn = asDateOnly(input.incurredOn);

  if (incurredOn > utcDateOfInstant(recordedAt)) {
    throw new DomainError(
      'COST_INCURRED_IN_FUTURE',
      'Cost incurredOn cannot be after the UTC recording date.',
    );
  }

  return {
    id: input.id,
    source: input.source,
    description: required(input.description, 'description'),
    amount: positiveMoney(input.amount),
    currency: asCurrencyCode(input.currency),
    incurredOn,
    reportingClass: input.reportingClass,
    supplierPartyId: input.supplierPartyId ?? null,
    invoiceReference: optional(input.invoiceReference),
    recordedAt,
    recordedByUserId: input.recordedByUserId,
  };
}

export function createCostReversal(input: {
  readonly id: CostReversalId;
  readonly cost: Cost;
  readonly replacementCost?: Cost | null;
  readonly reason: string;
  readonly recordedAt: string;
  readonly recordedByUserId: UserId;
}): CostReversal {
  const recordedAt = instant(input.recordedAt, 'recordedAt');

  if (Date.parse(recordedAt) < Date.parse(input.cost.recordedAt)) {
    throw new DomainError(
      'COST_REVERSAL_BEFORE_COST',
      'Cost reversal cannot be recorded before the original Cost.',
    );
  }

  if (input.replacementCost?.id === input.cost.id) {
    throw new DomainError(
      'COST_REVERSAL_SELF_REPLACEMENT',
      'A Cost cannot replace itself.',
    );
  }

  if (
    input.replacementCost !== undefined &&
    input.replacementCost !== null &&
    input.replacementCost.recordedAt !== recordedAt
  ) {
    throw new DomainError(
      'COST_REPLACEMENT_RECORDING_MISMATCH',
      'Replacement Cost and reversal must share the same recordedAt.',
    );
  }

  return {
    id: input.id,
    costId: input.cost.id,
    replacementCostId: input.replacementCost?.id ?? null,
    reason: required(input.reason, 'reason'),
    recordedAt,
    recordedByUserId: input.recordedByUserId,
  };
}
