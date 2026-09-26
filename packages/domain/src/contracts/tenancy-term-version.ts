import { asDateOnly, type DateOnly } from '../shared/date-only.js';
import { DomainError } from '../shared/domain-error.js';
import type {
  LeaseAgreementId,
  LeaseAmendmentId,
  TenancyId,
  TenancyTermVersionId,
} from '../shared/entity-id.js';
import {
  asCurrencyCode,
  asMoneyAmount,
  type CurrencyCode,
  type MoneyAmount,
} from '../shared/money.js';

export const BILLING_FREQUENCIES = ['monthly', 'quarterly', 'semiannual', 'yearly'] as const;
export const TERM_SOURCE_TYPES = ['agreement', 'amendment'] as const;

export type BillingFrequency = (typeof BILLING_FREQUENCIES)[number];
export type TermSourceType = (typeof TERM_SOURCE_TYPES)[number];

export interface TenancyTermVersion {
  readonly id: TenancyTermVersionId;
  readonly tenancyId: TenancyId;
  readonly sourceType: TermSourceType;
  readonly sourceAgreementId: LeaseAgreementId | null;
  readonly sourceAmendmentId: LeaseAmendmentId | null;
  readonly effectiveFrom: DateOnly;
  readonly currency: CurrencyCode;
  readonly baseRent: MoneyAmount;
  readonly serviceCharge: MoneyAmount;
  readonly utilitiesAdvance: MoneyAmount;
  readonly parkingRent: MoneyAmount;
  readonly otherRecurringCharge: MoneyAmount;
  readonly depositRequired: MoneyAmount;
  readonly billingFrequency: BillingFrequency;
  readonly noticePeriodTenantDays: number | null;
  readonly noticePeriodLandlordDays: number | null;
}

export interface TermSnapshotInput {
  currency: string;
  baseRent: string;
  serviceCharge?: string;
  utilitiesAdvance?: string;
  parkingRent?: string;
  otherRecurringCharge?: string;
  depositRequired?: string;
  billingFrequency?: BillingFrequency;
  noticePeriodTenantDays?: number | null;
  noticePeriodLandlordDays?: number | null;
}

export interface CreateAgreementTermVersionInput extends TermSnapshotInput {
  id: TenancyTermVersionId;
  tenancyId: TenancyId;
  sourceType: 'agreement';
  sourceAgreementId: LeaseAgreementId;
  effectiveFrom: string;
}

export interface CreateAmendmentTermVersionInput extends TermSnapshotInput {
  id: TenancyTermVersionId;
  tenancyId: TenancyId;
  sourceType: 'amendment';
  sourceAmendmentId: LeaseAmendmentId;
  effectiveFrom: string;
}

export type CreateTenancyTermVersionInput =
  | CreateAgreementTermVersionInput
  | CreateAmendmentTermVersionInput;

function nonNegativeInteger(
  value: number | undefined,
  field: string,
): number {
  const normalized = value ?? 0;
  if (!Number.isInteger(normalized) || normalized < 0) {
    throw new DomainError(
      'LEASE_TERMS_INVALID_NOTICE_PERIOD',
      `${field} must be a non-negative integer number of days.`,
    );
  }
  return normalized;
}

function nullableNonNegativeInteger(
  value: number | null | undefined,
  field: string,
): number | null {
  return value === null ? null : nonNegativeInteger(value, field);
}

export function createTenancyTermVersion(
  input: CreateTenancyTermVersionInput,
): TenancyTermVersion {
  const common = {
    id: input.id,
    tenancyId: input.tenancyId,
    effectiveFrom: asDateOnly(input.effectiveFrom),
    currency: asCurrencyCode(input.currency),
    baseRent: asMoneyAmount(input.baseRent),
    serviceCharge: asMoneyAmount(input.serviceCharge ?? '0'),
    utilitiesAdvance: asMoneyAmount(input.utilitiesAdvance ?? '0'),
    parkingRent: asMoneyAmount(input.parkingRent ?? '0'),
    otherRecurringCharge: asMoneyAmount(input.otherRecurringCharge ?? '0'),
    depositRequired: asMoneyAmount(input.depositRequired ?? '0'),
    billingFrequency: input.billingFrequency ?? 'monthly',
    noticePeriodTenantDays: nullableNonNegativeInteger(
      input.noticePeriodTenantDays,
      'noticePeriodTenantDays',
    ),
    noticePeriodLandlordDays: nullableNonNegativeInteger(
      input.noticePeriodLandlordDays,
      'noticePeriodLandlordDays',
    ),
  };

  return input.sourceType === 'agreement'
    ? {
        ...common,
        sourceType: 'agreement',
        sourceAgreementId: input.sourceAgreementId,
        sourceAmendmentId: null,
      }
    : {
        ...common,
        sourceType: 'amendment',
        sourceAgreementId: null,
        sourceAmendmentId: input.sourceAmendmentId,
      };
}
