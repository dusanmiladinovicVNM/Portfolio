import { describe, expect, it } from 'vitest';
import { asUserId } from '@portfolio/domain';
import {
  CAPABILITIES,
  actorHasCapability,
  canControlInspectionLifecycle,
  requireCapability,
  type Actor,
  type Capability,
  type StaffRole,
} from '../src/index.js';

const userId = asUserId('90000000-0000-4000-8000-000000000001');

function actor(role: StaffRole): Actor {
  return { userId, role };
}

function allowed(role: StaffRole, capability: Capability): boolean {
  try {
    requireCapability(actor(role), capability);
    return true;
  } catch {
    return false;
  }
}

describe('Portfolio authorization capability matrix', () => {
  it('keeps staff administration admin-only while manager retains every business capability', () => {
    expect(
      CAPABILITIES.filter((capability) => !allowed('admin', capability)),
    ).toEqual([]);

    expect(
      CAPABILITIES.filter((capability) => !allowed('manager', capability)),
    ).toEqual(['staff:admin']);
  });

  it('keeps inspector read-mostly with only assigned Inspection and meter-reading writes', () => {
    const expected = new Set<Capability>([
      'portfolio:read',
      'parties:read',
      'ownership:read',
      'tenancy:read',
      'contracts:read',
      'documents:read',
      'inspections:read',
      'inspections:write',
      'inspection_schemas:read',
      'assets:read',
      'service:read',
      'improvements:read',
      'maintenance:read',
      'access_items:read',
      'meters:read',
      'meter_readings:write',
    ]);

    const actual = new Set(
      CAPABILITIES.filter((capability) => allowed('inspector', capability)),
    );

    expect(actual).toEqual(expected);
  });

  it('projects controlled Inspection lifecycle policy from verified actor roles', () => {
    expect(canControlInspectionLifecycle(actor('inspector'))).toBe(false);
    expect(canControlInspectionLifecycle(actor('manager'))).toBe(true);
    expect(canControlInspectionLifecycle(actor('admin'))).toBe(true);

    expect(actorHasCapability(actor('inspector'), 'inspections:write')).toBe(true);
    expect(actorHasCapability(actor('inspector'), 'documents:write')).toBe(false);
    expect(actorHasCapability(actor('manager'), 'documents:write')).toBe(true);
    expect(actorHasCapability(actor('admin'), 'documents:write')).toBe(true);
  });

  it('fails closed for every inspector business-write capability outside the explicit field set', () => {
    const forbiddenWrites = [
      'portfolio:write',
      'parties:write',
      'ownership:write',
      'tenancy:write',
      'contracts:write',
      'documents:write',
      'inspection_schemas:write',
      'assets:write',
      'service:write',
      'improvements:write',
      'costs:write',
      'maintenance:write',
      'access_items:write',
      'meters:write',
    ] as const satisfies readonly Capability[];

    for (const capability of forbiddenWrites) {
      expect(() =>
        requireCapability(actor('inspector'), capability),
      ).toThrowError(
        expect.objectContaining({
          code: 'FORBIDDEN',
        }),
      );
    }
  });
});
