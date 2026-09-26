import { z } from 'zod';
import {
  BILLING_FREQUENCIES,
  LEASE_AGREEMENT_PARTY_ROLES,
  LEASE_AGREEMENT_STATUSES,
  LEASE_AGREEMENT_TYPES,
  LEASE_AMENDMENT_STATUSES,
  LUZERNER_ANCILLARY_COST_KEYS,
  LUZERNER_LEASE_TEMPLATE_CODE,
  LUZERNER_SHARED_USE_KEYS,
  TERM_SOURCE_TYPES,
} from '@portfolio/domain';
import { entityIdSchema } from './portfolio.js';

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const moneySchema = z.string().trim().regex(/^(0|[1-9]\d{0,15})(?:\.\d{1,2})?$/);
const currencySchema = z.string().trim().length(3).transform((value) => value.toUpperCase());

export const leaseTermsRequestSchema = z.object({
  currency: currencySchema,
  baseRent: moneySchema,
  serviceCharge: moneySchema.optional(),
  utilitiesAdvance: moneySchema.optional(),
  parkingRent: moneySchema.optional(),
  otherRecurringCharge: moneySchema.optional(),
  depositRequired: moneySchema.optional(),
  billingFrequency: z.enum(BILLING_FREQUENCIES).optional(),
  noticePeriodTenantDays: z.number().int().nonnegative().optional(),
  noticePeriodLandlordDays: z.number().int().nonnegative().optional(),
});

const nullableTextSchema = z.string().trim().nullable();
const nullableMoneySchema = moneySchema.nullable();

const luzernerAncillaryCostModeSchema = z.enum([
  'excluded',
  'advance',
  'flat',
]);
const luzernerUseTypeSchema = z.enum(['apartment', 'commercial', 'other']);
const luzernerLeaseDurationKindSchema = z.enum([
  'indefinite',
  'minimum_term',
  'fixed_term',
]);
const luzernerTerminationScheduleSchema = z.enum([
  'monthly_except_december',
  'quarter_ends',
  'custom',
]);
const luzernerNoticePeriodKindSchema = z.enum([
  'residential_3_months',
  'commercial_6_months',
  'furnished_room_14_days',
  'longer_months',
]);
const luzernerPaymentFrequencySchema = z.enum([
  'monthly',
  'quarterly',
  'semiannual',
]);
const luzernerRentAdjustmentModeSchema = z.enum([
  'termination_date',
  'indexation',
  'graduated',
]);
const luzernerAncillaryClosingDateSchema = z.enum([
  'june_30',
  'december_31',
  'custom',
]);
const luzernerBooleanChoiceSchema = z.enum(['yes', 'no', 'unset']);

const luzernerSharedUseSchema = z.object({
  laundry_room: z.boolean(),
  drying_room: z.boolean(),
  drying_area: z.boolean(),
  stroller_room: z.boolean(),
  garden: z.boolean(),
  hobby_room: z.boolean(),
  playground: z.boolean(),
  bicycle_moped_room: z.boolean(),
}).superRefine((value, ctx) => {
  for (const key of LUZERNER_SHARED_USE_KEYS) {
    if (!(key in value)) {
      ctx.addIssue({
        code: 'custom',
        message: `Missing shared-use key ${key}.`,
      });
    }
  }
});

const luzernerAncillaryCostsSchema = z.object({
  heating_hot_water: luzernerAncillaryCostModeSchema,
  cold_water: luzernerAncillaryCostModeSchema,
  caretaker_stair_cleaning: luzernerAncillaryCostModeSchema,
  garden_surroundings_snow: luzernerAncillaryCostModeSchema,
  lift: luzernerAncillaryCostModeSchema,
  common_electricity_gas: luzernerAncillaryCostModeSchema,
  ara_kva_sewer: luzernerAncillaryCostModeSchema,
  tv_cable: luzernerAncillaryCostModeSchema,
  laundry: luzernerAncillaryCostModeSchema,
  administration_share: luzernerAncillaryCostModeSchema,
}).superRefine((value, ctx) => {
  for (const key of LUZERNER_ANCILLARY_COST_KEYS) {
    if (!(key in value)) {
      ctx.addIssue({
        code: 'custom',
        message: `Missing ancillary-cost key ${key}.`,
      });
    }
  }
});

export const luzernerLeaseFormContentSchema = z.object({
  ewid: nullableTextSchema,
  egid: nullableTextSchema,

  intendedForPersonCount: z.number().int().positive().nullable(),
  familyApartment: z.boolean(),
  registeredPartnership: z.boolean(),
  furnished: z.boolean(),

  separateRoom: z.boolean(),
  cellar: z.boolean(),
  attic: z.boolean(),
  separateApartment: z.boolean(),
  garage: z.boolean(),
  garageNumber: nullableTextSchema,
  parkingSpace: z.boolean(),
  parkingSpaceNumber: nullableTextSchema,
  additionalObjectLabel: nullableTextSchema,

  sharedUse: luzernerSharedUseSchema,
  customSharedUse: z.array(z.string().trim().min(1)).max(2),

  useType: luzernerUseTypeSchema,
  useTypeOther: nullableTextSchema,

  moveInDate: isoDateSchema.nullable(),
  durationKind: luzernerLeaseDurationKindSchema,
  minimumCancelableOn: isoDateSchema.nullable(),
  fixedEndDate: isoDateSchema.nullable(),
  terminationSchedule: luzernerTerminationScheduleSchema,
  terminationScheduleCustom: nullableTextSchema,
  noticePeriodKind: luzernerNoticePeriodKindSchema,
  longerNoticeMonths: z.number().int().positive().nullable(),

  currency: z.literal('CHF'),
  netRent: nullableMoneySchema,
  garageParkingRent: nullableMoneySchema,
  ancillaryAdvance: nullableMoneySchema,
  ancillaryFlat: nullableMoneySchema,
  ancillaryCosts: luzernerAncillaryCostsSchema,
  customAncillaryCosts: z.array(
    z.object({
      label: z.string().trim().min(1),
      mode: luzernerAncillaryCostModeSchema,
    }),
  ).max(2),
  paymentFrequency: luzernerPaymentFrequencySchema,

  rentAdjustmentMode: luzernerRentAdjustmentModeSchema,
  rentAdjustmentAdvanceMonths: z.number().int().nonnegative().nullable(),
  consumerPriceIndexPoints: nullableTextSchema,

  ancillaryClosingDate: luzernerAncillaryClosingDateSchema,
  ancillaryClosingDateCustom: nullableTextSchema,

  securityAmount: nullableMoneySchema,
  tenantNamedDepositAccount: z.boolean(),
  depositAccountReference: nullableTextSchema,
  privateLiabilityPolicy: luzernerBooleanChoiceSchema,

  mortgageReferenceRate: nullableTextSchema,
  costIncreaseCompensatedThrough: nullableTextSchema,
  consumerPriceIndex: nullableTextSchema,
  consumerPriceIndexMonthYear: nullableTextSchema,
  consumerPriceIndexBasis: nullableTextSchema,

  rentReserveAmount: nullableMoneySchema,
  rentReservePercent: nullableTextSchema,
  separateRentReserveAgreement: z.boolean(),

  remarksAttachments: z.string(),
  initialRentFormAttached: z.boolean(),
  specialProvisions: z.string(),

  placeOfSigning: nullableTextSchema,
  signingDate: isoDateSchema.nullable(),
});

export const putLuzernerLeaseFormRequestSchema = z.object({
  expectedRevision: z.number().int().positive().nullable(),
  content: luzernerLeaseFormContentSchema,
});

export const luzernerLeaseFormResponseSchema = z.object({
  agreementId: entityIdSchema,
  templateCode: z.literal(LUZERNER_LEASE_TEMPLATE_CODE),
  revision: z.number().int().positive(),
  content: luzernerLeaseFormContentSchema,
});

export type LuzernerLeaseFormContentRequest = z.infer<
  typeof luzernerLeaseFormContentSchema
>;
export type LuzernerLeaseFormResponse = z.infer<
  typeof luzernerLeaseFormResponseSchema
>;

export const createLeaseAgreementRequestSchema = z.object({
  code: z.string().trim().min(1),
  agreementType: z.enum(LEASE_AGREEMENT_TYPES),
  predecessorAgreementId: entityIdSchema.optional(),
  effectiveFrom: isoDateSchema,
  effectiveTo: isoDateSchema.nullable().optional(),
  parties: z.array(
    z.object({
      partyId: entityIdSchema,
      role: z.enum(LEASE_AGREEMENT_PARTY_ROLES),
    }),
  ).min(2),
}).superRefine((value, ctx) => {
  if (value.agreementType === 'initial' && value.predecessorAgreementId !== undefined) {
    ctx.addIssue({
      code: 'custom',
      path: ['predecessorAgreementId'],
      message: 'Initial agreements cannot have a predecessor.',
    });
  }

  if (value.agreementType !== 'initial' && value.predecessorAgreementId === undefined) {
    ctx.addIssue({
      code: 'custom',
      path: ['predecessorAgreementId'],
      message: 'Renewal and replacement agreements require a predecessor.',
    });
  }
});

export const signLeaseAgreementRequestSchema = z.object({
  expectedVersion: z.number().int().positive(),
  signedAt: isoDateSchema,
  terms: leaseTermsRequestSchema,
});

export const createLeaseAmendmentRequestSchema = z.object({
  code: z.string().trim().min(1),
  title: z.string().trim().min(1),
  description: z.string().trim().nullable().optional(),
  effectiveFrom: isoDateSchema,
});

export const signLeaseAmendmentRequestSchema = z.object({
  expectedVersion: z.number().int().positive(),
  signedAt: isoDateSchema,
  terms: leaseTermsRequestSchema,
});

export const contractVersionRequestSchema = z.object({
  expectedVersion: z.number().int().positive(),
});

export const leaseAgreementResponseSchema = z.object({
  id: entityIdSchema,
  tenancyId: entityIdSchema,
  code: z.string(),
  agreementType: z.enum(LEASE_AGREEMENT_TYPES),
  predecessorAgreementId: entityIdSchema.nullable(),
  effectiveFrom: isoDateSchema,
  effectiveTo: isoDateSchema.nullable(),
  status: z.enum(LEASE_AGREEMENT_STATUSES),
  signedAt: isoDateSchema.nullable(),
  version: z.number().int().positive(),
  parties: z.array(
    z.object({
      id: entityIdSchema,
      agreementId: entityIdSchema,
      partyId: entityIdSchema,
      role: z.enum(LEASE_AGREEMENT_PARTY_ROLES),
    }),
  ),
});

export const leaseAgreementListResponseSchema = z.object({
  items: z.array(leaseAgreementResponseSchema),
});

export const leaseAmendmentResponseSchema = z.object({
  id: entityIdSchema,
  agreementId: entityIdSchema,
  code: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  effectiveFrom: isoDateSchema,
  status: z.enum(LEASE_AMENDMENT_STATUSES),
  signedAt: isoDateSchema.nullable(),
  version: z.number().int().positive(),
});

export const leaseAmendmentListResponseSchema = z.object({
  items: z.array(leaseAmendmentResponseSchema),
});

export const tenancyTermVersionResponseSchema = z.object({
  id: entityIdSchema,
  tenancyId: entityIdSchema,
  sourceType: z.enum(TERM_SOURCE_TYPES),
  sourceAgreementId: entityIdSchema.nullable(),
  sourceAmendmentId: entityIdSchema.nullable(),
  effectiveFrom: isoDateSchema,
  currency: z.string().length(3),
  baseRent: z.string(),
  serviceCharge: z.string(),
  utilitiesAdvance: z.string(),
  parkingRent: z.string(),
  otherRecurringCharge: z.string(),
  depositRequired: z.string(),
  billingFrequency: z.enum(BILLING_FREQUENCIES),
  noticePeriodTenantDays: z.number().int().nonnegative(),
  noticePeriodLandlordDays: z.number().int().nonnegative(),
});

export type LeaseTermsRequest = z.infer<typeof leaseTermsRequestSchema>;
export type LeaseAgreementResponse = z.infer<typeof leaseAgreementResponseSchema>;
export type LeaseAgreementListResponse = z.infer<
  typeof leaseAgreementListResponseSchema
>;
export type LeaseAmendmentResponse = z.infer<typeof leaseAmendmentResponseSchema>;
export type LeaseAmendmentListResponse = z.infer<
  typeof leaseAmendmentListResponseSchema
>;
export type TenancyTermVersionResponse = z.infer<typeof tenancyTermVersionResponseSchema>;
