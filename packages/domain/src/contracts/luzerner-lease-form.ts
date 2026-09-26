import {
  asDateOnly,
  type DateOnly,
} from '../shared/date-only.js';
import { isCanonicalDecimal } from '../shared/canonical-decimal.js';
import { DomainError } from '../shared/domain-error.js';
import type {
  DocumentVersionId,
  LeaseAgreementId,
} from '../shared/entity-id.js';

export const LUZERNER_LEASE_FORM_TEMPLATE = 'luzerner_mietvertrag_2020' as const;

export const LUZERNER_LEASE_USE_TYPES = [
  'dwelling',
  'business',
  'custom',
] as const;

export const LUZERNER_LEASE_DURATION_MODES = [
  'indefinite',
  'minimum',
  'fixed',
] as const;

export const LUZERNER_TERMINATION_DATE_MODES = [
  'monthly_except_december',
  'quarterly_mar_jun_sep',
] as const;

export const LUZERNER_ANCILLARY_TREATMENTS = [
  'excluded',
  'advance',
  'flat',
] as const;

export const LUZERNER_ANCILLARY_COST_KEYS = [
  'heating_hot_water',
  'cold_water',
  'caretaking_stair_cleaning',
  'garden_snow',
  'lift',
  'general_energy',
  'ara_kva_sewer',
  'tv_cable',
  'laundry',
  'administration',
] as const;

export const LUZERNER_RENT_ADJUSTMENT_MODES = [
  'standard',
  'index',
  'stepped',
] as const;

export const LUZERNER_SETTLEMENT_CUTOFF_MODES = [
  'june_30',
  'december_31',
  'custom',
] as const;

export const LUZERNER_LIABILITY_INSURANCE_VALUES = [
  'yes',
  'no',
  'not_recorded',
] as const;

export type LuzernerLeaseUseType =
  (typeof LUZERNER_LEASE_USE_TYPES)[number];
export type LuzernerLeaseDurationMode =
  (typeof LUZERNER_LEASE_DURATION_MODES)[number];
export type LuzernerTerminationDateMode =
  (typeof LUZERNER_TERMINATION_DATE_MODES)[number];
export type LuzernerAncillaryTreatment =
  (typeof LUZERNER_ANCILLARY_TREATMENTS)[number];
export type LuzernerAncillaryCostKey =
  (typeof LUZERNER_ANCILLARY_COST_KEYS)[number];
export type LuzernerRentAdjustmentMode =
  (typeof LUZERNER_RENT_ADJUSTMENT_MODES)[number];
export type LuzernerSettlementCutoffMode =
  (typeof LUZERNER_SETTLEMENT_CUTOFF_MODES)[number];
export type LuzernerLiabilityInsurance =
  (typeof LUZERNER_LIABILITY_INSURANCE_VALUES)[number];

export interface LuzernerCustomAncillaryCost {
  readonly label: string;
  readonly treatment: LuzernerAncillaryTreatment;
}

export interface LuzernerLeaseFormData {
  readonly occupantsCount: number | null;
  readonly familyDwelling: boolean;
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
  readonly additionalObjects: readonly string[];

  readonly sharedLaundryRoom: boolean;
  readonly sharedDryingRoom: boolean;
  readonly sharedClothesLine: boolean;
  readonly sharedStrollerStorage: boolean;
  readonly sharedGarden: boolean;
  readonly sharedHobbyRoom: boolean;
  readonly sharedPlayground: boolean;
  readonly sharedBicycleMopedStorage: boolean;
  readonly sharedUseExtras: readonly string[];

  readonly useType: LuzernerLeaseUseType;
  readonly customUse: string | null;

  readonly handoverDate: DateOnly | null;
  readonly durationMode: LuzernerLeaseDurationMode;
  readonly minimumFirstTerminationDate: DateOnly | null;
  readonly terminationDateMode: LuzernerTerminationDateMode;

  readonly ancillaryCosts: Readonly<
    Record<LuzernerAncillaryCostKey, LuzernerAncillaryTreatment>
  >;
  readonly customAncillaryCosts: readonly LuzernerCustomAncillaryCost[];

  readonly rentAdjustmentMode: LuzernerRentAdjustmentMode;
  readonly adjustmentNoticeMonths: number | null;
  readonly indexPointsAtContract: string | null;

  readonly settlementCutoffMode: LuzernerSettlementCutoffMode;
  readonly customSettlementCutoffDate: DateOnly | null;

  readonly depositAccountOnTenantName: boolean;
  readonly liabilityInsurance: LuzernerLiabilityInsurance;
  readonly referenceInterestRate: string | null;
  readonly costIncreaseBalancedUntil: DateOnly | null;
  readonly consumerPriceIndex: string | null;
  readonly consumerPriceIndexMonthYear: string | null;
  readonly consumerPriceIndexBasis: string | null;
  readonly incompleteAdjustmentReserveAmount: string | null;
  readonly incompleteAdjustmentReservePercent: string | null;

  readonly remarksAndAttachments: string;
  readonly initialRentFormAttached: boolean;
  readonly specialProvisions: string;
  readonly contractPlace: string | null;
}

export interface LuzernerLeaseFormProfile {
  readonly agreementId: LeaseAgreementId;
  readonly templateCode: typeof LUZERNER_LEASE_FORM_TEMPLATE;
  readonly templateDocumentVersionId: DocumentVersionId | null;
  readonly revision: number;
  readonly data: LuzernerLeaseFormData;
}

export type LuzernerLeaseFormDataInput = Omit<
  LuzernerLeaseFormData,
  | 'handoverDate'
  | 'minimumFirstTerminationDate'
  | 'customSettlementCutoffDate'
  | 'costIncreaseBalancedUntil'
> & {
  readonly handoverDate?: string | null;
  readonly minimumFirstTerminationDate?: string | null;
  readonly customSettlementCutoffDate?: string | null;
  readonly costIncreaseBalancedUntil?: string | null;
};

export interface CreateLuzernerLeaseFormProfileInput {
  readonly agreementId: LeaseAgreementId;
  readonly templateDocumentVersionId?: DocumentVersionId | null;
  readonly data: LuzernerLeaseFormDataInput;
}

function text(
  value: string | null | undefined,
  field: string,
  maxLength = 500,
): string | null {
  if (value === undefined || value === null) return null;
  const normalized = value.trim();
  if (!normalized) return null;
  if (normalized.length > maxLength) {
    throw new DomainError(
      'LUZERNER_LEASE_FORM_TEXT_TOO_LONG',
      `${field} must be at most ${maxLength} characters.`,
    );
  }
  return normalized;
}

function longText(value: string, field: string, maxLength: number): string {
  const normalized = value.trim();
  if (normalized.length > maxLength) {
    throw new DomainError(
      'LUZERNER_LEASE_FORM_TEXT_TOO_LONG',
      `${field} must be at most ${maxLength} characters.`,
    );
  }
  return normalized;
}

function optionalDate(
  value: string | null | undefined,
  field: string,
): DateOnly | null {
  if (value === undefined || value === null || value.trim() === '') return null;
  try {
    return asDateOnly(value);
  } catch {
    throw new DomainError(
      'LUZERNER_LEASE_FORM_INVALID_DATE',
      `${field} must be a valid YYYY-MM-DD date.`,
    );
  }
}

function optionalDecimal(
  value: string | null,
  field: string,
): string | null {
  const normalized = text(value, field, 32);
  if (normalized === null) return null;
  if (!isCanonicalDecimal(normalized)) {
    throw new DomainError(
      'LUZERNER_LEASE_FORM_INVALID_DECIMAL',
      `${field} must be an exact canonical decimal string.`,
    );
  }
  return normalized;
}

function normalizedLines(
  values: readonly string[],
  field: string,
  maxItems: number,
): readonly string[] {
  const normalized = values
    .map((value) => value.trim())
    .filter(Boolean);
  if (normalized.length > maxItems) {
    throw new DomainError(
      'LUZERNER_LEASE_FORM_TOO_MANY_ITEMS',
      `${field} supports at most ${maxItems} entries.`,
    );
  }
  if (normalized.some((value) => value.length > 120)) {
    throw new DomainError(
      'LUZERNER_LEASE_FORM_TEXT_TOO_LONG',
      `${field} entries must be at most 120 characters.`,
    );
  }
  return normalized;
}

function normalizeData(
  input: LuzernerLeaseFormDataInput,
): LuzernerLeaseFormData {
  if (
    input.occupantsCount !== null &&
    (!Number.isInteger(input.occupantsCount) ||
      input.occupantsCount <= 0 ||
      input.occupantsCount > 99)
  ) {
    throw new DomainError(
      'LUZERNER_LEASE_FORM_INVALID_OCCUPANTS',
      'occupantsCount must be an integer from 1 to 99 or null.',
    );
  }

  const garageNumber = text(input.garageNumber, 'garageNumber', 40);
  const parkingSpaceNumber = text(
    input.parkingSpaceNumber,
    'parkingSpaceNumber',
    40,
  );
  if (!input.garage && garageNumber !== null) {
    throw new DomainError(
      'LUZERNER_LEASE_FORM_GARAGE_NUMBER_WITHOUT_GARAGE',
      'garageNumber requires garage=true.',
    );
  }
  if (!input.parkingSpace && parkingSpaceNumber !== null) {
    throw new DomainError(
      'LUZERNER_LEASE_FORM_PARKING_NUMBER_WITHOUT_PARKING',
      'parkingSpaceNumber requires parkingSpace=true.',
    );
  }

  const customUse = text(input.customUse, 'customUse', 120);
  if (input.useType === 'custom' && customUse === null) {
    throw new DomainError(
      'LUZERNER_LEASE_FORM_CUSTOM_USE_REQUIRED',
      'customUse is required when useType=custom.',
    );
  }
  if (input.useType !== 'custom' && customUse !== null) {
    throw new DomainError(
      'LUZERNER_LEASE_FORM_CUSTOM_USE_FORBIDDEN',
      'customUse is only allowed when useType=custom.',
    );
  }

  const handoverDate = optionalDate(input.handoverDate, 'handoverDate');
  const minimumFirstTerminationDate = optionalDate(
    input.minimumFirstTerminationDate,
    'minimumFirstTerminationDate',
  );
  if (
    input.durationMode === 'minimum' &&
    minimumFirstTerminationDate === null
  ) {
    throw new DomainError(
      'LUZERNER_LEASE_FORM_MINIMUM_TERMINATION_DATE_REQUIRED',
      'minimumFirstTerminationDate is required for minimum duration.',
    );
  }
  if (
    input.durationMode !== 'minimum' &&
    minimumFirstTerminationDate !== null
  ) {
    throw new DomainError(
      'LUZERNER_LEASE_FORM_MINIMUM_TERMINATION_DATE_FORBIDDEN',
      'minimumFirstTerminationDate is only allowed for minimum duration.',
    );
  }

  const customAncillaryCosts = input.customAncillaryCosts
    .map((item) => ({
      label: text(item.label, 'customAncillaryCosts.label', 160) ?? '',
      treatment: item.treatment,
    }))
    .filter((item) => item.label !== '');
  if (customAncillaryCosts.length > 2) {
    throw new DomainError(
      'LUZERNER_LEASE_FORM_TOO_MANY_CUSTOM_ANCILLARY_COSTS',
      'The Luzerner 2020 template supports at most two custom ancillary rows.',
    );
  }

  if (
    input.adjustmentNoticeMonths !== null &&
    (!Number.isInteger(input.adjustmentNoticeMonths) ||
      input.adjustmentNoticeMonths <= 0 ||
      input.adjustmentNoticeMonths > 120)
  ) {
    throw new DomainError(
      'LUZERNER_LEASE_FORM_INVALID_ADJUSTMENT_NOTICE',
      'adjustmentNoticeMonths must be a positive integer or null.',
    );
  }
  const indexPointsAtContract = optionalDecimal(
    input.indexPointsAtContract,
    'indexPointsAtContract',
  );
  if (
    input.rentAdjustmentMode === 'index' &&
    indexPointsAtContract === null
  ) {
    throw new DomainError(
      'LUZERNER_LEASE_FORM_INDEX_POINTS_REQUIRED',
      'indexPointsAtContract is required for index rent adjustment.',
    );
  }

  const customSettlementCutoffDate = optionalDate(
    input.customSettlementCutoffDate,
    'customSettlementCutoffDate',
  );
  if (
    input.settlementCutoffMode === 'custom' &&
    customSettlementCutoffDate === null
  ) {
    throw new DomainError(
      'LUZERNER_LEASE_FORM_CUSTOM_SETTLEMENT_DATE_REQUIRED',
      'customSettlementCutoffDate is required for custom settlement cutoff.',
    );
  }
  if (
    input.settlementCutoffMode !== 'custom' &&
    customSettlementCutoffDate !== null
  ) {
    throw new DomainError(
      'LUZERNER_LEASE_FORM_CUSTOM_SETTLEMENT_DATE_FORBIDDEN',
      'customSettlementCutoffDate is only allowed for custom settlement cutoff.',
    );
  }

  const consumerPriceIndexMonthYear = text(
    input.consumerPriceIndexMonthYear,
    'consumerPriceIndexMonthYear',
    7,
  );
  if (
    consumerPriceIndexMonthYear !== null &&
    !/^(0[1-9]|1[0-2])\.\d{4}$/u.test(consumerPriceIndexMonthYear)
  ) {
    throw new DomainError(
      'LUZERNER_LEASE_FORM_INVALID_INDEX_MONTH_YEAR',
      'consumerPriceIndexMonthYear must use MM.YYYY.',
    );
  }

  return {
    occupantsCount: input.occupantsCount,
    familyDwelling: input.familyDwelling,
    registeredPartnership: input.registeredPartnership,
    furnished: input.furnished,
    separateRoom: input.separateRoom,
    cellar: input.cellar,
    attic: input.attic,
    separateApartment: input.separateApartment,
    garage: input.garage,
    garageNumber,
    parkingSpace: input.parkingSpace,
    parkingSpaceNumber,
    additionalObjects: normalizedLines(
      input.additionalObjects,
      'additionalObjects',
      2,
    ),
    sharedLaundryRoom: input.sharedLaundryRoom,
    sharedDryingRoom: input.sharedDryingRoom,
    sharedClothesLine: input.sharedClothesLine,
    sharedStrollerStorage: input.sharedStrollerStorage,
    sharedGarden: input.sharedGarden,
    sharedHobbyRoom: input.sharedHobbyRoom,
    sharedPlayground: input.sharedPlayground,
    sharedBicycleMopedStorage: input.sharedBicycleMopedStorage,
    sharedUseExtras: normalizedLines(
      input.sharedUseExtras,
      'sharedUseExtras',
      2,
    ),
    useType: input.useType,
    customUse,
    handoverDate,
    durationMode: input.durationMode,
    minimumFirstTerminationDate,
    terminationDateMode: input.terminationDateMode,
    ancillaryCosts: { ...input.ancillaryCosts },
    customAncillaryCosts,
    rentAdjustmentMode: input.rentAdjustmentMode,
    adjustmentNoticeMonths: input.adjustmentNoticeMonths,
    indexPointsAtContract,
    settlementCutoffMode: input.settlementCutoffMode,
    customSettlementCutoffDate,
    depositAccountOnTenantName: input.depositAccountOnTenantName,
    liabilityInsurance: input.liabilityInsurance,
    referenceInterestRate: optionalDecimal(
      input.referenceInterestRate,
      'referenceInterestRate',
    ),
    costIncreaseBalancedUntil: optionalDate(
      input.costIncreaseBalancedUntil,
      'costIncreaseBalancedUntil',
    ),
    consumerPriceIndex: optionalDecimal(
      input.consumerPriceIndex,
      'consumerPriceIndex',
    ),
    consumerPriceIndexMonthYear,
    consumerPriceIndexBasis: text(
      input.consumerPriceIndexBasis,
      'consumerPriceIndexBasis',
      40,
    ),
    incompleteAdjustmentReserveAmount: optionalDecimal(
      input.incompleteAdjustmentReserveAmount,
      'incompleteAdjustmentReserveAmount',
    ),
    incompleteAdjustmentReservePercent: optionalDecimal(
      input.incompleteAdjustmentReservePercent,
      'incompleteAdjustmentReservePercent',
    ),
    remarksAndAttachments: longText(
      input.remarksAndAttachments,
      'remarksAndAttachments',
      3000,
    ),
    initialRentFormAttached: input.initialRentFormAttached,
    specialProvisions: longText(
      input.specialProvisions,
      'specialProvisions',
      5000,
    ),
    contractPlace: text(input.contractPlace, 'contractPlace', 120),
  };
}

export function createLuzernerLeaseFormProfile(
  input: CreateLuzernerLeaseFormProfileInput,
): LuzernerLeaseFormProfile {
  return {
    agreementId: input.agreementId,
    templateCode: LUZERNER_LEASE_FORM_TEMPLATE,
    templateDocumentVersionId: input.templateDocumentVersionId ?? null,
    revision: 1,
    data: normalizeData(input.data),
  };
}

export function updateLuzernerLeaseFormProfile(
  current: LuzernerLeaseFormProfile,
  input: {
    readonly templateDocumentVersionId?: DocumentVersionId | null;
    readonly data: LuzernerLeaseFormDataInput;
  },
): LuzernerLeaseFormProfile {
  return {
    ...current,
    templateDocumentVersionId:
      input.templateDocumentVersionId === undefined
        ? current.templateDocumentVersionId
        : input.templateDocumentVersionId,
    revision: current.revision + 1,
    data: normalizeData(input.data),
  };
}
