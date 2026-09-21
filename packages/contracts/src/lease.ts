import { z } from 'zod';
import {
  BILLING_FREQUENCIES,
  LEASE_AGREEMENT_PARTY_ROLES,
  LEASE_AGREEMENT_STATUSES,
  LEASE_AGREEMENT_TYPES,
  LEASE_AMENDMENT_STATUSES,
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
