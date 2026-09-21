import { z } from 'zod';
import { TENANCY_PARTY_ROLES, TENANCY_STATUSES } from '@portfolio/domain';
import { entityIdSchema } from './portfolio.js';

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const tenancyPartyRequestSchema = z.object({
  partyId: entityIdSchema,
  role: z.enum(TENANCY_PARTY_ROLES),
  isPrimary: z.boolean().optional(),
});

export const createTenancyRequestSchema = z.object({
  code: z.string().trim().min(1),
  parties: z.array(tenancyPartyRequestSchema).optional(),
});

export const addTenancyPartyRequestSchema = tenancyPartyRequestSchema.extend({
  expectedVersion: z.number().int().positive(),
});

export const planTenancyRequestSchema = z.object({
  expectedVersion: z.number().int().positive(),
  plannedStart: isoDateSchema,
  plannedEnd: isoDateSchema.nullable().optional(),
});

export const activateTenancyRequestSchema = z.object({
  expectedVersion: z.number().int().positive(),
  actualStart: isoDateSchema,
});

export const giveTenancyNoticeRequestSchema = z.object({
  expectedVersion: z.number().int().positive(),
  noticeGivenAt: isoDateSchema,
  terminationEffectiveAt: isoDateSchema,
});

export const tenancyVersionRequestSchema = z.object({
  expectedVersion: z.number().int().positive(),
});

export const endTenancyRequestSchema = tenancyVersionRequestSchema.extend({
  actualEnd: isoDateSchema,
});

export const tenancyResponseSchema = z.object({
  id: entityIdSchema,
  code: z.string(),
  unitId: entityIdSchema,
  status: z.enum(TENANCY_STATUSES),
  plannedStart: isoDateSchema.nullable(),
  plannedEnd: isoDateSchema.nullable(),
  actualStart: isoDateSchema.nullable(),
  actualEnd: isoDateSchema.nullable(),
  noticeGivenAt: isoDateSchema.nullable(),
  terminationEffectiveAt: isoDateSchema.nullable(),
  version: z.number().int().positive(),
  parties: z.array(
    z.object({
      id: entityIdSchema,
      tenancyId: entityIdSchema,
      partyId: entityIdSchema,
      role: z.enum(TENANCY_PARTY_ROLES),
      isPrimary: z.boolean(),
    }),
  ),
});

export const tenancyListResponseSchema = z.object({
  items: z.array(tenancyResponseSchema),
});

export type CreateTenancyRequest = z.infer<typeof createTenancyRequestSchema>;
export type TenancyResponse = z.infer<typeof tenancyResponseSchema>;
export type TenancyListResponse = z.infer<typeof tenancyListResponseSchema>;
