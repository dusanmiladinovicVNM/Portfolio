import { describe, expect, it } from 'vitest';
import type {
  ServiceEventResponse,
  ServicePlanResponse,
  WarrantyClaimResponse,
  WarrantyResponse,
} from '@portfolio/contracts';
import {
  assertAssetServiceEventsOwner,
  assertAssetServicePlansOwner,
  assertAssetWarrantiesOwner,
  assertCreatedServicePlan,
  assertCreatedStandaloneServiceEvent,
  assertCreatedWarranty,
  assertCreatedWarrantyClaim,
  assertServicePlanTransition,
  assertWarrantyClaimsOwner,
  assertWarrantyClaimTransition,
} from '../src/dossier/asset-service-owner.js';

const assetId = 'c1000000-0000-4000-8000-000000000001';
const warrantyId = 'c1000000-0000-4000-8000-000000000002';
const claimId = 'c1000000-0000-4000-8000-000000000003';
const planId = 'c1000000-0000-4000-8000-000000000004';
const userId = 'c1000000-0000-4000-8000-000000000005';

const warranty: WarrantyResponse = {
  id: warrantyId,
  assetId,
  warrantyType: 'manufacturer',
  providerPartyId: null,
  reference: 'W-1',
  validFrom: '2026-01-01',
  validTo: '2028-01-01',
  terms: 'Parts and labour',
  recordedAt: '2026-09-22T10:00:00.000Z',
  recordedByUserId: userId,
};

const draftClaim: WarrantyClaimResponse = {
  id: claimId,
  warrantyId,
  incidentOn: '2026-09-20',
  description: 'Compressor fault',
  status: 'draft',
  providerReference: null,
  submittedAt: null,
  resolvedAt: null,
  closedAt: null,
  cancelledAt: null,
  recordedAt: '2026-09-22T10:05:00.000Z',
  recordedByUserId: userId,
  version: 1,
};

const activePlan: ServicePlanResponse = {
  id: planId,
  assetId,
  name: 'Annual HVAC service',
  scheduleKind: 'recurring',
  firstDueOn: '2027-01-15',
  intervalMonths: 12,
  providerPartyId: null,
  notes: null,
  status: 'active',
  version: 1,
  createdAt: '2026-09-22T10:10:00.000Z',
  createdByUserId: userId,
};

const serviceEvent: ServiceEventResponse = {
  id: 'c1000000-0000-4000-8000-000000000006',
  assetId,
  servicePlanId: planId,
  warrantyClaimId: claimId,
  eventType: 'repair',
  performedAt: '2026-09-22T09:00:00.000Z',
  providerPartyId: null,
  description: 'Replaced compressor relay',
  reference: 'SRV-1',
  parts: [],
  recordedAt: '2026-09-22T10:20:00.000Z',
  recordedByUserId: userId,
};

describe('Asset service ownership guards', () => {
  it('fails closed when read lists cross their business owner', () => {
    expect(() => assertAssetWarrantiesOwner(assetId, [warranty])).not.toThrow();
    expect(() =>
      assertAssetWarrantiesOwner(assetId, [
        { ...warranty, assetId: 'c2000000-0000-4000-8000-000000000001' },
      ]),
    ).toThrow(/another Asset/);

    expect(() =>
      assertWarrantyClaimsOwner(warrantyId, [draftClaim]),
    ).not.toThrow();
    expect(() =>
      assertWarrantyClaimsOwner(warrantyId, [
        {
          ...draftClaim,
          warrantyId: 'c2000000-0000-4000-8000-000000000002',
        },
      ]),
    ).toThrow(/another Warranty/);

    expect(() =>
      assertAssetServicePlansOwner(assetId, [activePlan]),
    ).not.toThrow();
    expect(() =>
      assertAssetServiceEventsOwner(assetId, [serviceEvent]),
    ).not.toThrow();
  });

  it('validates newly created coverage, claim, policy and occurrence grain', () => {
    expect(() =>
      assertCreatedWarranty(
        assetId,
        {
          warrantyType: 'manufacturer',
          providerPartyId: null,
          reference: 'W-1',
          validFrom: '2026-01-01',
          validTo: '2028-01-01',
          terms: 'Parts and labour',
        },
        warranty,
      ),
    ).not.toThrow();

    expect(() =>
      assertCreatedWarrantyClaim(
        warrantyId,
        {
          incidentOn: '2026-09-20',
          description: 'Compressor fault',
        },
        draftClaim,
      ),
    ).not.toThrow();

    expect(() =>
      assertCreatedServicePlan(
        assetId,
        {
          name: 'Annual HVAC service',
          scheduleKind: 'recurring',
          firstDueOn: '2027-01-15',
          intervalMonths: 12,
          providerPartyId: null,
          notes: null,
        },
        activePlan,
      ),
    ).not.toThrow();

    expect(() =>
      assertCreatedStandaloneServiceEvent(
        assetId,
        {
          servicePlanId: planId,
          warrantyClaimId: claimId,
          eventType: 'repair',
          performedAt: '2026-09-22T09:00:00.000Z',
          providerPartyId: null,
          description: 'Replaced compressor relay',
          reference: 'SRV-1',
        },
        serviceEvent,
      ),
    ).not.toThrow();
  });

  it('requires exact claim CAS transition semantics', () => {
    const submitted: WarrantyClaimResponse = {
      ...draftClaim,
      status: 'submitted',
      providerReference: 'CLAIM-77',
      submittedAt: '2026-09-22T10:30:00.000Z',
      version: 2,
    };
    expect(() =>
      assertWarrantyClaimTransition(draftClaim, submitted, {
        status: 'submitted',
        providerReference: 'CLAIM-77',
      }),
    ).not.toThrow();

    expect(() =>
      assertWarrantyClaimTransition(draftClaim, {
        ...submitted,
        version: 3,
      }, {
        status: 'submitted',
        providerReference: 'CLAIM-77',
      }),
    ).toThrow(/lifecycle transition/);

    const approved: WarrantyClaimResponse = {
      ...submitted,
      status: 'approved',
      resolvedAt: '2026-09-22T10:40:00.000Z',
      version: 3,
    };
    expect(() =>
      assertWarrantyClaimTransition(submitted, approved, {
        status: 'approved',
      }),
    ).not.toThrow();

    expect(() =>
      assertWarrantyClaimTransition(
        submitted,
        {
          ...approved,
          submittedAt: '2026-09-22T10:31:00.000Z',
        },
        { status: 'approved' },
      ),
    ).toThrow(/lifecycle history/);

    const closed: WarrantyClaimResponse = {
      ...approved,
      status: 'closed',
      closedAt: '2026-09-22T10:50:00.000Z',
      version: 4,
    };
    expect(() =>
      assertWarrantyClaimTransition(approved, closed, {
        status: 'closed',
      }),
    ).not.toThrow();

    expect(() =>
      assertWarrantyClaimTransition(
        approved,
        {
          ...closed,
          resolvedAt: '2026-09-22T10:41:00.000Z',
        },
        { status: 'closed' },
      ),
    ).toThrow(/lifecycle history/);
  });

  it('requires exact ServicePlan CAS transition semantics', () => {
    const paused: ServicePlanResponse = {
      ...activePlan,
      status: 'paused',
      version: 2,
    };
    expect(() =>
      assertServicePlanTransition(activePlan, paused, 'paused'),
    ).not.toThrow();

    expect(() =>
      assertServicePlanTransition(activePlan, {
        ...paused,
        name: 'Changed',
      }, 'paused'),
    ).toThrow(/lifecycle transition/);
  });
});
