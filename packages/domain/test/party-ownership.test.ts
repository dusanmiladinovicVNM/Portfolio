import { describe, expect, it } from 'vitest';
import {
  asContactPointId,
  asOwnershipPeriodId,
  asPartyAddressId,
  asPartyId,
  asUnitId,
  createOwnershipPeriod,
  createParty,
} from '../src/index.js';

describe('Party domain', () => {
  it('creates a person party with provider-neutral contact and address data', () => {
    const partyId = asPartyId('11111111-1111-4111-8111-111111111111');

    const party = createParty({
      id: partyId,
      code: 'PTY-0001',
      partyType: 'person',
      firstName: 'Ana',
      lastName: 'Jovanović',
      contactPoints: [
        {
          id: asContactPointId('22222222-2222-4222-8222-222222222222'),
          contactType: 'email',
          value: 'ana@example.test',
          isPrimary: true,
        },
      ],
      addresses: [
        {
          id: asPartyAddressId('33333333-3333-4333-8333-333333333333'),
          addressType: 'residential',
          line1: 'Example 1',
          postalCode: '18000',
          city: 'Niš',
          countryCode: 'rs',
          isPrimary: true,
        },
      ],
    });

    expect(party.displayName).toBe('Ana Jovanović');
    expect(party.contactPoints[0]?.partyId).toBe(partyId);
    expect(party.addresses[0]?.countryCode).toBe('RS');
  });

  it('rejects two primary email addresses for the same party', () => {
    expect(() =>
      createParty({
        id: asPartyId('11111111-1111-4111-8111-111111111111'),
        code: 'PTY-0001',
        partyType: 'company',
        legalName: 'Example d.o.o.',
        contactPoints: [
          {
            id: asContactPointId('22222222-2222-4222-8222-222222222222'),
            contactType: 'email',
            value: 'one@example.test',
            isPrimary: true,
          },
          {
            id: asContactPointId('33333333-3333-4333-8333-333333333333'),
            contactType: 'email',
            value: 'two@example.test',
            isPrimary: true,
          },
        ],
      }),
    ).toThrowError(/Only one primary email/);
  });
});

describe('OwnershipPeriod domain', () => {
  it('models one complete ownership composition for a time interval', () => {
    const period = createOwnershipPeriod({
      id: asOwnershipPeriodId('44444444-4444-4444-8444-444444444444'),
      unitId: asUnitId('55555555-5555-4555-8555-555555555555'),
      validFrom: '2026-01-01',
      validTo: null,
      owners: [
        {
          partyId: asPartyId('66666666-6666-4666-8666-666666666666'),
          shareBasisPoints: 5000,
        },
        {
          partyId: asPartyId('77777777-7777-4777-8777-777777777777'),
          shareBasisPoints: 5000,
        },
      ],
    });

    expect(period.owners).toHaveLength(2);
  });

  it('rejects incomplete ownership shares', () => {
    expect(() =>
      createOwnershipPeriod({
        id: asOwnershipPeriodId('44444444-4444-4444-8444-444444444444'),
        unitId: asUnitId('55555555-5555-4555-8555-555555555555'),
        validFrom: '2026-01-01',
        owners: [
          {
            partyId: asPartyId('66666666-6666-4666-8666-666666666666'),
            shareBasisPoints: 6000,
          },
        ],
      }),
    ).toThrowError(/exactly 100%/);
  });

  it('rejects invalid calendar dates', () => {
    expect(() =>
      createOwnershipPeriod({
        id: asOwnershipPeriodId('44444444-4444-4444-8444-444444444444'),
        unitId: asUnitId('55555555-5555-4555-8555-555555555555'),
        validFrom: '2026-02-31',
        owners: [
          {
            partyId: asPartyId('66666666-6666-4666-8666-666666666666'),
            shareBasisPoints: 10000,
          },
        ],
      }),
    ).toThrowError(/valid calendar date/);
  });
});
