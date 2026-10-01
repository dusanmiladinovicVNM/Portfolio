import { z } from 'zod';
import {
  INSPECTION_STATUSES,
  INSPECTION_TYPES,
  MAINTENANCE_ISSUE_PRIORITIES,
  SERVICE_PLAN_KINDS,
  TENANCY_STATUSES,
} from '@portfolio/domain';
import { instantSchema } from './api.js';
import { entityIdSchema } from './portfolio.js';

const dateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const WORK_ATTENTION_VALUES = [
  'urgent',
  'overdue',
  'today',
  'high',
  'upcoming',
  'normal',
  'unscheduled',
] as const;

export const WORK_OCCUPANCY_REASONS = [
  'contract_missing',
  'contract_draft',
  'move_out',
] as const;

const workLocationSchema = z.object({
  propertyId: entityIdSchema,
  propertyCode: z.string().trim().min(1),
  propertyName: z.string().trim().min(1),
  unitId: entityIdSchema.nullable(),
  unitCode: z.string().trim().min(1).nullable(),
  unitNumber: z.string().trim().min(1).nullable(),
});

export const workInspectionItemResponseSchema = workLocationSchema.extend({
  kind: z.literal('inspection'),
  attention: z.enum(WORK_ATTENTION_VALUES),
  unitId: entityIdSchema,
  unitCode: z.string().trim().min(1),
  unitNumber: z.string().trim().min(1),
  inspectionId: entityIdSchema,
  inspectionCode: z.string().trim().min(1),
  inspectionType: z.enum(INSPECTION_TYPES),
  inspectionStatus: z.enum(INSPECTION_STATUSES),
  scheduledFor: dateOnlySchema.nullable(),
  assignedToUserId: entityIdSchema,
  assignedToDisplayName: z.string().trim().min(1).nullable(),
  assignedToRole: z.enum(['admin', 'manager', 'inspector']).nullable(),
});

export const workMaintenanceItemResponseSchema = workLocationSchema.extend({
  kind: z.literal('maintenance'),
  attention: z.enum(WORK_ATTENTION_VALUES),
  issueId: entityIdSchema,
  issueCode: z.string().trim().min(1),
  title: z.string().trim().min(1),
  priority: z.enum(MAINTENANCE_ISSUE_PRIORITIES),
  reportedAt: instantSchema,
  activeWorkOrderCount: z.number().int().nonnegative(),
});

export const workServiceItemResponseSchema = workLocationSchema.extend({
  kind: z.literal('service'),
  attention: z.enum(WORK_ATTENTION_VALUES),
  servicePlanId: entityIdSchema,
  assetId: entityIdSchema,
  assetCode: z.string().trim().min(1),
  assetName: z.string().trim().min(1),
  planName: z.string().trim().min(1),
  scheduleKind: z.enum(SERVICE_PLAN_KINDS),
  firstDueOn: dateOnlySchema,
  intervalMonths: z.number().int().positive().nullable(),
  dueOn: dateOnlySchema,
});

export const workOccupancyItemResponseSchema = workLocationSchema.extend({
  kind: z.literal('occupancy'),
  attention: z.enum(WORK_ATTENTION_VALUES),
  unitId: entityIdSchema,
  unitCode: z.string().trim().min(1),
  unitNumber: z.string().trim().min(1),
  reason: z.enum(WORK_OCCUPANCY_REASONS),
  tenancyId: entityIdSchema,
  tenancyCode: z.string().trim().min(1),
  tenancyStatus: z.enum(TENANCY_STATUSES),
  agreementId: entityIdSchema.nullable(),
  agreementCode: z.string().trim().min(1).nullable(),
  dueDate: dateOnlySchema.nullable(),
});

export const operationalWorkItemResponseSchema = z.discriminatedUnion('kind', [
  workInspectionItemResponseSchema,
  workMaintenanceItemResponseSchema,
  workServiceItemResponseSchema,
  workOccupancyItemResponseSchema,
]);

export const operationalWorkQueueResponseSchema = z.object({
  referenceDate: dateOnlySchema,
  items: z.array(operationalWorkItemResponseSchema),
});

export type WorkInspectionItemResponse = z.infer<
  typeof workInspectionItemResponseSchema
>;
export type WorkMaintenanceItemResponse = z.infer<
  typeof workMaintenanceItemResponseSchema
>;
export type WorkServiceItemResponse = z.infer<
  typeof workServiceItemResponseSchema
>;
export type WorkOccupancyItemResponse = z.infer<
  typeof workOccupancyItemResponseSchema
>;
export type OperationalWorkItemResponse = z.infer<
  typeof operationalWorkItemResponseSchema
>;
export type OperationalWorkQueueResponse = z.infer<
  typeof operationalWorkQueueResponseSchema
>;
