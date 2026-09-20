import { z } from 'zod';
import {
  METER_MEASUREMENT_UNITS,
  METER_READING_BOUNDARY_TYPES,
  METER_STATUSES,
  METER_UTILITY_TYPES,
} from '@portfolio/domain';
import { entityIdSchema } from './portfolio.js';

const timestampSchema = z.string().min(1);

export const createMeterRequestSchema = z.object({
  code: z.string().trim().min(1),
  serialNumber: z.string().trim().min(1),
  utilityType: z.enum(METER_UTILITY_TYPES),
  measurementUnit: z.enum(METER_MEASUREMENT_UNITS),
  unitId: entityIdSchema,
  spaceId: entityIdSchema.nullable().optional(),
  label: z.string().trim().min(1),
  installedAt: timestampSchema,
});

export const updateMeterRequestSchema = z.object({
  expectedVersion: z.number().int().positive(),
  label: z.string().trim().min(1),
});

export const retireMeterRequestSchema = z.object({
  expectedVersion: z.number().int().positive(),
  retiredAt: timestampSchema,
  retirementReason: z.string().trim().min(1),
});

export const recordMeterReadingRequestSchema = z.object({
  value: z.string().trim().min(1),
  readAt: timestampSchema,
  note: z.string().trim().min(1).nullable().optional(),
});

export const linkMeterReadingBoundaryRequestSchema = z.object({
  tenancyId: entityIdSchema,
  type: z.enum(METER_READING_BOUNDARY_TYPES),
});

export const meterResponseSchema = z.object({
  id: entityIdSchema,
  code: z.string(),
  serialNumber: z.string(),
  utilityType: z.enum(METER_UTILITY_TYPES),
  measurementUnit: z.enum(METER_MEASUREMENT_UNITS),
  unitId: entityIdSchema,
  spaceId: entityIdSchema.nullable(),
  label: z.string(),
  installedAt: timestampSchema,
  status: z.enum(METER_STATUSES),
  retiredAt: timestampSchema.nullable(),
  retirementRecordedAt: timestampSchema.nullable(),
  retiredByUserId: entityIdSchema.nullable(),
  retirementReason: z.string().nullable(),
  version: z.number().int().positive(),
  recordedAt: timestampSchema,
  recordedByUserId: entityIdSchema,
});

export const meterReadingResponseSchema = z.object({
  id: entityIdSchema,
  meterId: entityIdSchema,
  value: z.string(),
  readAt: timestampSchema,
  recordedAt: timestampSchema,
  recordedByUserId: entityIdSchema,
  note: z.string().nullable(),
});

export const meterReadingBoundaryResponseSchema = z.object({
  id: entityIdSchema,
  readingId: entityIdSchema,
  tenancyId: entityIdSchema,
  type: z.enum(METER_READING_BOUNDARY_TYPES),
  recordedAt: timestampSchema,
  recordedByUserId: entityIdSchema,
});

export const meterConsumptionIntervalResponseSchema = z.object({
  fromReadingId: entityIdSchema,
  toReadingId: entityIdSchema,
  fromReadAt: timestampSchema,
  toReadAt: timestampSchema,
  fromValue: z.string(),
  toValue: z.string(),
  consumption: z.string().nullable(),
  continuity: z.enum(['continuous', 'decrease_detected']),
});

export const meterDetailResponseSchema = z.object({
  meter: meterResponseSchema,
  readings: z.array(meterReadingResponseSchema),
  boundaries: z.array(meterReadingBoundaryResponseSchema),
  consumptionIntervals: z.array(meterConsumptionIntervalResponseSchema),
});

export type MeterResponse = z.infer<typeof meterResponseSchema>;
export type MeterReadingResponse = z.infer<typeof meterReadingResponseSchema>;
export type MeterReadingBoundaryResponse = z.infer<
  typeof meterReadingBoundaryResponseSchema
>;
export type MeterConsumptionIntervalResponse = z.infer<
  typeof meterConsumptionIntervalResponseSchema
>;
