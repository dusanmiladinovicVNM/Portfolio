import { asDateOnly, type DateOnly } from '../shared/date-only.js';
import { DomainError } from '../shared/domain-error.js';
import type { LeaseAgreementId } from '../shared/entity-id.js';
import { asMoneyAmount, type MoneyAmount } from '../shared/money.js';

export const LUZERN_MIETVERTRAG_TEMPLATE_CODE =
  'LUZERN-MIETVERTRAG-2020' as const;
export const LUZERN_MIETVERTRAG_TEMPLATE_SHA256 =
  '825d9ecc2ee87ba0515e79b36d4b72b80d937f7e10f6e98a27ba3670760ece04' as const;

export const LUZERN_ANCILLARY_COST_KEYS = [
  'heating_hot_water',
  'cold_water',
  'caretaker_stair_cleaning',
  'garden_snow',
  'lift',
  'general_electricity_gas',
  'ara_kva_sewer',
  'tv_cable',
  'laundry_equipment',
  'administration',
] as const;

export type LuzernAncillaryCostKey =
  (typeof LUZERN_ANCILLARY_COST_KEYS)[number];
export type LuzernAncillaryCostMode =
  | 'advance'
  | 'flat_rate'
  | 'not_applicable';

export type LuzernUsageType = 'residential' | 'commercial' | 'other';
export type LuzernDurationMode = 'indefinite' | 'minimum' | 'fixed';
export type LuzernTerminationSchedule =
  | 'monthly_except_december'
  | 'quarterly'
  | 'custom';
export type LuzernNoticeMode =
  | 'three_months_residential'
  | 'six_months_commercial'
  | 'fourteen_days_furnished'
  | 'custom_months';
export type LuzernBillingCadence =
  | 'monthly'
  | 'quarterly'
  | 'half_yearly';
export type LuzernRentAdjustmentMode =
  | 'termination_date'
  | 'indexed'
  | 'stepped';
export type LuzernSettlementCutoff = 'june_30' | 'december_31' | 'custom';
export type LuzernYesNo = 'yes' | 'no' | 'unset';

export interface LuzernLeaseProfile {
  readonly agreementId: LeaseAgreementId;
  readonly revision: number;

  readonly representedBy: string;
  readonly egid: string;
  readonly ewid: string;
  readonly persons: number | null;
  readonly familyHome: boolean;
  readonly registeredPartnership: boolean;
  readonly furnished: boolean;

  readonly separateRoom: boolean;
  readonly cellar: boolean;
  readonly attic: boolean;
  readonly separateApartment: boolean;
  readonly garage: boolean;
  readonly garageNumber: string;
  readonly parkingSpace: boolean;
  readonly parkingNumber: string;
  readonly extraObjectLabel: string;
  readonly extraObjectSelected: boolean;

  readonly sharedLaundryRoom: boolean;
  readonly sharedDryingRoom: boolean;
  readonly sharedLaundryDryingPlace: boolean;
  readonly sharedStrollerRoom: boolean;
  readonly sharedGarden: boolean;
  readonly sharedHobbyRoom: boolean;
  readonly sharedPlayground: boolean;
  readonly sharedBikeRoom: boolean;
  readonly sharedExtra1Label: string;
  readonly sharedExtra1Selected: boolean;
  readonly sharedExtra2Label: string;
  readonly sharedExtra2Selected: boolean;

  readonly usageType: LuzernUsageType;
  readonly usageText: string;
  readonly handoverDate: DateOnly | null;

  readonly durationMode: LuzernDurationMode;
  readonly minimumFirstTerminationDate: DateOnly | null;
  readonly fixedEndDate: DateOnly | null;
  readonly terminationSchedule: LuzernTerminationSchedule;
  readonly terminationCustom: string;
  readonly noticeMode: LuzernNoticeMode;
  readonly customNoticeMonths: number | null;

  readonly baseRent: MoneyAmount | null;
  readonly garageParkingRent: MoneyAmount | null;
  readonly ancillaryAdvance: MoneyAmount | null;
  readonly ancillaryFlat: MoneyAmount | null;
  readonly depositAmount: MoneyAmount | null;
  readonly billingCadence: LuzernBillingCadence;
  readonly ancillaryCostModes: Readonly<Record<LuzernAncillaryCostKey, LuzernAncillaryCostMode>>;

  readonly rentAdjustmentMode: LuzernRentAdjustmentMode;
  readonly rentAdjustmentNoticeMonths: number | null;
  readonly settlementCutoff: LuzernSettlementCutoff;
  readonly settlementCustom: string;
  readonly depositAccount: boolean;
  readonly depositAccountText: string;
  readonly privateLiabilityInsurance: LuzernYesNo;
  readonly referenceInterestRate: string;
  readonly costIncreaseCompensatedUntil: string;
  readonly cpiPoints: string;
  readonly cpiMonthYear: string;
  readonly cpiBasis: string;
  readonly rentReserveEnabled: boolean;
  readonly rentReserveAmount: MoneyAmount | null;
  readonly rentReservePercent: string;
  readonly remarks: string;
  readonly initialRentFormRequired: boolean;
  readonly contractPlaceAndDate: string;
  readonly specialProvisions: string;
}

export interface LuzernLeaseProfileDraftInput {
  readonly representedBy?: string;
  readonly egid?: string;
  readonly ewid?: string;
  readonly persons?: number | null;
  readonly familyHome?: boolean;
  readonly registeredPartnership?: boolean;
  readonly furnished?: boolean;

  readonly separateRoom?: boolean;
  readonly cellar?: boolean;
  readonly attic?: boolean;
  readonly separateApartment?: boolean;
  readonly garage?: boolean;
  readonly garageNumber?: string;
  readonly parkingSpace?: boolean;
  readonly parkingNumber?: string;
  readonly extraObjectLabel?: string;
  readonly extraObjectSelected?: boolean;

  readonly sharedLaundryRoom?: boolean;
  readonly sharedDryingRoom?: boolean;
  readonly sharedLaundryDryingPlace?: boolean;
  readonly sharedStrollerRoom?: boolean;
  readonly sharedGarden?: boolean;
  readonly sharedHobbyRoom?: boolean;
  readonly sharedPlayground?: boolean;
  readonly sharedBikeRoom?: boolean;
  readonly sharedExtra1Label?: string;
  readonly sharedExtra1Selected?: boolean;
  readonly sharedExtra2Label?: string;
  readonly sharedExtra2Selected?: boolean;

  readonly usageType?: LuzernUsageType;
  readonly usageText?: string;
  readonly handoverDate?: string | null;

  readonly durationMode?: LuzernDurationMode;
  readonly minimumFirstTerminationDate?: string | null;
  readonly fixedEndDate?: string | null;
  readonly terminationSchedule?: LuzernTerminationSchedule;
  readonly terminationCustom?: string;
  readonly noticeMode?: LuzernNoticeMode;
  readonly customNoticeMonths?: number | null;

  readonly baseRent?: string | null;
  readonly garageParkingRent?: string | null;
  readonly ancillaryAdvance?: string | null;
  readonly ancillaryFlat?: string | null;
  readonly depositAmount?: string | null;
  readonly billingCadence?: LuzernBillingCadence;
  readonly ancillaryCostModes?: Partial<
    Record<LuzernAncillaryCostKey, LuzernAncillaryCostMode>
  >;

  readonly rentAdjustmentMode?: LuzernRentAdjustmentMode;
  readonly rentAdjustmentNoticeMonths?: number | null;
  readonly settlementCutoff?: LuzernSettlementCutoff;
  readonly settlementCustom?: string;
  readonly depositAccount?: boolean;
  readonly depositAccountText?: string;
  readonly privateLiabilityInsurance?: LuzernYesNo;
  readonly referenceInterestRate?: string;
  readonly costIncreaseCompensatedUntil?: string;
  readonly cpiPoints?: string;
  readonly cpiMonthYear?: string;
  readonly cpiBasis?: string;
  readonly rentReserveEnabled?: boolean;
  readonly rentReserveAmount?: string | null;
  readonly rentReservePercent?: string;
  readonly remarks?: string;
  readonly initialRentFormRequired?: boolean;
  readonly contractPlaceAndDate?: string;
  readonly specialProvisions?: string;
}

const trim = (value: string | undefined): string => value?.trim() ?? '';

function optionalDate(value: string | null | undefined): DateOnly | null {
  if (value === null || value === undefined || value.trim() === '') return null;
  return asDateOnly(value);
}

function optionalMoney(value: string | null | undefined): MoneyAmount | null {
  if (value === null || value === undefined || value.trim() === '') return null;
  return asMoneyAmount(value);
}

function nullableNonNegativeInteger(
  value: number | null | undefined,
  field: string,
): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isInteger(value) || value < 0) {
    throw new DomainError(
      'LUZERN_LEASE_PROFILE_INVALID_NUMBER',
      field + ' must be a non-negative integer.',
    );
  }
  return value;
}

export function createLuzernLeaseProfile(
  agreementId: LeaseAgreementId,
  input: LuzernLeaseProfileDraftInput = {},
  revision = 1,
): LuzernLeaseProfile {
  if (!Number.isInteger(revision) || revision < 1) {
    throw new DomainError(
      'LUZERN_LEASE_PROFILE_INVALID_REVISION',
      'revision must be a positive integer.',
    );
  }

  const ancillaryCostModes = Object.fromEntries(
    LUZERN_ANCILLARY_COST_KEYS.map((key) => [
      key,
      input.ancillaryCostModes?.[key] ?? 'not_applicable',
    ]),
  ) as Record<LuzernAncillaryCostKey, LuzernAncillaryCostMode>;

  return {
    agreementId,
    revision,
    representedBy: trim(input.representedBy),
    egid: trim(input.egid),
    ewid: trim(input.ewid),
    persons: nullableNonNegativeInteger(input.persons, 'persons'),
    familyHome: input.familyHome ?? false,
    registeredPartnership: input.registeredPartnership ?? false,
    furnished: input.furnished ?? false,

    separateRoom: input.separateRoom ?? false,
    cellar: input.cellar ?? false,
    attic: input.attic ?? false,
    separateApartment: input.separateApartment ?? false,
    garage: input.garage ?? false,
    garageNumber: trim(input.garageNumber),
    parkingSpace: input.parkingSpace ?? false,
    parkingNumber: trim(input.parkingNumber),
    extraObjectLabel: trim(input.extraObjectLabel),
    extraObjectSelected: input.extraObjectSelected ?? false,

    sharedLaundryRoom: input.sharedLaundryRoom ?? false,
    sharedDryingRoom: input.sharedDryingRoom ?? false,
    sharedLaundryDryingPlace: input.sharedLaundryDryingPlace ?? false,
    sharedStrollerRoom: input.sharedStrollerRoom ?? false,
    sharedGarden: input.sharedGarden ?? false,
    sharedHobbyRoom: input.sharedHobbyRoom ?? false,
    sharedPlayground: input.sharedPlayground ?? false,
    sharedBikeRoom: input.sharedBikeRoom ?? false,
    sharedExtra1Label: trim(input.sharedExtra1Label),
    sharedExtra1Selected: input.sharedExtra1Selected ?? false,
    sharedExtra2Label: trim(input.sharedExtra2Label),
    sharedExtra2Selected: input.sharedExtra2Selected ?? false,

    usageType: input.usageType ?? 'residential',
    usageText: trim(input.usageText),
    handoverDate: optionalDate(input.handoverDate),

    durationMode: input.durationMode ?? 'indefinite',
    minimumFirstTerminationDate: optionalDate(
      input.minimumFirstTerminationDate,
    ),
    fixedEndDate: optionalDate(input.fixedEndDate),
    terminationSchedule:
      input.terminationSchedule ?? 'monthly_except_december',
    terminationCustom: trim(input.terminationCustom),
    noticeMode: input.noticeMode ?? 'three_months_residential',
    customNoticeMonths: nullableNonNegativeInteger(
      input.customNoticeMonths,
      'customNoticeMonths',
    ),

    baseRent: optionalMoney(input.baseRent),
    garageParkingRent: optionalMoney(input.garageParkingRent),
    ancillaryAdvance: optionalMoney(input.ancillaryAdvance),
    ancillaryFlat: optionalMoney(input.ancillaryFlat),
    depositAmount: optionalMoney(input.depositAmount),
    billingCadence: input.billingCadence ?? 'monthly',
    ancillaryCostModes,

    rentAdjustmentMode: input.rentAdjustmentMode ?? 'termination_date',
    rentAdjustmentNoticeMonths: nullableNonNegativeInteger(
      input.rentAdjustmentNoticeMonths,
      'rentAdjustmentNoticeMonths',
    ),
    settlementCutoff: input.settlementCutoff ?? 'june_30',
    settlementCustom: trim(input.settlementCustom),
    depositAccount: input.depositAccount ?? false,
    depositAccountText: trim(input.depositAccountText),
    privateLiabilityInsurance:
      input.privateLiabilityInsurance ?? 'unset',
    referenceInterestRate: trim(input.referenceInterestRate),
    costIncreaseCompensatedUntil: trim(
      input.costIncreaseCompensatedUntil,
    ),
    cpiPoints: trim(input.cpiPoints),
    cpiMonthYear: trim(input.cpiMonthYear),
    cpiBasis: trim(input.cpiBasis),
    rentReserveEnabled: input.rentReserveEnabled ?? false,
    rentReserveAmount: optionalMoney(input.rentReserveAmount),
    rentReservePercent: trim(input.rentReservePercent),
    remarks: trim(input.remarks),
    initialRentFormRequired: input.initialRentFormRequired ?? false,
    contractPlaceAndDate: trim(input.contractPlaceAndDate),
    specialProvisions: trim(input.specialProvisions),
  };
}

export interface LuzernLeaseCompletenessIssue {
  readonly field: string;
  readonly message: string;
}

export function luzernLeaseProfileCompleteness(
  profile: LuzernLeaseProfile,
): readonly LuzernLeaseCompletenessIssue[] {
  const issues: LuzernLeaseCompletenessIssue[] = [];
  const requiredText = (
    value: string,
    field: string,
    message: string,
  ): void => {
    if (!value.trim()) issues.push({ field, message });
  };

  if (profile.persons === null || profile.persons < 1) {
    issues.push({
      field: 'persons',
      message: 'Number of persons is required.',
    });
  }
  if (profile.durationMode === 'minimum' &&
      profile.minimumFirstTerminationDate === null) {
    issues.push({
      field: 'minimumFirstTerminationDate',
      message: 'First termination date is required for minimum duration.',
    });
  }
  if (profile.durationMode === 'fixed' && profile.fixedEndDate === null) {
    issues.push({
      field: 'fixedEndDate',
      message: 'Fixed contract end date is required.',
    });
  }
  if (
    profile.terminationSchedule === 'custom' &&
    !profile.terminationCustom
  ) {
    issues.push({
      field: 'terminationCustom',
      message: 'Custom termination schedule is required.',
    });
  }
  if (
    profile.noticeMode === 'custom_months' &&
    (profile.customNoticeMonths === null || profile.customNoticeMonths < 1)
  ) {
    issues.push({
      field: 'customNoticeMonths',
      message: 'Custom notice period in months is required.',
    });
  }
  if (profile.baseRent === null) {
    issues.push({ field: 'baseRent', message: 'Net rent is required.' });
  }
  if (profile.depositAmount === null) {
    issues.push({
      field: 'depositAmount',
      message: 'Security deposit amount is required (0.00 is allowed).',
    });
  }
  if (
    profile.rentAdjustmentMode === 'termination_date' &&
    profile.rentAdjustmentNoticeMonths === null
  ) {
    issues.push({
      field: 'rentAdjustmentNoticeMonths',
      message: 'Rent-adjustment notice months are required.',
    });
  }
  if (
    profile.settlementCutoff === 'custom' &&
    !profile.settlementCustom
  ) {
    issues.push({
      field: 'settlementCustom',
      message: 'Custom ancillary-cost settlement cutoff is required.',
    });
  }
  if (profile.depositAccount && !profile.depositAccountText) {
    issues.push({
      field: 'depositAccountText',
      message: 'Deposit account description is required when selected.',
    });
  }
  if (profile.rentReserveEnabled && profile.rentReserveAmount === null) {
    issues.push({
      field: 'rentReserveAmount',
      message: 'Rent reserve amount is required when reserve is selected.',
    });
  }
  requiredText(
    profile.contractPlaceAndDate,
    'contractPlaceAndDate',
    'Contract place and date are required.',
  );

  return issues;
}
