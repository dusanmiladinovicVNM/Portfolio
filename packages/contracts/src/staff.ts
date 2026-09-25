import { z } from 'zod';
import { entityIdSchema } from './portfolio.js';

export const staffRoleSchema = z.enum(['admin', 'manager', 'inspector']);
export const staffStatusSchema = z.enum(['active', 'inactive']);

export const createStaffRequestSchema = z.object({
  displayName: z.string().trim().min(1),
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
  role: staffRoleSchema,
});

export const staffCommandRevisionSchema = z.object({
  expectedRevision: z.number().int().positive(),
});

export const updateStaffRoleRequestSchema = staffCommandRevisionSchema.extend({
  role: staffRoleSchema,
});

export const updateStaffStatusRequestSchema = staffCommandRevisionSchema.extend({
  status: staffStatusSchema,
});

export const staffResponseSchema = z.object({
  userId: entityIdSchema,
  displayName: z.string(),
  email: z.string().nullable(),
  role: staffRoleSchema,
  status: staffStatusSchema,
  revision: z.number().int().positive(),
  identityProviders: z.array(z.string()),
});

export const staffListResponseSchema = z.object({
  items: z.array(staffResponseSchema),
});

export type CreateStaffRequest = z.infer<typeof createStaffRequestSchema>;
export type UpdateStaffRoleRequest = z.infer<typeof updateStaffRoleRequestSchema>;
export type UpdateStaffStatusRequest = z.infer<typeof updateStaffStatusRequestSchema>;
export type StaffResponse = z.infer<typeof staffResponseSchema>;
export type StaffListResponse = z.infer<typeof staffListResponseSchema>;
