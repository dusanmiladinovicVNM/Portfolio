import { z } from 'zod';
import {
  LUZERN_ANCILLARY_COST_KEYS,
} from '@portfolio/domain';

const emptyableText = z.string().max(2000);
const optionalMoney = z
  .string()
  .trim()
  .regex(/^(0|[1-9]\d{0,15})(?:\.\d{1,2})?$/)
  .nullable();
const optionalDateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable();

const ancillaryModeSchema = z.enum([
  'advance',
  'flat_rate',
  'not_applicable',
]);

export const luzernLeaseProfileDataSchema = z.object({
  representedBy: emptyableText,
  egid: z.string().max(32),
  ewid: z.string().max(32),
  persons: z.number().int().nonnegative().nullable(),
  familyHome: z.boolean(),
  registeredPartnership: z.boolean(),
  furnished: z.boolean(),

  separateRoom: z.boolean(),
  cellar: z.boolean(),
  attic: z.boolean(),
  separateApartment: z.boolean(),
  garage: z.boolean(),
  garageNumber: z.string().max(120),
  parkingSpace: z.boolean(),
  parkingNumber: z.string().max(120),
  extraObjectLabel: z.string().max(200),
  extraObjectSelected: z.boolean(),

  sharedLaundryRoom: z.boolean(),
  sharedDryingRoom: z.boolean(),
  sharedLaundryDryingPlace: z.boolean(),
  sharedStrollerRoom: z.boolean(),
  sharedGarden: z.boolean(),
  sharedHobbyRoom: z.boolean(),
  sharedPlayground: z.boolean(),
  sharedBikeRoom: z.boolean(),
  sharedExtra1Label: z.string().max(200),
  sharedExtra1Selected: z.boolean(),
  sharedExtra2Label: z.string().max(200),
  sharedExtra2Selected: z.boolean(),

  usageType: z.enum(['residential', 'commercial', 'other']),
  usageText: z.string().max(300),
  handoverDate: optionalDateOnly,

  durationMode: z.enum(['indefinite', 'minimum', 'fixed']),
  minimumFirstTerminationDate: optionalDateOnly,
  fixedEndDate: optionalDateOnly,
  terminationSchedule: z.enum([
    'monthly_except_december',
    'quarterly',
    'custom',
  ]),
  terminationCustom: z.string().max(300),
  noticeMode: z.enum([
    'three_months_residential',
    'six_months_commercial',
    'fourteen_days_furnished',
    'custom_months',
  ]),
  customNoticeMonths: z.number().int().nonnegative().nullable(),

  baseRent: optionalMoney,
  garageParkingRent: optionalMoney,
  ancillaryAdvance: optionalMoney,
  ancillaryFlat: optionalMoney,
  depositAmount: optionalMoney,
  billingCadence: z.enum(['monthly', 'quarterly', 'half_yearly']),
  ancillaryCostModes: z.object(
    Object.fromEntries(
      LUZERN_ANCILLARY_COST_KEYS.map((key) => [key, ancillaryModeSchema]),
    ) as Record<
      (typeof LUZERN_ANCILLARY_COST_KEYS)[number],
      typeof ancillaryModeSchema
    >,
  ),

  rentAdjustmentMode: z.enum([
    'termination_date',
    'indexed',
    'stepped',
  ]),
  rentAdjustmentNoticeMonths: z.number().int().nonnegative().nullable(),
  settlementCutoff: z.enum(['june_30', 'december_31', 'custom']),
  settlementCustom: z.string().max(200),
  depositAccount: z.boolean(),
  depositAccountText: z.string().max(300),
  privateLiabilityInsurance: z.enum(['yes', 'no', 'unset']),
  referenceInterestRate: z.string().max(80),
  costIncreaseCompensatedUntil: z.string().max(120),
  cpiPoints: z.string().max(80),
  cpiMonthYear: z.string().max(80),
  cpiBasis: z.string().max(80),
  rentReserveEnabled: z.boolean(),
  rentReserveAmount: optionalMoney,
  rentReservePercent: z.string().max(80),
  remarks: z.string().max(5000),
  initialRentFormRequired: z.boolean(),
  contractPlaceAndDate: z.string().max(300),
  specialProvisions: z.string().max(6000),
});

export const saveLuzernLeaseProfileRequestSchema = z.object({
  expectedRevision: z.number().int().positive().nullable(),
  profile: luzernLeaseProfileDataSchema,
});

export const luzernLeaseProfileResponseSchema =
  luzernLeaseProfileDataSchema.extend({
    agreementId: z.string().uuid(),
    revision: z.number().int().positive(),
  });

export const luzernLeaseProfileEnvelopeSchema = z.object({
  profile: luzernLeaseProfileResponseSchema.nullable(),
});

export const luzernLeaseCompletenessResponseSchema = z.object({
  complete: z.boolean(),
  issues: z.array(
    z.object({
      field: z.string().min(1),
      message: z.string().min(1),
    }),
  ),
  templateReady: z.boolean(),
});

export type LuzernLeaseProfileData = z.infer<
  typeof luzernLeaseProfileDataSchema
>;
export type SaveLuzernLeaseProfileRequest = z.infer<
  typeof saveLuzernLeaseProfileRequestSchema
>;
export type LuzernLeaseProfileResponse = z.infer<
  typeof luzernLeaseProfileResponseSchema
>;
