import {
  asInspectionId,
  asInspectionSchemaVersionId,
  asOwnershipPeriodId,
  asPartyId,
  asTenancyId,
  asTenancyPartyId,
  asUnitId,
  asUserId,
  createInspection,
  createOwnershipPeriod,
  createTenancy,
} from '@portfolio/domain';
import { describe, expect, it } from 'vitest';
import {
  inspectionLandlordSignerPartyIds,
  inspectionTenantSignerPartyIds,
} from '../src/inspections/inspection-signature-party-policy.js';

describe('Inspection signatory Party policy shared by GET projection and signature POST', () => {
  const unitId = asUnitId('c1510000-0000-4000-8000-000000000001');
  const otherUnitId = asUnitId('c1510000-0000-4000-8000-000000000002');
  const tenantId = asPartyId('c1510000-0000-4000-8000-000000000003');
  const coTenantId = asPartyId('c1510000-0000-4000-8000-000000000004');
  const guarantorId = asPartyId('c1510000-0000-4000-8000-000000000005');
  const oldOwnerId = asPartyId('c1510000-0000-4000-8000-000000000006');
  const lockDateOwnerId = asPartyId('c1510000-0000-4000-8000-000000000007');
  const wrongUnitOwnerId = asPartyId('c1510000-0000-4000-8000-000000000008');

  const tenancy = createTenancy({
    id: asTenancyId('c1510000-0000-4000-8000-000000000009'),
    code: 'TEN-SIGNER-POLICY',
    unitId,
    parties: [
      {
        id: asTenancyPartyId('c1510000-0000-4000-8000-000000000010'),
        partyId: tenantId, role: 'tenant', isPrimary: true,
      },
      {
        id: asTenancyPartyId('c1510000-0000-4000-8000-000000000011'),
        partyId: coTenantId, role: 'co_tenant',
      },
      {
        id: asTenancyPartyId('c1510000-0000-4000-8000-000000000012'),
        partyId: guarantorId, role: 'guarantor',
      },
    ],
  });

  const inspection = createInspection({
    id: asInspectionId('c1510000-0000-4000-8000-000000000013'),
    code: 'INS-ELIGIBLE-PARTIES',
    inspectionType: 'move_in',
    unitId,
    tenancyId: tenancy.id,
    schemaVersionId: asInspectionSchemaVersionId('c1510000-0000-4000-8000-000000000014'),
    assignedToUserId: asUserId('c1510000-0000-4000-8000-000000000015'),
    createdByUserId: asUserId('c1510000-0000-4000-8000-000000000016'),
  });
  const locked = {
    ...inspection,
    status: 'locked' as const,
    lockedAt: '2026-09-18T20:00:00.000Z',
  };

  const ownershipPeriods = [
    createOwnershipPeriod({
      id: asOwnershipPeriodId('c1510000-0000-4000-8000-000000000017'),
      unitId,
      validFrom: '2026-01-01',
      validTo: '2026-09-17',
      owners: [{ partyId: oldOwnerId, shareBasisPoints: 10_000 }],
    }),
    createOwnershipPeriod({
      id: asOwnershipPeriodId('c1510000-0000-4000-8000-000000000018'),
      unitId,
      validFrom: '2026-09-18',
      owners: [{ partyId: lockDateOwnerId, shareBasisPoints: 10_000 }],
    }),
    createOwnershipPeriod({
      id: asOwnershipPeriodId('c1510000-0000-4000-8000-000000000019'),
      unitId: otherUnitId,
      validFrom: '2026-01-01',
      owners: [{ partyId: wrongUnitOwnerId, shareBasisPoints: 10_000 }],
    }),
  ];

  it('offers tenants and co-tenants only; never a guarantor or unrelated owner', () => {
    expect(inspectionTenantSignerPartyIds(tenancy)).toEqual([
      tenantId, coTenantId,
    ]);
    expect(inspectionTenantSignerPartyIds(null)).toEqual([]);
  });

  it('uses ownership on the exact lock date of this Unit, not the current owner or another Unit', () => {
    expect(
      inspectionLandlordSignerPartyIds(locked, ownershipPeriods),
    ).toEqual([lockDateOwnerId]);
    expect(
      inspectionLandlordSignerPartyIds(inspection, ownershipPeriods),
    ).toEqual([]);
  });

  it('keeps both predicate policies independent from display names and global Party directory', () => {
    expect(inspectionTenantSignerPartyIds(tenancy)).not.toContain(guarantorId);
    expect(inspectionLandlordSignerPartyIds(locked, ownershipPeriods)).not.toContain(oldOwnerId);
    expect(inspectionLandlordSignerPartyIds(locked, ownershipPeriods)).not.toContain(wrongUnitOwnerId);
  });
});
