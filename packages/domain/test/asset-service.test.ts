import { describe, expect, it } from 'vitest';
import {
  asAssetId,
  asPartyId,
  asPropertyId,
  asServiceEventId,
  asServicePartId,
  asServicePlanId,
  asUserId,
  asWarrantyClaimId,
  asWarrantyId,
  assertServicePlanAssetEligible,
  cancelWarrantyClaim,
  changeServicePlanStatus,
  closeWarrantyClaim,
  createAsset,
  createServiceEvent,
  createServicePlan,
  createWarranty,
  createWarrantyClaim,
  isServicePlanOperationallyApplicable,
  markAssetReplaced,
  resolveWarrantyClaim,
  submitWarrantyClaim,
} from '../src/index.js';

const assetId = asAssetId('d1000000-0000-4000-8000-000000000001');
const userId = asUserId('d1000000-0000-4000-8000-000000000002');
const providerId = asPartyId('d1000000-0000-4000-8000-000000000003');

function warranty() {
  return createWarranty({
    id: asWarrantyId('d1000000-0000-4000-8000-000000000004'),
    assetId,
    warrantyType: 'manufacturer',
    providerPartyId: providerId,
    reference: 'W-100',
    validFrom: '2026-01-01',
    validTo: '2027-12-31',
    recordedAt: '2026-09-19T08:00:00.000Z',
    recordedByUserId: userId,
  });
}

describe('Warranty and Service domain', () => {
  it('keeps claim incident time inside exact warranty coverage', () => {
    const coverage = warranty();
    const claim = createWarrantyClaim({
      id: asWarrantyClaimId('d1000000-0000-4000-8000-000000000005'),
      warranty: coverage,
      incidentOn: '2026-09-01',
      description: 'Compressor stopped',
      recordedAt: '2026-09-19T08:00:00.000Z',
      recordedByUserId: userId,
    });

    expect(claim).toMatchObject({
      warrantyId: coverage.id,
      status: 'draft',
      version: 1,
    });

    expect(() =>
      createWarrantyClaim({
        id: asWarrantyClaimId('d1000000-0000-4000-8000-000000000006'),
        warranty: coverage,
        incidentOn: '2028-01-01',
        description: 'Too late',
        recordedAt: '2026-09-19T08:00:00.000Z',
        recordedByUserId: userId,
      }),
    ).toThrowError(/coverage interval/);
  });

  it('rejects a WarrantyClaim incident after its recording date', () => {
    expect(() =>
      createWarrantyClaim({
        id: asWarrantyClaimId('d1000000-0000-4000-8000-000000000017'),
        warranty: warranty(),
        incidentOn: '2027-03-01',
        description: 'Impossible future incident',
        recordedAt: '2026-09-19T08:00:00.000Z',
        recordedByUserId: userId,
      }),
    ).toThrowError(/recording date/);
  });

  it('uses an explicit optimistic WarrantyClaim lifecycle', () => {
    const claim = createWarrantyClaim({
      id: asWarrantyClaimId('d1000000-0000-4000-8000-000000000007'),
      warranty: warranty(),
      incidentOn: '2026-09-01',
      description: 'Control board failure',
      recordedAt: '2026-09-19T08:00:00.000Z',
      recordedByUserId: userId,
    });

    const submitted = submitWarrantyClaim(
      claim,
      '2026-09-02T09:00:00.000Z',
      'PROVIDER-77',
    );
    const approved = resolveWarrantyClaim(
      submitted,
      'approved',
      '2026-09-03T10:00:00.000Z',
    );
    const closed = closeWarrantyClaim(
      approved,
      '2026-09-05T12:00:00.000Z',
    );

    expect(closed).toMatchObject({
      status: 'closed',
      providerReference: 'PROVIDER-77',
      version: 4,
    });
    expect(() =>
      cancelWarrantyClaim(closed, '2026-09-06T12:00:00.000Z'),
    ).toThrowError(/Cannot cancel/);
  });

  it('separates ServicePlan schedule shape from completed service truth', () => {
    const recurring = createServicePlan({
      id: asServicePlanId('d1000000-0000-4000-8000-000000000008'),
      assetId,
      name: 'Annual HVAC service',
      scheduleKind: 'recurring',
      firstDueOn: '2027-01-15',
      intervalMonths: 12,
      createdAt: '2026-09-19T08:00:00.000Z',
      createdByUserId: userId,
    });
    const paused = changeServicePlanStatus(recurring, 'paused');
    const activeAgain = changeServicePlanStatus(paused, 'active');
    const ended = changeServicePlanStatus(activeAgain, 'ended');

    expect(ended).toMatchObject({ status: 'ended', version: 4 });
    expect(() => changeServicePlanStatus(ended, 'active')).toThrowError(
      /cannot transition/,
    );

    expect(() =>
      createServicePlan({
        id: asServicePlanId('d1000000-0000-4000-8000-000000000009'),
        assetId,
        name: 'Broken one-time plan',
        scheduleKind: 'one_time',
        firstDueOn: '2027-01-15',
        intervalMonths: 12,
        createdAt: '2026-09-19T08:00:00.000Z',
        createdByUserId: userId,
      }),
    ).toThrowError(/cannot have intervalMonths/);
  });

  it('derives ServicePlan operational applicability from Asset lifecycle', () => {
    const asset = createAsset({
      id: assetId,
      code: 'ASSET-SERVICE-DOMAIN',
      name: 'Heat pump',
      propertyId: asPropertyId('d1000000-0000-4000-8000-000000000018'),
    });
    const plan = createServicePlan({
      id: asServicePlanId('d1000000-0000-4000-8000-000000000019'),
      assetId,
      name: 'Annual service',
      scheduleKind: 'recurring',
      firstDueOn: '2027-01-15',
      intervalMonths: 12,
      createdAt: '2026-09-19T08:00:00.000Z',
      createdByUserId: userId,
    });

    expect(isServicePlanOperationallyApplicable(plan, asset)).toBe(true);

    const replaced = markAssetReplaced(asset);
    expect(isServicePlanOperationallyApplicable(plan, replaced)).toBe(false);
    expect(() => assertServicePlanAssetEligible(replaced)).toThrowError(
      /retired or replaced/,
    );

    const retired = { ...asset, status: 'retired' as const };
    expect(isServicePlanOperationallyApplicable(plan, retired)).toBe(false);
    expect(() => assertServicePlanAssetEligible(retired)).toThrowError(
      /retired or replaced/,
    );
  });

  it('records immutable service occurrence time separately from record time', () => {
    const plan = createServicePlan({
      id: asServicePlanId('d1000000-0000-4000-8000-000000000010'),
      assetId,
      name: 'Annual service',
      scheduleKind: 'recurring',
      firstDueOn: '2026-06-01',
      intervalMonths: 12,
      createdAt: '2026-09-19T08:00:00.000Z',
      createdByUserId: userId,
    });

    const event = createServiceEvent({
      id: asServiceEventId('d1000000-0000-4000-8000-000000000011'),
      assetId,
      servicePlan: plan,
      eventType: 'routine_service',
      performedAt: '2026-06-01T09:00:00.000Z',
      providerPartyId: providerId,
      description: 'Annual service completed',
      parts: [
        {
          id: asServicePartId('d1000000-0000-4000-8000-000000000012'),
          name: 'Filter',
          partNumber: 'FLT-1',
          quantity: 1,
        },
      ],
      recordedAt: '2026-09-19T08:00:00.000Z',
      recordedByUserId: userId,
    });

    expect(event).toMatchObject({
      assetId,
      servicePlanId: plan.id,
      performedAt: '2026-06-01T09:00:00.000Z',
      recordedAt: '2026-09-19T08:00:00.000Z',
    });
    expect(event.parts).toHaveLength(1);

    expect(() =>
      createServiceEvent({
        id: asServiceEventId('d1000000-0000-4000-8000-000000000013'),
        assetId,
        eventType: 'repair',
        performedAt: '2026-09-20T09:00:00.000Z',
        description: 'Future repair',
        recordedAt: '2026-09-19T08:00:00.000Z',
        recordedByUserId: userId,
      }),
    ).toThrowError(/cannot be after recordedAt/);
  });

  it('rejects plan or warranty-claim links from a different Asset', () => {
    const otherAssetId = asAssetId(
      'd1000000-0000-4000-8000-000000000014',
    );
    const otherPlan = createServicePlan({
      id: asServicePlanId('d1000000-0000-4000-8000-000000000015'),
      assetId: otherAssetId,
      name: 'Other plan',
      scheduleKind: 'one_time',
      firstDueOn: '2026-10-01',
      createdAt: '2026-09-19T08:00:00.000Z',
      createdByUserId: userId,
    });

    expect(() =>
      createServiceEvent({
        id: asServiceEventId('d1000000-0000-4000-8000-000000000016'),
        assetId,
        servicePlan: otherPlan,
        eventType: 'repair',
        performedAt: '2026-09-18T09:00:00.000Z',
        description: 'Wrong plan',
        recordedAt: '2026-09-19T08:00:00.000Z',
        recordedByUserId: userId,
      }),
    ).toThrowError(/serviced Asset/);
  });
});
