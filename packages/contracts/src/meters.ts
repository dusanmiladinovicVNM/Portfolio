import { z } from 'zod';
import {
  METER_MEASUREMENT_UNITS,
  METER_READING_BOUNDARY_TYPES,
  METER_STATUSES,
  METER_UTILITY_TYPES,
} from '@portfolio/domain';
import { instantSchema } from './api.js';
import { entityIdSchema } from './portfolio.js';

export const createMeterRequestSchema = z.object({
  code: z.string().trim().min(1),
  serialNumber: z.string().trim().min(1),
  utilityType: z.enum(METER_UTILITY_TYPES),
  measurementUnit: z.enum(METER_MEASUREMENT_UNITS),
  unitId: entityIdSchema,
  spaceId: entityIdSchema.nullable().optional(),
  label: z.string().trim().min(1),
  installedAt: instantSchema,
});

export const updateMeterRequestSchema = z.object({
  expectedVersion: z.number().int().positive(),
  label: z.string().trim().min(1),
});

export const retireMeterRequestSchema = z.object({
  expectedVersion: z.number().int().positive(),
  retiredAt: instantSchema,
  retirementReason: z.string().trim().min(1),
});

export const recordMeterReadingRequestSchema = z.object({
  value: z.string().trim().min(1),
  readAt: instantSchema,
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
  installedAt: instantSchema,
  status: z.enum(METER_STATUSES),
  retiredAt: instantSchema.nullable(),
  retirementRecordedAt: instantSchema.nullable(),
  retiredByUserId: entityIdSchema.nullable(),
  retirementReason: z.string().nullable(),
  version: z.number().int().positive(),
  recordedAt: instantSchema,
  recordedByUserId: entityIdSchema,
});

export const meterReadingResponseSchema = z.object({
  id: entityIdSchema,
  meterId: entityIdSchema,
  value: z.string(),
  readAt: instantSchema,
  recordedAt: instantSchema,
  recordedByUserId: entityIdSchema,
  note: z.string().nullable(),
});

export const meterReadingBoundaryResponseSchema = z.object({
  id: entityIdSchema,
  readingId: entityIdSchema,
  tenancyId: entityIdSchema,
  type: z.enum(METER_READING_BOUNDARY_TYPES),
  recordedAt: instantSchema,
  recordedByUserId: entityIdSchema,
});

export const meterConsumptionIntervalResponseSchema = z.object({
  fromReadingId: entityIdSchema,
  toReadingId: entityIdSchema,
  fromReadAt: instantSchema,
  toReadAt: instantSchema,
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
