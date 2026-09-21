import { z } from 'zod';
import {
  UNIT_TIMELINE_CATEGORIES,
  UNIT_TIMELINE_EVENT_TYPES,
  UNIT_TIMELINE_SOURCE_TYPES,
  UNIT_TIMELINE_TEMPORAL_PRECISIONS,
} from '@portfolio/domain';
import { instantSchema } from './api.js';
import { entityIdSchema } from './portfolio.js';

const dateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const unitTimelineQuerySchema = z
  .object({
    categories: z.array(z.enum(UNIT_TIMELINE_CATEGORIES)).default([]),
    from: dateOnlySchema.optional(),
    to: dateOnlySchema.optional(),
    limit: z.coerce.number().int().min(1).max(500).default(100),
    offset: z.coerce.number().int().nonnegative().default(0),
  })
  .refine(
    (value) =>
      value.from === undefined ||
      value.to === undefined ||
      value.from <= value.to,
    { message: 'from cannot be after to.' },
  );

const detailValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]);

export const unitTimelineEventResponseSchema = z.object({
  eventKey: z.string().min(1),
  unitId: entityIdSchema,
  category: z.enum(UNIT_TIMELINE_CATEGORIES),
  eventType: z.enum(UNIT_TIMELINE_EVENT_TYPES),
  precision: z.enum(UNIT_TIMELINE_TEMPORAL_PRECISIONS),
  occurredOn: dateOnlySchema,
  occurredAt: instantSchema.nullable(),
  recordedAt: instantSchema.nullable(),
  recordedByUserId: entityIdSchema.nullable(),
  sourceType: z.enum(UNIT_TIMELINE_SOURCE_TYPES),
  sourceId: z.string().min(1),
  relatedEntityType: z.string().min(1).nullable(),
  relatedEntityId: z.string().min(1).nullable(),
  details: z.record(z.string(), detailValueSchema),
});

export const unitTimelineResponseSchema = z.object({
  items: z.array(unitTimelineEventResponseSchema),
  limit: z.number().int().positive(),
  offset: z.number().int().nonnegative(),
});

export type UnitTimelineEventResponse = z.infer<
  typeof unitTimelineEventResponseSchema
>;
export type UnitTimelineResponse = z.infer<typeof unitTimelineResponseSchema>;
