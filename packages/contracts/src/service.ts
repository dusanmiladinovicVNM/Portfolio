import { z } from 'zod';
import {
  SERVICE_EVENT_TYPES,
  SERVICE_PLAN_KINDS,
  SERVICE_PLAN_STATUSES,
  WARRANTY_CLAIM_STATUSES,
  WARRANTY_TYPES,
} from '@portfolio/domain';
import { instantSchema } from './api.js';
import { entityIdSchema } from './portfolio.js';

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const createWarrantyRequestSchema = z.object({
  warrantyType: z.enum(WARRANTY_TYPES),
  providerPartyId: entityIdSchema.nullable().optional(),
  reference: z.string().trim().min(1).nullable().optional(),
  validFrom: isoDateSchema,
  validTo: isoDateSchema.nullable().optional(),
  terms: z.string().trim().min(1).nullable().optional(),
});

export const createWarrantyClaimRequestSchema = z.object({
  incidentOn: isoDateSchema,
  description: z.string().trim().min(1),
});

export const submitWarrantyClaimRequestSchema = z.object({
  expectedVersion: z.number().int().positive(),
  providerReference: z.string().trim().min(1).nullable().optional(),
});

export const resolveWarrantyClaimRequestSchema = z.object({
  expectedVersion: z.number().int().positive(),
  decision: z.enum(['approved', 'rejected']),
});

export const warrantyClaimVersionRequestSchema = z.object({
  expectedVersion: z.number().int().positive(),
});

export const createServicePlanRequestSchema = z.object({
  name: z.string().trim().min(1),
  scheduleKind: z.enum(SERVICE_PLAN_KINDS),
  firstDueOn: isoDateSchema,
  intervalMonths: z.number().int().positive().nullable().optional(),
  providerPartyId: entityIdSchema.nullable().optional(),
  notes: z.string().trim().min(1).nullable().optional(),
});

export const changeServicePlanStatusRequestSchema = z.object({
  expectedVersion: z.number().int().positive(),
  status: z.enum(SERVICE_PLAN_STATUSES),
});

export const servicePartRequestSchema = z.object({
  name: z.string().trim().min(1),
  partNumber: z.string().trim().min(1).nullable().optional(),
  serialNumber: z.string().trim().min(1).nullable().optional(),
  quantity: z.number().int().positive(),
  notes: z.string().trim().min(1).nullable().optional(),
});

export const recordServiceEventRequestSchema = z.object({
  servicePlanId: entityIdSchema.nullable().optional(),
  warrantyClaimId: entityIdSchema.nullable().optional(),
  eventType: z.enum(SERVICE_EVENT_TYPES),
  performedAt: instantSchema,
  providerPartyId: entityIdSchema.nullable().optional(),
  description: z.string().trim().min(1),
  reference: z.string().trim().min(1).nullable().optional(),
  parts: z.array(servicePartRequestSchema).optional(),
});

export const warrantyResponseSchema = z.object({
  id: entityIdSchema,
  assetId: entityIdSchema,
  warrantyType: z.enum(WARRANTY_TYPES),
  providerPartyId: entityIdSchema.nullable(),
  reference: z.string().nullable(),
  validFrom: isoDateSchema,
  validTo: isoDateSchema.nullable(),
  terms: z.string().nullable(),
  recordedAt: instantSchema,
  recordedByUserId: entityIdSchema,
});

export const warrantyClaimResponseSchema = z.object({
  id: entityIdSchema,
  warrantyId: entityIdSchema,
  incidentOn: isoDateSchema,
  description: z.string(),
  status: z.enum(WARRANTY_CLAIM_STATUSES),
  providerReference: z.string().nullable(),
  submittedAt: instantSchema.nullable(),
  resolvedAt: instantSchema.nullable(),
  closedAt: instantSchema.nullable(),
  cancelledAt: instantSchema.nullable(),
  recordedAt: instantSchema,
  recordedByUserId: entityIdSchema,
  version: z.number().int().positive(),
});

export const servicePlanResponseSchema = z.object({
  id: entityIdSchema,
  assetId: entityIdSchema,
  name: z.string(),
  scheduleKind: z.enum(SERVICE_PLAN_KINDS),
  firstDueOn: isoDateSchema,
  intervalMonths: z.number().int().positive().nullable(),
  providerPartyId: entityIdSchema.nullable(),
  notes: z.string().nullable(),
  status: z.enum(SERVICE_PLAN_STATUSES),
  version: z.number().int().positive(),
  createdAt: instantSchema,
  createdByUserId: entityIdSchema,
});

export const servicePartResponseSchema = z.object({
  id: entityIdSchema,
  serviceEventId: entityIdSchema,
  name: z.string(),
  partNumber: z.string().nullable(),
  serialNumber: z.string().nullable(),
  quantity: z.number().int().positive(),
  notes: z.string().nullable(),
});

export const serviceEventResponseSchema = z.object({
  id: entityIdSchema,
  assetId: entityIdSchema,
  servicePlanId: entityIdSchema.nullable(),
  warrantyClaimId: entityIdSchema.nullable(),
  eventType: z.enum(SERVICE_EVENT_TYPES),
  performedAt: instantSchema,
  providerPartyId: entityIdSchema.nullable(),
  description: z.string(),
  reference: z.string().nullable(),
  parts: z.array(servicePartResponseSchema),
  recordedAt: instantSchema,
  recordedByUserId: entityIdSchema,
});

export type CreateWarrantyRequest = z.infer<typeof createWarrantyRequestSchema>;
export type CreateWarrantyClaimRequest = z.infer<typeof createWarrantyClaimRequestSchema>;
export type SubmitWarrantyClaimRequest = z.infer<typeof submitWarrantyClaimRequestSchema>;
export type ResolveWarrantyClaimRequest = z.infer<typeof resolveWarrantyClaimRequestSchema>;
export type CreateServicePlanRequest = z.infer<typeof createServicePlanRequestSchema>;
export type ChangeServicePlanStatusRequest = z.infer<typeof changeServicePlanStatusRequestSchema>;
export type RecordServiceEventRequest = z.infer<typeof recordServiceEventRequestSchema>;
export type WarrantyResponse = z.infer<typeof warrantyResponseSchema>;
export type WarrantyClaimResponse = z.infer<typeof warrantyClaimResponseSchema>;
export type ServicePlanResponse = z.infer<typeof servicePlanResponseSchema>;
export type ServiceEventResponse = z.infer<typeof serviceEventResponseSchema>;
