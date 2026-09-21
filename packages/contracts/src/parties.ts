import { z } from 'zod';
import {
  ADDRESS_TYPES,
  CONTACT_POINT_TYPES,
  PARTY_STATUSES,
  PARTY_TYPES,
} from '@portfolio/domain';
import { entityIdSchema } from './portfolio.js';

const contactPointRequestSchema = z.object({
  contactType: z.enum(CONTACT_POINT_TYPES),
  value: z.string().trim().min(1),
  label: z.string().trim().nullable().optional(),
  isPrimary: z.boolean().optional(),
});

const addressRequestSchema = z.object({
  addressType: z.enum(ADDRESS_TYPES),
  line1: z.string().trim().min(1),
  line2: z.string().trim().nullable().optional(),
  postalCode: z.string().trim().min(1),
  city: z.string().trim().min(1),
  region: z.string().trim().nullable().optional(),
  countryCode: z.string().trim().length(2).transform((value) => value.toUpperCase()),
  isPrimary: z.boolean().optional(),
});

const partyBase = {
  code: z.string().trim().min(1),
  displayName: z.string().trim().min(1).optional(),
  contactPoints: z.array(contactPointRequestSchema).optional(),
  addresses: z.array(addressRequestSchema).optional(),
};

export const createPartyRequestSchema = z.discriminatedUnion('partyType', [
  z.object({
    ...partyBase,
    partyType: z.literal('person'),
    firstName: z.string().trim().min(1),
    middleName: z.string().trim().nullable().optional(),
    lastName: z.string().trim().min(1),
  }),
  z.object({
    ...partyBase,
    partyType: z.literal('company'),
    legalName: z.string().trim().min(1),
  }),
]);

const contactPointResponseSchema = z.object({
  id: entityIdSchema,
  partyId: entityIdSchema,
  contactType: z.enum(CONTACT_POINT_TYPES),
  value: z.string(),
  label: z.string().nullable(),
  isPrimary: z.boolean(),
});

const addressResponseSchema = z.object({
  id: entityIdSchema,
  partyId: entityIdSchema,
  addressType: z.enum(ADDRESS_TYPES),
  line1: z.string(),
  line2: z.string().nullable(),
  postalCode: z.string(),
  city: z.string(),
  region: z.string().nullable(),
  countryCode: z.string().length(2),
  isPrimary: z.boolean(),
});

const commonResponse = {
  id: entityIdSchema,
  code: z.string(),
  displayName: z.string(),
  status: z.enum(PARTY_STATUSES),
  contactPoints: z.array(contactPointResponseSchema),
  addresses: z.array(addressResponseSchema),
};

export const partyResponseSchema = z.discriminatedUnion('partyType', [
  z.object({
    ...commonResponse,
    partyType: z.literal(PARTY_TYPES[0]),
    firstName: z.string(),
    middleName: z.string().nullable(),
    lastName: z.string(),
  }),
  z.object({
    ...commonResponse,
    partyType: z.literal(PARTY_TYPES[1]),
    legalName: z.string(),
  }),
]);

export const partyIdsQuerySchema = z.object({
  ids: z.array(entityIdSchema).min(1).max(100),
});

export const partyListResponseSchema = z.object({
  items: z.array(partyResponseSchema),
});

export type CreatePartyRequest = z.infer<typeof createPartyRequestSchema>;
export type PartyResponse = z.infer<typeof partyResponseSchema>;
export type PartyIdsQuery = z.infer<typeof partyIdsQuerySchema>;
export type PartyListResponse = z.infer<typeof partyListResponseSchema>;
