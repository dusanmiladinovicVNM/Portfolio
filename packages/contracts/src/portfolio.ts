import { z } from 'zod';
import {
  PROPERTY_STATUSES,
  PROPERTY_TYPES,
  SPACE_TYPES,
  UNIT_STATUSES,
  UNIT_TYPES,
} from '@portfolio/domain';

export const entityIdSchema = z.uuid();

export const createPropertyRequestSchema = z.object({
  code: z.string().trim().min(1),
  name: z.string().trim().min(1),
  propertyType: z.enum(PROPERTY_TYPES),
  street: z.string().trim().min(1),
  houseNumber: z.string().trim().min(1),
  postalCode: z.string().trim().min(1),
  city: z.string().trim().min(1),
  countryCode: z.string().trim().length(2).transform((value) => value.toUpperCase()),
  yearBuilt: z.number().int().min(1000).max(3000).nullable().optional(),
});

export const createUnitRequestSchema = z.object({
  propertyId: entityIdSchema,
  code: z.string().trim().min(1),
  unitNumber: z.string().trim().min(1),
  unitType: z.enum(UNIT_TYPES),
  floor: z.string().trim().nullable().optional(),
  areaM2: z.number().positive().nullable().optional(),
  rooms: z.number().positive().nullable().optional(),
  notes: z.string().trim().optional(),
});

export const createSpaceRequestSchema = z.object({
  unitId: entityIdSchema,
  code: z.string().trim().min(1),
  name: z.string().trim().min(1),
  spaceType: z.enum(SPACE_TYPES),
  areaM2: z.number().positive().nullable().optional(),
  sortOrder: z.number().int().nonnegative().optional(),
});

export const propertyResponseSchema = z.object({
  id: entityIdSchema,
  code: z.string(),
  name: z.string(),
  propertyType: z.enum(PROPERTY_TYPES),
  street: z.string(),
  houseNumber: z.string(),
  postalCode: z.string(),
  city: z.string(),
  countryCode: z.string().length(2),
  yearBuilt: z.number().int().nullable(),
  status: z.enum(PROPERTY_STATUSES),
});

export const unitResponseSchema = z.object({
  id: entityIdSchema,
  propertyId: entityIdSchema,
  code: z.string(),
  unitNumber: z.string(),
  unitType: z.enum(UNIT_TYPES),
  floor: z.string().nullable(),
  areaM2: z.number().nullable(),
  rooms: z.number().nullable(),
  status: z.enum(UNIT_STATUSES),
  notes: z.string(),
});

export const spaceResponseSchema = z.object({
  id: entityIdSchema,
  unitId: entityIdSchema,
  code: z.string(),
  name: z.string(),
  spaceType: z.enum(SPACE_TYPES),
  areaM2: z.number().nullable(),
  sortOrder: z.number().int().nonnegative(),
  active: z.boolean(),
});

export type CreatePropertyRequest = z.infer<typeof createPropertyRequestSchema>;
export type CreateUnitRequest = z.infer<typeof createUnitRequestSchema>;
export type CreateSpaceRequest = z.infer<typeof createSpaceRequestSchema>;
export type PropertyResponse = z.infer<typeof propertyResponseSchema>;
export type UnitResponse = z.infer<typeof unitResponseSchema>;
export type SpaceResponse = z.infer<typeof spaceResponseSchema>;
