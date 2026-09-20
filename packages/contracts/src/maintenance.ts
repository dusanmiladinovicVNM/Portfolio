import { z } from 'zod';
import {
  MAINTENANCE_ISSUE_PRIORITIES,
  MAINTENANCE_ISSUE_STATUSES,
  MAINTENANCE_WORK_ORDER_STATUSES,
} from '@portfolio/domain';
import { instantSchema } from './api.js';
import { entityIdSchema } from './portfolio.js';


export const maintenanceAssigneeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('user'), userId: entityIdSchema }),
  z.object({ kind: z.literal('party'), partyId: entityIdSchema }),
]);

export const createMaintenanceIssueRequestSchema = z.object({
  code: z.string().trim().min(1),
  propertyId: entityIdSchema,
  unitId: entityIdSchema.nullable().optional(),
  spaceId: entityIdSchema.nullable().optional(),
  assetId: entityIdSchema.nullable().optional(),
  inspectionFindingId: entityIdSchema.nullable().optional(),
  title: z.string().trim().min(1),
  description: z.string().trim().min(1).nullable().optional(),
  priority: z.enum(MAINTENANCE_ISSUE_PRIORITIES),
  reportedAt: instantSchema.optional(),
});

export const updateMaintenanceIssueRequestSchema = z.object({
  expectedVersion: z.number().int().positive(),
  title: z.string().trim().min(1).optional(),
  description: z.string().trim().min(1).nullable().optional(),
  priority: z.enum(MAINTENANCE_ISSUE_PRIORITIES).optional(),
});

export const changeMaintenanceIssueStatusRequestSchema = z.object({
  expectedVersion: z.number().int().positive(),
  action: z.enum(['resolve', 'cancel']),
});

export const createMaintenanceWorkOrderRequestSchema = z.object({
  code: z.string().trim().min(1),
  title: z.string().trim().min(1),
  description: z.string().trim().min(1).nullable().optional(),
});

export const updateMaintenanceWorkOrderRequestSchema = z.object({
  expectedVersion: z.number().int().positive(),
  title: z.string().trim().min(1).optional(),
  description: z.string().trim().min(1).nullable().optional(),
});

export const assignMaintenanceWorkOrderRequestSchema = z.object({
  expectedVersion: z.number().int().positive(),
  assignee: maintenanceAssigneeSchema,
});

export const changeMaintenanceWorkOrderStatusRequestSchema = z.object({
  expectedVersion: z.number().int().positive(),
  action: z.enum(['start', 'complete', 'cancel']),
});

export const linkMaintenanceServiceEventRequestSchema = z.object({
  serviceEventId: entityIdSchema,
});

export const maintenanceIssueResponseSchema = z.object({
  id: entityIdSchema,
  code: z.string(),
  propertyId: entityIdSchema,
  unitId: entityIdSchema.nullable(),
  spaceId: entityIdSchema.nullable(),
  assetId: entityIdSchema.nullable(),
  inspectionFindingId: entityIdSchema.nullable(),
  title: z.string(),
  description: z.string().nullable(),
  priority: z.enum(MAINTENANCE_ISSUE_PRIORITIES),
  status: z.enum(MAINTENANCE_ISSUE_STATUSES),
  reportedAt: instantSchema,
  resolvedAt: instantSchema.nullable(),
  cancelledAt: instantSchema.nullable(),
  version: z.number().int().positive(),
  recordedAt: instantSchema,
  recordedByUserId: entityIdSchema,
});

export const maintenanceWorkOrderResponseSchema = z.object({
  id: entityIdSchema,
  issueId: entityIdSchema,
  code: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  assignee: maintenanceAssigneeSchema.nullable(),
  status: z.enum(MAINTENANCE_WORK_ORDER_STATUSES),
  assignedAt: instantSchema.nullable(),
  startedAt: instantSchema.nullable(),
  completedAt: instantSchema.nullable(),
  cancelledAt: instantSchema.nullable(),
  version: z.number().int().positive(),
  createdAt: instantSchema,
  createdByUserId: entityIdSchema,
});

export const maintenanceWorkOrderEntryResponseSchema = z.object({
  workOrder: maintenanceWorkOrderResponseSchema,
  serviceEventIds: z.array(entityIdSchema),
});

export type CreateMaintenanceIssueRequest = z.infer<
  typeof createMaintenanceIssueRequestSchema
>;
export type UpdateMaintenanceIssueRequest = z.infer<
  typeof updateMaintenanceIssueRequestSchema
>;
export type ChangeMaintenanceIssueStatusRequest = z.infer<
  typeof changeMaintenanceIssueStatusRequestSchema
>;
export type CreateMaintenanceWorkOrderRequest = z.infer<
  typeof createMaintenanceWorkOrderRequestSchema
>;
export type UpdateMaintenanceWorkOrderRequest = z.infer<
  typeof updateMaintenanceWorkOrderRequestSchema
>;
export type AssignMaintenanceWorkOrderRequest = z.infer<
  typeof assignMaintenanceWorkOrderRequestSchema
>;
export type ChangeMaintenanceWorkOrderStatusRequest = z.infer<
  typeof changeMaintenanceWorkOrderStatusRequestSchema
>;
export type MaintenanceIssueResponse = z.infer<
  typeof maintenanceIssueResponseSchema
>;
export type MaintenanceWorkOrderResponse = z.infer<
  typeof maintenanceWorkOrderResponseSchema
>;
export type MaintenanceWorkOrderEntryResponse = z.infer<
  typeof maintenanceWorkOrderEntryResponseSchema
>;
