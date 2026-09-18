import { describe, expect, it } from 'vitest';
import {
  leaseAgreementResponseSchema,
  leaseAmendmentResponseSchema,
  ownershipPeriodResponseSchema,
  partyResponseSchema,
  propertyResponseSchema,
  spaceResponseSchema,
  tenancyResponseSchema,
  tenancyTermVersionResponseSchema,
  unitResponseSchema,
} from '@portfolio/contracts';
import {
  asCurrencyCode,
  asLeaseAgreementId,
  asLeaseAgreementPartyId,
  asLeaseAmendmentId,
  asMoneyAmount,
  asOwnershipPeriodId,
  asPartyId,
  asPropertyId,
  asSpaceId,
  asTenancyId,
  asTenancyPartyId,
  asTenancyTermVersionId,
  asUnitId,
  type LeaseAgreement,
  type LeaseAmendment,
  type OwnershipPeriod,
  type Party,
  type Property,
  type Space,
  type Tenancy,
  type TenancyTermVersion,
  type Unit,
} from '@portfolio/domain';
import {
  toLeaseAgreementResponse,
  toLeaseAmendmentResponse,
  toOwnershipPeriodResponse,
  toPartyResponse,
  toPropertyResponse,
  toSpaceResponse,
  toTenancyResponse,
  toTenancyTermVersionResponse,
  toUnitResponse,
} from '../src/response-mappers.js';

describe('HTTP response mappers', () => {
  it('does not leak new domain fields into the public contract', () => {
    const property = {
      id: asPropertyId('10000000-0000-4000-8000-000000000001'),
      code: 'PROP-1',
      name: 'Property',
      propertyType: 'house',
      street: 'Street',
      houseNumber: '1',
      postalCode: '18000',
      city: 'Niš',
      countryCode: 'RS',
      yearBuilt: 2020,
      status: 'active',
      internalRevision: 'must-not-leak',
    } satisfies Property & { internalRevision: string };

    const response = toPropertyResponse(property);

    expect(response).not.toHaveProperty('internalRevision');
    expect(propertyResponseSchema.parse(response)).toEqual(response);
  });

  it('maps every currently exposed domain shape to its declared response schema', () => {
    const propertyId = asPropertyId('10000000-0000-4000-8000-000000000001');
    const unitId = asUnitId('10000000-0000-4000-8000-000000000002');
    const spaceId = asSpaceId('10000000-0000-4000-8000-000000000003');
    const partyId = asPartyId('10000000-0000-4000-8000-000000000004');
    const tenancyId = asTenancyId('10000000-0000-4000-8000-000000000005');
    const agreementId = asLeaseAgreementId('10000000-0000-4000-8000-000000000006');

    const unit: Unit = {
      id: unitId,
      propertyId,
      code: 'UNIT-1',
      unitNumber: '1',
      unitType: 'apartment',
      floor: '1',
      areaM2: 55.5,
      rooms: 2.5,
      status: 'active',
      notes: '',
    };

    const space: Space = {
      id: spaceId,
      unitId,
      code: 'ROOM-1',
      name: 'Living room',
      spaceType: 'living_room',
      areaM2: 20,
      sortOrder: 0,
      active: true,
    };

    const party: Party = {
      id: partyId,
      code: 'PTY-1',
      partyType: 'company',
      displayName: 'Example d.o.o.',
      legalName: 'Example d.o.o.',
      status: 'active',
      contactPoints: [],
      addresses: [],
    };

    const ownership: OwnershipPeriod = {
      id: asOwnershipPeriodId('10000000-0000-4000-8000-000000000007'),
      unitId,
      validFrom: '2026-01-01' as never,
      validTo: null,
      owners: [{ partyId, shareBasisPoints: 10_000 }],
    };

    const tenancy: Tenancy = {
      id: tenancyId,
      code: 'TEN-1',
      unitId,
      status: 'planned',
      plannedStart: '2026-10-01' as never,
      plannedEnd: '2027-09-30' as never,
      actualStart: null,
      actualEnd: null,
      noticeGivenAt: null,
      terminationEffectiveAt: null,
      version: 2,
      parties: [{
        id: asTenancyPartyId('10000000-0000-4000-8000-000000000008'),
        tenancyId,
        partyId,
        role: 'tenant',
        isPrimary: true,
      }],
    };

    const agreement: LeaseAgreement = {
      id: agreementId,
      tenancyId,
      code: 'AGR-1',
      agreementType: 'initial',
      predecessorAgreementId: null,
      effectiveFrom: '2026-10-01' as never,
      effectiveTo: '2027-09-30' as never,
      status: 'signed',
      signedAt: '2026-09-20' as never,
      version: 2,
      parties: [{
        id: asLeaseAgreementPartyId('10000000-0000-4000-8000-000000000009'),
        agreementId,
        partyId,
        role: 'tenant',
      }],
    };

    const amendment: LeaseAmendment = {
      id: asLeaseAmendmentId('10000000-0000-4000-8000-000000000010'),
      agreementId,
      code: 'AMD-1',
      title: 'Rent change',
      description: null,
      effectiveFrom: '2027-04-01' as never,
      status: 'signed',
      signedAt: '2027-03-15' as never,
      version: 2,
    };

    const terms: TenancyTermVersion = {
      id: asTenancyTermVersionId('10000000-0000-4000-8000-000000000011'),
      tenancyId,
      sourceType: 'agreement',
      sourceAgreementId: agreementId,
      sourceAmendmentId: null,
      effectiveFrom: '2026-10-01' as never,
      currency: asCurrencyCode('EUR'),
      baseRent: asMoneyAmount('850'),
      serviceCharge: asMoneyAmount('120'),
      utilitiesAdvance: asMoneyAmount('0'),
      parkingRent: asMoneyAmount('0'),
      otherRecurringCharge: asMoneyAmount('0'),
      depositRequired: asMoneyAmount('1700'),
      billingFrequency: 'monthly',
      noticePeriodTenantDays: 90,
      noticePeriodLandlordDays: 90,
    };

    expect(unitResponseSchema.parse(toUnitResponse(unit))).toEqual(toUnitResponse(unit));
    expect(spaceResponseSchema.parse(toSpaceResponse(space))).toEqual(toSpaceResponse(space));
    expect(partyResponseSchema.parse(toPartyResponse(party))).toEqual(toPartyResponse(party));
    expect(
      ownershipPeriodResponseSchema.parse(toOwnershipPeriodResponse(ownership)),
    ).toEqual(toOwnershipPeriodResponse(ownership));
    expect(tenancyResponseSchema.parse(toTenancyResponse(tenancy))).toEqual(
      toTenancyResponse(tenancy),
    );
    expect(
      leaseAgreementResponseSchema.parse(toLeaseAgreementResponse(agreement)),
    ).toEqual(toLeaseAgreementResponse(agreement));
    expect(
      leaseAmendmentResponseSchema.parse(toLeaseAmendmentResponse(amendment)),
    ).toEqual(toLeaseAmendmentResponse(amendment));
    expect(
      tenancyTermVersionResponseSchema.parse(toTenancyTermVersionResponse(terms)),
    ).toEqual(toTenancyTermVersionResponse(terms));
  });
});
