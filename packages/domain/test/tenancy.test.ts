import { describe, expect, it } from 'vitest';
import {
  activateTenancy,
  addTenancyParty,
  asPartyId,
  asTenancyId,
  asTenancyPartyId,
  asUnitId,
  cancelTenancy,
  createTenancy,
  endTenancy,
  giveTenancyNotice,
  markTenancyMoveOutPending,
  planTenancy,
} from '../src/index.js';

const tenancyId = asTenancyId('11111111-1111-4111-8111-111111111111');
const unitId = asUnitId('22222222-2222-4222-8222-222222222222');
const partyId = asPartyId('33333333-3333-4333-8333-333333333333');

function draftWithTenant() {
  return createTenancy({
    id: tenancyId,
    code: 'TEN-0001',
    unitId,
    parties: [
      {
        id: asTenancyPartyId('44444444-4444-4444-8444-444444444444'),
        partyId,
        role: 'tenant',
        isPrimary: true,
      },
    ],
  });
}

describe('Tenancy lifecycle', () => {
  it('moves through planned → active → notice → move-out → ended', () => {
    const planned = planTenancy(draftWithTenant(), '2026-10-01', '2027-09-30');
    const active = activateTenancy(planned, '2026-10-01');
    const notice = giveTenancyNotice(active, '2027-08-31', '2027-09-30');
    const pending = markTenancyMoveOutPending(notice);
    const ended = endTenancy(pending, '2027-09-30');

    expect(ended.status).toBe('ended');
    expect(ended.version).toBe(6);
    expect(ended.actualEnd).toBe('2027-09-30');
  });

  it('requires at least one tenant/co-tenant before activation', () => {
    const draft = createTenancy({
      id: tenancyId,
      code: 'TEN-0001',
      unitId,
      parties: [
        {
          id: asTenancyPartyId('44444444-4444-4444-8444-444444444444'),
          partyId,
          role: 'guarantor',
        },
      ],
    });

    const planned = planTenancy(draft, '2026-10-01');

    expect(() => activateTenancy(planned, '2026-10-01'))
      .toThrowError(/at least one tenant or co-tenant/);
  });

  it('forbids invalid lifecycle jumps', () => {
    expect(() => activateTenancy(draftWithTenant(), '2026-10-01'))
      .toThrowError(/Cannot transition/);
  });

  it('allows a party to be added while the tenancy is draft or planned', () => {
    const draft = createTenancy({
      id: tenancyId,
      code: 'TEN-0001',
      unitId,
    });

    const withTenant = addTenancyParty(draft, {
      id: asTenancyPartyId('44444444-4444-4444-8444-444444444444'),
      partyId,
      role: 'tenant',
      isPrimary: true,
    });

    expect(withTenant.parties).toHaveLength(1);
    expect(withTenant.version).toBe(2);
  });

  it('freezes party composition once actual occupancy starts', () => {
    const active = activateTenancy(
      planTenancy(draftWithTenant(), '2026-10-01'),
      '2026-10-01',
    );

    expect(() =>
      addTenancyParty(active, {
        id: asTenancyPartyId('55555555-5555-4555-8555-555555555555'),
        partyId: asPartyId('66666666-6666-4666-8666-666666666666'),
        role: 'co_tenant',
      }),
    ).toThrowError(/draft or planned/);
  });

  it('requires terminationEffectiveAt to be on or after noticeGivenAt', () => {
    const active = activateTenancy(
      planTenancy(draftWithTenant(), '2026-10-01'),
      '2026-10-01',
    );

    expect(() =>
      giveTenancyNotice(active, '2027-09-01', '2027-08-31'),
    ).toThrowError(/cannot be earlier than noticeGivenAt/);
  });

  it('forbids more than one primary occupant', () => {
    expect(() =>
      createTenancy({
        id: tenancyId,
        code: 'TEN-0001',
        unitId,
        parties: [
          {
            id: asTenancyPartyId('44444444-4444-4444-8444-444444444444'),
            partyId,
            role: 'tenant',
            isPrimary: true,
          },
          {
            id: asTenancyPartyId('55555555-5555-4555-8555-555555555555'),
            partyId: asPartyId('66666666-6666-4666-8666-666666666666'),
            role: 'co_tenant',
            isPrimary: true,
          },
        ],
      }),
    ).toThrowError(/Only one primary/);
  });

  it('keeps ended and cancelled tenancies terminal', () => {
    const cancelled = cancelTenancy(draftWithTenant());
    expect(() =>
      addTenancyParty(cancelled, {
        id: asTenancyPartyId('55555555-5555-4555-8555-555555555555'),
        partyId: asPartyId('66666666-6666-4666-8666-666666666666'),
        role: 'co_tenant',
      }),
    ).toThrowError(/cannot be added/);

    const ended = endTenancy(
      activateTenancy(planTenancy(draftWithTenant(), '2026-10-01'), '2026-10-01'),
      '2027-09-30',
    );
    expect(() => cancelTenancy(ended)).toThrowError(/Cannot transition/);
  });
});
