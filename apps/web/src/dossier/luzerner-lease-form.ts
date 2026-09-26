import type {
  LuzernerLeaseFormDataRequest,
} from '@portfolio/contracts';
import {
  LUZERNER_ANCILLARY_COST_KEYS,
  type LuzernerAncillaryCostKey,
  type LuzernerAncillaryTreatment,
  type LuzernerLeaseDurationMode,
  type LuzernerLeaseUseType,
  type LuzernerRentAdjustmentMode,
  type LuzernerSettlementCutoffMode,
  type LuzernerTerminationDateMode,
} from '@portfolio/domain';

export function emptyLuzernerLeaseFormData(): LuzernerLeaseFormDataRequest {
  return {
    occupantsCount: null,
    familyDwelling: false,
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
    additionalObjects: [],

    sharedLaundryRoom: false,
    sharedDryingRoom: false,
    sharedClothesLine: false,
    sharedStrollerStorage: false,
    sharedGarden: false,
    sharedHobbyRoom: false,
    sharedPlayground: false,
    sharedBicycleMopedStorage: false,
    sharedUseExtras: [],

    useType: null,
    customUse: null,

    handoverDate: null,
    durationMode: null,
    minimumFirstTerminationDate: null,
    terminationDateMode: null,

    ancillaryCosts: Object.fromEntries(
      LUZERNER_ANCILLARY_COST_KEYS.map((key) => [
        key,
        'not_recorded',
      ]),
    ) as Record<LuzernerAncillaryCostKey, LuzernerAncillaryTreatment>,
    customAncillaryCosts: [],

    rentAdjustmentMode: null,
    adjustmentNoticeMonths: null,
    indexPointsAtContract: null,

    settlementCutoffMode: null,
    customSettlementCutoffDate: null,

    depositAccountOnTenantName: false,
    liabilityInsurance: 'not_recorded',
    referenceInterestRate: null,
    costIncreaseBalancedUntil: null,
    consumerPriceIndex: null,
    consumerPriceIndexMonthYear: null,
    consumerPriceIndexBasis: null,
    incompleteAdjustmentReserveAmount: null,
    incompleteAdjustmentReservePercent: null,

    remarksAndAttachments: '',
    initialRentFormAttached: false,
    specialProvisions: '',
    contractPlace: null,
  };
}

function value(form: FormData, name: string): string {
  return String(form.get(name) ?? '').trim();
}

function optional(form: FormData, name: string): string | null {
  const current = value(form, name);
  return current === '' ? null : current;
}

function checked(form: FormData, name: string): boolean {
  return form.get(name) === 'on';
}

function optionalPositiveInteger(
  form: FormData,
  name: string,
): number | null {
  const current = optional(form, name);
  if (current === null) return null;
  const parsed = Number(current);
  return Number.isInteger(parsed) ? parsed : Number.NaN;
}

function list(form: FormData, prefix: string, count: number): string[] {
  const result: string[] = [];
  for (let index = 1; index <= count; index += 1) {
    const current = optional(form, `${prefix}${index}`);
    if (current !== null) result.push(current);
  }
  return result;
}

export function luzernerLeaseFormDataFromFormData(
  form: FormData,
): LuzernerLeaseFormDataRequest {
  const ancillaryCosts = Object.fromEntries(
    LUZERNER_ANCILLARY_COST_KEYS.map((key) => [
      key,
      value(form, `ancillary_${key}`) || 'not_recorded',
    ]),
  ) as Record<LuzernerAncillaryCostKey, LuzernerAncillaryTreatment>;

  const customAncillaryCosts = [1, 2]
    .map((index) => {
      const label = optional(form, `customAncillaryLabel${index}`);
      if (label === null) return null;
      return {
        label,
        treatment:
          (value(
            form,
            `customAncillaryTreatment${index}`,
          ) as LuzernerAncillaryTreatment) || 'not_recorded',
      };
    })
    .filter(
      (
        item,
      ): item is {
        label: string;
        treatment: LuzernerAncillaryTreatment;
      } => item !== null,
    );

  return {
    occupantsCount: optionalPositiveInteger(form, 'occupantsCount'),
    familyDwelling: checked(form, 'familyDwelling'),
    registeredPartnership: checked(form, 'registeredPartnership'),
    furnished: checked(form, 'furnished'),

    separateRoom: checked(form, 'separateRoom'),
    cellar: checked(form, 'cellar'),
    attic: checked(form, 'attic'),
    separateApartment: checked(form, 'separateApartment'),
    garage: checked(form, 'garage'),
    garageNumber: optional(form, 'garageNumber'),
    parkingSpace: checked(form, 'parkingSpace'),
    parkingSpaceNumber: optional(form, 'parkingSpaceNumber'),
    additionalObjects: list(form, 'additionalObject', 2),

    sharedLaundryRoom: checked(form, 'sharedLaundryRoom'),
    sharedDryingRoom: checked(form, 'sharedDryingRoom'),
    sharedClothesLine: checked(form, 'sharedClothesLine'),
    sharedStrollerStorage: checked(form, 'sharedStrollerStorage'),
    sharedGarden: checked(form, 'sharedGarden'),
    sharedHobbyRoom: checked(form, 'sharedHobbyRoom'),
    sharedPlayground: checked(form, 'sharedPlayground'),
    sharedBicycleMopedStorage: checked(
      form,
      'sharedBicycleMopedStorage',
    ),
    sharedUseExtras: list(form, 'sharedUseExtra', 2),

    useType:
      (optional(form, 'useType') as LuzernerLeaseUseType | null) ?? null,
    customUse: optional(form, 'customUse'),

    handoverDate: optional(form, 'handoverDate'),
    durationMode:
      (optional(
        form,
        'durationMode',
      ) as LuzernerLeaseDurationMode | null) ?? null,
    minimumFirstTerminationDate: optional(
      form,
      'minimumFirstTerminationDate',
    ),
    terminationDateMode:
      (optional(
        form,
        'terminationDateMode',
      ) as LuzernerTerminationDateMode | null) ?? null,

    ancillaryCosts,
    customAncillaryCosts,

    rentAdjustmentMode:
      (optional(
        form,
        'rentAdjustmentMode',
      ) as LuzernerRentAdjustmentMode | null) ?? null,
    adjustmentNoticeMonths: optionalPositiveInteger(
      form,
      'adjustmentNoticeMonths',
    ),
    indexPointsAtContract: optional(form, 'indexPointsAtContract'),

    settlementCutoffMode:
      (optional(
        form,
        'settlementCutoffMode',
      ) as LuzernerSettlementCutoffMode | null) ?? null,
    customSettlementCutoffDate: optional(
      form,
      'customSettlementCutoffDate',
    ),

    depositAccountOnTenantName: checked(
      form,
      'depositAccountOnTenantName',
    ),
    liabilityInsurance:
      (value(form, 'liabilityInsurance') as
        | 'yes'
        | 'no'
        | 'not_recorded') || 'not_recorded',
    referenceInterestRate: optional(form, 'referenceInterestRate'),
    costIncreaseBalancedUntil: optional(
      form,
      'costIncreaseBalancedUntil',
    ),
    consumerPriceIndex: optional(form, 'consumerPriceIndex'),
    consumerPriceIndexMonthYear: optional(
      form,
      'consumerPriceIndexMonthYear',
    ),
    consumerPriceIndexBasis: optional(
      form,
      'consumerPriceIndexBasis',
    ),
    incompleteAdjustmentReserveAmount: optional(
      form,
      'incompleteAdjustmentReserveAmount',
    ),
    incompleteAdjustmentReservePercent: optional(
      form,
      'incompleteAdjustmentReservePercent',
    ),

    remarksAndAttachments: value(form, 'remarksAndAttachments'),
    initialRentFormAttached: checked(form, 'initialRentFormAttached'),
    specialProvisions: value(form, 'specialProvisions'),
    contractPlace: optional(form, 'contractPlace'),
  };
}

export function sameLuzernerLeaseFormData(
  left: LuzernerLeaseFormDataRequest,
  right: LuzernerLeaseFormDataRequest,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
