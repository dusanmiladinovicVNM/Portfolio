import { z } from 'zod';
import {
  LUZERNER_ANCILLARY_COST_KEYS,
  LUZERNER_ANCILLARY_TREATMENTS,
  LUZERNER_LEASE_DURATION_MODES,
  LUZERNER_LEASE_FORM_TEMPLATE,
  LUZERNER_LEASE_USE_TYPES,
  LUZERNER_LIABILITY_INSURANCE_VALUES,
  LUZERNER_RENT_ADJUSTMENT_MODES,
  LUZERNER_SETTLEMENT_CUTOFF_MODES,
  LUZERNER_TERMINATION_DATE_MODES,
} from '@portfolio/domain';
import { entityIdSchema } from './portfolio.js';

const dateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u);
const canonicalDecimalSchema = z
  .string()
  .regex(/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/u);

const ancillaryTreatmentSchema = z.enum(LUZERNER_ANCILLARY_TREATMENTS);
const ancillaryCostsSchema = z.object(
  Object.fromEntries(
    LUZERNER_ANCILLARY_COST_KEYS.map((key) => [
      key,
      ancillaryTreatmentSchema,
    ]),
  ) as Record<
    (typeof LUZERNER_ANCILLARY_COST_KEYS)[number],
    typeof ancillaryTreatmentSchema
  >,
);

export const luzernerLeaseFormDataSchema = z
  .object({
    occupantsCount: z.number().int().min(1).max(99).nullable(),
    familyDwelling: z.boolean(),
    registeredPartnership: z.boolean(),
    furnished: z.boolean(),

    separateRoom: z.boolean(),
    cellar: z.boolean(),
    attic: z.boolean(),
    separateApartment: z.boolean(),
    garage: z.boolean(),
    garageNumber: z.string().trim().max(40).nullable(),
    parkingSpace: z.boolean(),
    parkingSpaceNumber: z.string().trim().max(40).nullable(),
    additionalObjects: z.array(z.string().trim().min(1).max(120)).max(2),

    sharedLaundryRoom: z.boolean(),
    sharedDryingRoom: z.boolean(),
    sharedClothesLine: z.boolean(),
    sharedStrollerStorage: z.boolean(),
    sharedGarden: z.boolean(),
    sharedHobbyRoom: z.boolean(),
    sharedPlayground: z.boolean(),
    sharedBicycleMopedStorage: z.boolean(),
    sharedUseExtras: z.array(z.string().trim().min(1).max(120)).max(2),

    useType: z.enum(LUZERNER_LEASE_USE_TYPES),
    customUse: z.string().trim().min(1).max(120).nullable(),

    handoverDate: dateOnlySchema.nullable(),
    durationMode: z.enum(LUZERNER_LEASE_DURATION_MODES),
    minimumFirstTerminationDate: dateOnlySchema.nullable(),
    terminationDateMode: z.enum(LUZERNER_TERMINATION_DATE_MODES),

    ancillaryCosts: ancillaryCostsSchema,
    customAncillaryCosts: z
      .array(
        z.object({
          label: z.string().trim().min(1).max(160),
          treatment: ancillaryTreatmentSchema,
        }),
      )
      .max(2),

    rentAdjustmentMode: z.enum(LUZERNER_RENT_ADJUSTMENT_MODES),
    adjustmentNoticeMonths: z.number().int().min(1).max(120).nullable(),
    indexPointsAtContract: canonicalDecimalSchema.nullable(),

    settlementCutoffMode: z.enum(LUZERNER_SETTLEMENT_CUTOFF_MODES),
    customSettlementCutoffDate: dateOnlySchema.nullable(),

    depositAccountOnTenantName: z.boolean(),
    liabilityInsurance: z.enum(LUZERNER_LIABILITY_INSURANCE_VALUES),
    referenceInterestRate: canonicalDecimalSchema.nullable(),
    costIncreaseBalancedUntil: dateOnlySchema.nullable(),
    consumerPriceIndex: canonicalDecimalSchema.nullable(),
    consumerPriceIndexMonthYear: z
      .string()
      .regex(/^(0[1-9]|1[0-2])\.\d{4}$/u)
      .nullable(),
    consumerPriceIndexBasis: z.string().trim().min(1).max(40).nullable(),
    incompleteAdjustmentReserveAmount: canonicalDecimalSchema.nullable(),
    incompleteAdjustmentReservePercent: canonicalDecimalSchema.nullable(),

    remarksAndAttachments: z.string().max(3000),
    initialRentFormAttached: z.boolean(),
    specialProvisions: z.string().max(5000),
    contractPlace: z.string().trim().min(1).max(120).nullable(),
  })
  .superRefine((value, ctx) => {
    if (!value.garage && value.garageNumber !== null) {
      ctx.addIssue({
        code: 'custom',
        path: ['garageNumber'],
        message: 'garageNumber requires garage=true.',
      });
    }
    if (!value.parkingSpace && value.parkingSpaceNumber !== null) {
      ctx.addIssue({
        code: 'custom',
        path: ['parkingSpaceNumber'],
        message: 'parkingSpaceNumber requires parkingSpace=true.',
      });
    }
    if ((value.useType === 'custom') !== (value.customUse !== null)) {
      ctx.addIssue({
        code: 'custom',
        path: ['customUse'],
        message: 'customUse must be present exactly when useType=custom.',
      });
    }
    if (
      (value.durationMode === 'minimum') !==
      (value.minimumFirstTerminationDate !== null)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['minimumFirstTerminationDate'],
        message:
          'minimumFirstTerminationDate must be present exactly for minimum duration.',
      });
    }
    if (
      (value.settlementCutoffMode === 'custom') !==
      (value.customSettlementCutoffDate !== null)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['customSettlementCutoffDate'],
        message:
          'customSettlementCutoffDate must be present exactly for custom settlement cutoff.',
      });
    }
    if (
      value.rentAdjustmentMode === 'index' &&
      value.indexPointsAtContract === null
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['indexPointsAtContract'],
        message: 'Index adjustment requires contract index points.',
      });
    }
  });

export const upsertLuzernerLeaseFormRequestSchema = z.object({
  expectedRevision: z.number().int().nonnegative(),
  templateDocumentVersionId: entityIdSchema.nullable().optional(),
  data: luzernerLeaseFormDataSchema,
});

export const luzernerLeaseFormProfileResponseSchema = z.object({
  agreementId: entityIdSchema,
  templateCode: z.literal(LUZERNER_LEASE_FORM_TEMPLATE),
  templateDocumentVersionId: entityIdSchema.nullable(),
  revision: z.number().int().positive(),
  data: luzernerLeaseFormDataSchema,
});

export const nullableLuzernerLeaseFormProfileResponseSchema =
  luzernerLeaseFormProfileResponseSchema.nullable();

export type LuzernerLeaseFormDataRequest = z.infer<
  typeof luzernerLeaseFormDataSchema
>;
export type UpsertLuzernerLeaseFormRequest = z.infer<
  typeof upsertLuzernerLeaseFormRequestSchema
>;
export type LuzernerLeaseFormProfileResponse = z.infer<
  typeof luzernerLeaseFormProfileResponseSchema
>;
