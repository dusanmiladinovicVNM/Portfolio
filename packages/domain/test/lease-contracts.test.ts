import { describe, expect, it } from 'vitest';
import {
  asLeaseAgreementId,
  asLeaseAgreementPartyId,
  asLeaseAmendmentId,
  asPartyId,
  asTenancyId,
  asTenancyTermVersionId,
  createLeaseAgreement,
  createLeaseAmendment,
  createTenancyTermVersion,
  signLeaseAgreement,
  signLeaseAmendment,
  supersedeLeaseAgreement,
} from '../src/index.js';

const tenancyId = asTenancyId('10000000-0000-4000-8000-000000000001');
const agreementId = asLeaseAgreementId('10000000-0000-4000-8000-000000000002');

function draftAgreement() {
  return createLeaseAgreement({
    id: agreementId,
    tenancyId,
    code: 'AGR-0001',
    agreementType: 'initial',
    effectiveFrom: '2026-10-01',
    effectiveTo: '2027-09-30',
    parties: [
      {
        id: asLeaseAgreementPartyId('10000000-0000-4000-8000-000000000003'),
        partyId: asPartyId('10000000-0000-4000-8000-000000000004'),
        role: 'landlord',
      },
      {
        id: asLeaseAgreementPartyId('10000000-0000-4000-8000-000000000005'),
        partyId: asPartyId('10000000-0000-4000-8000-000000000006'),
        role: 'tenant',
      },
    ],
  });
}

describe('LeaseAgreement', () => {
  it('signs only a complete landlord/tenant agreement', () => {
    const signed = signLeaseAgreement(draftAgreement(), '2026-09-20');
    expect(signed.status).toBe('signed');
    expect(signed.version).toBe(2);
  });

  it('requires a predecessor for renewal/replacement and forbids one on initial', () => {
    expect(() =>
      createLeaseAgreement({
        id: asLeaseAgreementId('10000000-0000-4000-8000-000000000010'),
        tenancyId,
        code: 'AGR-REPLACEMENT',
        agreementType: 'replacement',
        effectiveFrom: '2027-04-01',
        parties: draftAgreement().parties.map((party) => ({
          id: party.id,
          partyId: party.partyId,
          role: party.role,
        })),
      }),
    ).toThrowError(/requires a predecessor/);

    expect(() =>
      createLeaseAgreement({
        id: asLeaseAgreementId('10000000-0000-4000-8000-000000000011'),
        tenancyId,
        code: 'AGR-INITIAL-WITH-PREDECESSOR',
        agreementType: 'initial',
        predecessorAgreementId: agreementId,
        effectiveFrom: '2027-04-01',
        parties: draftAgreement().parties.map((party) => ({
          id: party.id,
          partyId: party.partyId,
          role: party.role,
        })),
      }),
    ).toThrowError(/cannot have a predecessor/);
  });

  it('supersedes only a signed predecessor without rewriting legal content', () => {
    const signed = signLeaseAgreement(draftAgreement(), '2026-09-20');
    const superseded = supersedeLeaseAgreement(signed);

    expect(superseded.status).toBe('superseded');
    expect(superseded.version).toBe(3);
    expect(superseded.effectiveTo).toBe('2027-09-30');
    expect(superseded.signedAt).toBe('2026-09-20');
  });

  it('rejects signing without required legal parties', () => {
    const draft = createLeaseAgreement({
      id: agreementId,
      tenancyId,
      code: 'AGR-0001',
      agreementType: 'initial',
      effectiveFrom: '2026-10-01',
      parties: [
        {
          id: asLeaseAgreementPartyId('10000000-0000-4000-8000-000000000003'),
          partyId: asPartyId('10000000-0000-4000-8000-000000000004'),
          role: 'tenant',
        },
      ],
    });

    expect(() => signLeaseAgreement(draft, '2026-09-20'))
      .toThrowError(/requires at least one landlord/);
  });
});

describe('Lease terms', () => {
  it('normalizes money as exact decimal strings rather than JS numbers', () => {
    const terms = createTenancyTermVersion({
      id: asTenancyTermVersionId('20000000-0000-4000-8000-000000000001'),
      tenancyId,
      sourceType: 'agreement',
      sourceAgreementId: agreementId,
      effectiveFrom: '2026-10-01',
      currency: 'eur',
      baseRent: '850.5',
      serviceCharge: '120',
      depositRequired: '1700',
      noticePeriodTenantDays: 90,
      noticePeriodLandlordDays: 90,
    });

    expect(terms.currency).toBe('EUR');
    expect(terms.baseRent).toBe('850.50');
    expect(terms.serviceCharge).toBe('120.00');
    expect(terms.depositRequired).toBe('1700.00');
  });

  it('creates full replacement terms from a signed amendment source', () => {
    const amendment = signLeaseAmendment(
      createLeaseAmendment({
        id: asLeaseAmendmentId('30000000-0000-4000-8000-000000000001'),
        agreementId,
        code: 'AMD-0001',
        title: 'Rent adjustment',
        effectiveFrom: '2027-04-01',
      }),
      '2027-03-15',
    );

    const terms = createTenancyTermVersion({
      id: asTenancyTermVersionId('30000000-0000-4000-8000-000000000002'),
      tenancyId,
      sourceType: 'amendment',
      sourceAmendmentId: amendment.id,
      effectiveFrom: amendment.effectiveFrom,
      currency: 'EUR',
      baseRent: '900.00',
      serviceCharge: '120.00',
      depositRequired: '1700.00',
    });

    expect(terms.sourceType).toBe('amendment');
    expect(terms.effectiveFrom).toBe('2027-04-01');
  });
});
