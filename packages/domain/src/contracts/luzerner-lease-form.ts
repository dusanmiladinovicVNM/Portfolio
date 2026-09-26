import { DomainError } from '../shared/domain-error.js';
import type { LeaseAgreementId } from '../shared/entity-id.js';
import { asDateOnly, type DateOnly } from '../shared/date-only.js';
import { asMoneyAmount, type MoneyAmount } from '../shared/money.js';

export const LUZERNER_LEASE_TEMPLATE_CODE = 'lu-2020' as const;

export const LUZERNER_ANCILLARY_COST_KEYS = [
  'heating_hot_water',
  'cold_water',
  'caretaker_stair_cleaning',
  'garden_surroundings_snow',
  'lift',
  'common_electricity_gas',
  'ara_kva_sewer',
  'tv_cable',
  'laundry',
  'administration_share',
] as const;

export const LUZERNER_SHARED_USE_KEYS = [
  'laundry_room',
  'drying_room',
  'drying_area',
  'stroller_room',
  'garden',
  'hobby_room',
  'playground',
  'bicycle_moped_room',
] as const;

export type LuzernerAncillaryCostKey =
  (typeof LUZERNER_ANCILLARY_COST_KEYS)[number];
export type LuzernerSharedUseKey =
  (typeof LUZERNER_SHARED_USE_KEYS)[number];

export type LuzernerAncillaryCostMode = 'excluded' | 'advance' | 'flat';
export type LuzernerUseType = 'apartment' | 'commercial' | 'other';
export type LuzernerLeaseDurationKind =
  | 'indefinite'
  | 'minimum_term'
  | 'fixed_term';
export type LuzernerTerminationSchedule =
  | 'monthly_except_december'
  | 'quarter_ends'
  | 'custom';
export type LuzernerNoticePeriodKind =
  | 'residential_3_months'
  | 'commercial_6_months'
  | 'furnished_room_14_days'
  | 'longer_months';
export type LuzernerPaymentFrequency =
  | 'monthly'
  | 'quarterly'
  | 'semiannual';
export type LuzernerRentAdjustmentMode =
  | 'termination_date'
  | 'indexation'
  | 'graduated';
export type LuzernerAncillaryClosingDate =
  | 'june_30'
  | 'december_31'
  | 'custom';
export type LuzernerBooleanChoice = 'yes' | 'no' | 'unset';

export interface LuzernerCustomAncillaryCost {
  readonly label: string;
  readonly mode: LuzernerAncillaryCostMode;
}

export interface LuzernerLeaseFormContent {
  readonly ewid: string | null;
  readonly egid: string | null;

  readonly intendedForPersonCount: number | null;
  readonly familyApartment: boolean;
  readonly registeredPartnership: boolean;
  readonly furnished: boolean;

  readonly separateRoom: boolean;
  readonly cellar: boolean;
  readonly attic: boolean;
  readonly separateApartment: boolean;
  readonly garage: boolean;
  readonly garageNumber: string | null;
  readonly parkingSpace: boolean;
  readonly parkingSpaceNumber: string | null;
  readonly additionalObjectLabel: string | null;

  readonly sharedUse: Readonly<Record<LuzernerSharedUseKey, boolean>>;
  readonly customSharedUse: readonly string[];

  readonly useType: LuzernerUseType;
  readonly useTypeOther: string | null;

  readonly moveInDate: DateOnly | null;
  readonly durationKind: LuzernerLeaseDurationKind;
  readonly minimumCancelableOn: DateOnly | null;
  readonly fixedEndDate: DateOnly | null;
  readonly terminationSchedule: LuzernerTerminationSchedule;
  readonly terminationScheduleCustom: string | null;
  readonly noticePeriodKind: LuzernerNoticePeriodKind;
  readonly longerNoticeMonths: number | null;

  readonly currency: 'CHF';
  readonly netRent: MoneyAmount | null;
  readonly garageParkingRent: MoneyAmount | null;
  readonly ancillaryAdvance: MoneyAmount | null;
  readonly ancillaryFlat: MoneyAmount | null;
  readonly ancillaryCosts: Readonly<
    Record<LuzernerAncillaryCostKey, LuzernerAncillaryCostMode>
  >;
  readonly customAncillaryCosts: readonly LuzernerCustomAncillaryCost[];
  readonly paymentFrequency: LuzernerPaymentFrequency;

  readonly rentAdjustmentMode: LuzernerRentAdjustmentMode;
  readonly rentAdjustmentAdvanceMonths: number | null;
  readonly consumerPriceIndexPoints: string | null;

  readonly ancillaryClosingDate: LuzernerAncillaryClosingDate;
  readonly ancillaryClosingDateCustom: string | null;

  readonly securityAmount: MoneyAmount | null;
  readonly tenantNamedDepositAccount: boolean;
  readonly depositAccountReference: string | null;
  readonly privateLiabilityPolicy: LuzernerBooleanChoice;

  readonly mortgageReferenceRate: string | null;
  readonly costIncreaseCompensatedThrough: string | null;
  readonly consumerPriceIndex: string | null;
  readonly consumerPriceIndexMonthYear: string | null;
  readonly consumerPriceIndexBasis: string | null;

  readonly rentReserveAmount: MoneyAmount | null;
  readonly rentReservePercent: string | null;
  readonly separateRentReserveAgreement: boolean;

  readonly remarksAttachments: string;
  readonly initialRentFormAttached: boolean;
  readonly specialProvisions: string;

  readonly placeOfSigning: string | null;
  readonly signingDate: DateOnly | null;
}

export type LuzernerLeaseFormContentInput = Omit<
  LuzernerLeaseFormContent,
  | 'moveInDate'
  | 'minimumCancelableOn'
  | 'fixedEndDate'
  | 'netRent'
  | 'garageParkingRent'
  | 'ancillaryAdvance'
  | 'ancillaryFlat'
  | 'securityAmount'
  | 'rentReserveAmount'
  | 'signingDate'
> & {
  readonly moveInDate: string | DateOnly | null;
  readonly minimumCancelableOn: string | DateOnly | null;
  readonly fixedEndDate: string | DateOnly | null;
  readonly netRent: string | MoneyAmount | null;
  readonly garageParkingRent: string | MoneyAmount | null;
  readonly ancillaryAdvance: string | MoneyAmount | null;
  readonly ancillaryFlat: string | MoneyAmount | null;
  readonly securityAmount: string | MoneyAmount | null;
  readonly rentReserveAmount: string | MoneyAmount | null;
  readonly signingDate: string | DateOnly | null;
};

export interface LuzernerLeaseFormDraft {
  readonly agreementId: LeaseAgreementId;
  readonly templateCode: typeof LUZERNER_LEASE_TEMPLATE_CODE;
  readonly revision: number;
  readonly content: LuzernerLeaseFormContent;
}

export type LuzernerLeaseFormPatch = Partial<LuzernerLeaseFormContent>;

function nullableTrimmed(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const normalized = value.trim();
  return normalized || null;
}

function nonNegativeIntegerOrNull(
  value: number | null | undefined,
  field: string,
): number | null {
  if (value === undefined || value === null) return null;
  if (!Number.isInteger(value) || value < 0) {
    throw new DomainError(
      'LUZERNER_LEASE_FORM_INVALID_NUMBER',
      `${field} must be a non-negative integer.`,
    );
  }
  return value;
}

function positiveIntegerOrNull(
  value: number | null | undefined,
  field: string,
): number | null {
  const normalized = nonNegativeIntegerOrNull(value, field);
  if (normalized === null) return null;
  if (normalized === 0) {
    throw new DomainError(
      'LUZERNER_LEASE_FORM_INVALID_NUMBER',
      `${field} must be greater than zero.`,
    );
  }
  return normalized;
}

function moneyOrNull(
  value: string | MoneyAmount | null | undefined,
): MoneyAmount | null {
  if (value === undefined || value === null || value.trim() === '') return null;
  return asMoneyAmount(value);
}

function dateOrNull(
  value: string | DateOnly | null | undefined,
): DateOnly | null {
  if (value === undefined || value === null || value.trim() === '') return null;
  return asDateOnly(value);
}

function defaultSharedUse(): Record<LuzernerSharedUseKey, boolean> {
  return Object.fromEntries(
    LUZERNER_SHARED_USE_KEYS.map((key) => [key, false]),
  ) as Record<LuzernerSharedUseKey, boolean>;
}

function defaultAncillaryCosts(): Record<
  LuzernerAncillaryCostKey,
  LuzernerAncillaryCostMode
> {
  return Object.fromEntries(
    LUZERNER_ANCILLARY_COST_KEYS.map((key) => [key, 'excluded']),
  ) as Record<LuzernerAncillaryCostKey, LuzernerAncillaryCostMode>;
}

function normalizeCustomSharedUse(
  values: readonly string[] | undefined,
): readonly string[] {
  const normalized = (values ?? [])
    .map((value) => value.trim())
    .filter(Boolean);
  if (normalized.length > 2) {
    throw new DomainError(
      'LUZERNER_LEASE_FORM_TOO_MANY_CUSTOM_SHARED_USE',
      'The Luzerner 2020 form has space for at most two custom shared-use entries.',
    );
  }
  return normalized;
}

function normalizeCustomAncillaryCosts(
  values: readonly LuzernerCustomAncillaryCost[] | undefined,
): readonly LuzernerCustomAncillaryCost[] {
  const normalized = (values ?? [])
    .map((value) => ({ ...value, label: value.label.trim() }))
    .filter((value) => value.label.length > 0);
  if (normalized.length > 2) {
    throw new DomainError(
      'LUZERNER_LEASE_FORM_TOO_MANY_CUSTOM_ANCILLARY_COSTS',
      'The Luzerner 2020 form has space for at most two custom ancillary-cost entries.',
    );
  }
  return normalized;
}

export function emptyLuzernerLeaseFormContent(): LuzernerLeaseFormContent {
  return {
    ewid: null,
    egid: null,
    intendedForPersonCount: null,
    familyApartment: false,
    registeredPartnership: false,
    furnished: false,
    separateRoom: false,
    cellar: false,
    attic: false,
    separateApartment: false,
    garage: false,
    garageNumber: null,
    parkingSpace: false,
    parkingSpaceNumber: null,
    additionalObjectLabel: null,
    sharedUse: defaultSharedUse(),
    customSharedUse: [],
    useType: 'apartment',
    useTypeOther: null,
    moveInDate: null,
    durationKind: 'indefinite',
    minimumCancelableOn: null,
    fixedEndDate: null,
    terminationSchedule: 'monthly_except_december',
    terminationScheduleCustom: null,
    noticePeriodKind: 'residential_3_months',
    longerNoticeMonths: null,
    currency: 'CHF',
    netRent: null,
    garageParkingRent: null,
    ancillaryAdvance: null,
    ancillaryFlat: null,
    ancillaryCosts: defaultAncillaryCosts(),
    customAncillaryCosts: [],
    paymentFrequency: 'monthly',
    rentAdjustmentMode: 'termination_date',
    rentAdjustmentAdvanceMonths: null,
    consumerPriceIndexPoints: null,
    ancillaryClosingDate: 'december_31',
    ancillaryClosingDateCustom: null,
    securityAmount: null,
    tenantNamedDepositAccount: false,
    depositAccountReference: null,
    privateLiabilityPolicy: 'unset',
    mortgageReferenceRate: null,
    costIncreaseCompensatedThrough: null,
    consumerPriceIndex: null,
    consumerPriceIndexMonthYear: null,
    consumerPriceIndexBasis: null,
    rentReserveAmount: null,
    rentReservePercent: null,
    separateRentReserveAgreement: false,
    remarksAttachments: '',
    initialRentFormAttached: false,
    specialProvisions: '',
    placeOfSigning: null,
    signingDate: null,
  };
}

export function normalizeLuzernerLeaseFormContent(
  input: LuzernerLeaseFormContentInput,
): LuzernerLeaseFormContent {
  const sharedUse = {
    ...defaultSharedUse(),
    ...input.sharedUse,
  };
  const ancillaryCosts = {
    ...defaultAncillaryCosts(),
    ...input.ancillaryCosts,
  };

  const content: LuzernerLeaseFormContent = {
    ...input,
    ewid: nullableTrimmed(input.ewid),
    egid: nullableTrimmed(input.egid),
    intendedForPersonCount: positiveIntegerOrNull(
      input.intendedForPersonCount,
      'intendedForPersonCount',
    ),
    garageNumber: nullableTrimmed(input.garageNumber),
    parkingSpaceNumber: nullableTrimmed(input.parkingSpaceNumber),
    additionalObjectLabel: nullableTrimmed(input.additionalObjectLabel),
    sharedUse,
    customSharedUse: normalizeCustomSharedUse(input.customSharedUse),
    useTypeOther: nullableTrimmed(input.useTypeOther),
    moveInDate: dateOrNull(input.moveInDate),
    minimumCancelableOn: dateOrNull(input.minimumCancelableOn),
    fixedEndDate: dateOrNull(input.fixedEndDate),
    terminationScheduleCustom: nullableTrimmed(
      input.terminationScheduleCustom,
    ),
    longerNoticeMonths: positiveIntegerOrNull(
      input.longerNoticeMonths,
      'longerNoticeMonths',
    ),
    netRent: moneyOrNull(input.netRent),
    garageParkingRent: moneyOrNull(input.garageParkingRent),
    ancillaryAdvance: moneyOrNull(input.ancillaryAdvance),
    ancillaryFlat: moneyOrNull(input.ancillaryFlat),
    ancillaryCosts,
    customAncillaryCosts: normalizeCustomAncillaryCosts(
      input.customAncillaryCosts,
    ),
    rentAdjustmentAdvanceMonths: nonNegativeIntegerOrNull(
      input.rentAdjustmentAdvanceMonths,
      'rentAdjustmentAdvanceMonths',
    ),
    consumerPriceIndexPoints: nullableTrimmed(
      input.consumerPriceIndexPoints,
    ),
    ancillaryClosingDateCustom: nullableTrimmed(
      input.ancillaryClosingDateCustom,
    ),
    securityAmount: moneyOrNull(input.securityAmount),
    depositAccountReference: nullableTrimmed(input.depositAccountReference),
    mortgageReferenceRate: nullableTrimmed(input.mortgageReferenceRate),
    costIncreaseCompensatedThrough: nullableTrimmed(
      input.costIncreaseCompensatedThrough,
    ),
    consumerPriceIndex: nullableTrimmed(input.consumerPriceIndex),
    consumerPriceIndexMonthYear: nullableTrimmed(
      input.consumerPriceIndexMonthYear,
    ),
    consumerPriceIndexBasis: nullableTrimmed(input.consumerPriceIndexBasis),
    rentReserveAmount: moneyOrNull(input.rentReserveAmount),
    rentReservePercent: nullableTrimmed(input.rentReservePercent),
    remarksAttachments: input.remarksAttachments.trim(),
    specialProvisions: input.specialProvisions.trim(),
    placeOfSigning: nullableTrimmed(input.placeOfSigning),
    signingDate: dateOrNull(input.signingDate),
  };

  if (
    content.durationKind === 'minimum_term' &&
    content.minimumCancelableOn === null
  ) {
    throw new DomainError(
      'LUZERNER_LEASE_FORM_MINIMUM_TERM_DATE_REQUIRED',
      'minimumCancelableOn is required for a minimum-term lease.',
    );
  }
  if (
    content.durationKind === 'fixed_term' &&
    content.fixedEndDate === null
  ) {
    throw new DomainError(
      'LUZERNER_LEASE_FORM_FIXED_END_REQUIRED',
      'fixedEndDate is required for a fixed-term lease.',
    );
  }
  if (
    content.noticePeriodKind === 'longer_months' &&
    content.longerNoticeMonths === null
  ) {
    throw new DomainError(
      'LUZERNER_LEASE_FORM_NOTICE_MONTHS_REQUIRED',
      'longerNoticeMonths is required for the longer notice-period option.',
    );
  }
  if (
    content.useType === 'other' &&
    content.useTypeOther === null
  ) {
    throw new DomainError(
      'LUZERNER_LEASE_FORM_USE_TYPE_OTHER_REQUIRED',
      'useTypeOther is required when useType is other.',
    );
  }
  if (
    content.terminationSchedule === 'custom' &&
    content.terminationScheduleCustom === null
  ) {
    throw new DomainError(
      'LUZERNER_LEASE_FORM_TERMINATION_CUSTOM_REQUIRED',
      'terminationScheduleCustom is required for a custom termination schedule.',
    );
  }
  if (
    content.ancillaryClosingDate === 'custom' &&
    content.ancillaryClosingDateCustom === null
  ) {
    throw new DomainError(
      'LUZERNER_LEASE_FORM_ANCILLARY_DATE_CUSTOM_REQUIRED',
      'ancillaryClosingDateCustom is required for a custom ancillary-cost closing date.',
    );
  }

  return content;
}

export function createLuzernerLeaseFormDraft(
  agreementId: LeaseAgreementId,
  content: LuzernerLeaseFormContentInput,
): LuzernerLeaseFormDraft {
  return {
    agreementId,
    templateCode: LUZERNER_LEASE_TEMPLATE_CODE,
    revision: 1,
    content: normalizeLuzernerLeaseFormContent(content),
  };
}

export function reviseLuzernerLeaseFormDraft(
  current: LuzernerLeaseFormDraft,
  content: LuzernerLeaseFormContentInput,
): LuzernerLeaseFormDraft {
  return {
    ...current,
    revision: current.revision + 1,
    content: normalizeLuzernerLeaseFormContent(content),
  };
}

export interface LuzernerLeaseFormReadiness {
  readonly ready: boolean;
  readonly missing: readonly string[];
}

export function inspectLuzernerLeaseFormReadiness(
  content: LuzernerLeaseFormContent,
): LuzernerLeaseFormReadiness {
  const missing: string[] = [];

  if (content.netRent === null) missing.push('netRent');
  if (content.moveInDate === null) missing.push('moveInDate');
  if (content.placeOfSigning === null) missing.push('placeOfSigning');
  if (content.signingDate === null) missing.push('signingDate');

  if (content.garage && content.garageNumber === null) {
    missing.push('garageNumber');
  }
  if (content.parkingSpace && content.parkingSpaceNumber === null) {
    missing.push('parkingSpaceNumber');
  }

  return { ready: missing.length === 0, missing };
}
