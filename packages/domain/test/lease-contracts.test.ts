import { describe, expect, it } from 'vitest';
import {
  asDateOnly,
  asLeaseAgreementId,
  asLeaseAgreementPartyId,
  asLeaseAmendmentId,
  asPartyId,
  asTenancyId,
  asTenancyTermVersionId,
  createLeaseAgreement,
  createLeaseAmendment,
  createLuzernerLeaseFormDraft,
  createTenancyTermVersion,
  emptyLuzernerLeaseFormContent,
  inspectLuzernerLeaseFormReadiness,
  reviseLuzernerLeaseFormDraft,
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

describe('Luzerner lease form', () => {
  it('normalizes template-specific money, dates and optional strings', () => {
    const base = emptyLuzernerLeaseFormContent();
    const form = createLuzernerLeaseFormDraft(agreementId, {
      ...base,
      ewid: ' 12345 ',
      moveInDate: asDateOnly('2026-10-01'),
      netRent: '1850.5' as never,
      garageParkingRent: '0' as never,
      placeOfSigning: ' Luzern ',
      signingDate: asDateOnly('2026-09-26'),
    });

    expect(form.revision).toBe(1);
    expect(form.templateCode).toBe('lu-2020');
    expect(form.content.ewid).toBe('12345');
    expect(form.content.netRent).toBe('1850.50');
    expect(form.content.garageParkingRent).toBe('0.00');
    expect(form.content.placeOfSigning).toBe('Luzern');
  });

  it('keeps revision CAS identity outside mutable form content', () => {
    const first = createLuzernerLeaseFormDraft(
      agreementId,
      emptyLuzernerLeaseFormContent(),
    );
    const second = reviseLuzernerLeaseFormDraft(first, {
      ...first.content,
      specialProvisions: 'Keine Untervermietung ohne Zustimmung.',
    });

    expect(second.agreementId).toBe(first.agreementId);
    expect(second.templateCode).toBe(first.templateCode);
    expect(second.revision).toBe(2);
    expect(second.content.specialProvisions).toBe(
      'Keine Untervermietung ohne Zustimmung.',
    );
  });

  it('validates conditional fields that the printed LU form requires', () => {
    const base = emptyLuzernerLeaseFormContent();

    expect(() =>
      createLuzernerLeaseFormDraft(agreementId, {
        ...base,
        durationKind: 'minimum_term',
        minimumCancelableOn: null,
      }),
    ).toThrowError(/minimumCancelableOn is required/i);

    expect(() =>
      createLuzernerLeaseFormDraft(agreementId, {
        ...base,
        noticePeriodKind: 'longer_months',
        longerNoticeMonths: null,
      }),
    ).toThrowError(/longerNoticeMonths is required/i);

    expect(() =>
      createLuzernerLeaseFormDraft(agreementId, {
        ...base,
        useType: 'other',
        useTypeOther: null,
      }),
    ).toThrowError(/useTypeOther is required/i);
  });

  it('limits custom rows to the physical capacity of the LU 2020 form', () => {
    const base = emptyLuzernerLeaseFormContent();

    expect(() =>
      createLuzernerLeaseFormDraft(agreementId, {
        ...base,
        customSharedUse: ['A', 'B', 'C'],
      }),
    ).toThrowError(/at most two custom shared-use/i);

    expect(() =>
      createLuzernerLeaseFormDraft(agreementId, {
        ...base,
        customAncillaryCosts: [
          { label: 'A', mode: 'advance' },
          { label: 'B', mode: 'flat' },
          { label: 'C', mode: 'excluded' },
        ],
      }),
    ).toThrowError(/at most two custom ancillary-cost/i);
  });

  it('exposes generation readiness separately from draft save validity', () => {
    const base = emptyLuzernerLeaseFormContent();
    const incomplete = inspectLuzernerLeaseFormReadiness(base);
    expect(incomplete.ready).toBe(false);
    expect(incomplete.missing).toEqual(
      expect.arrayContaining([
        'netRent',
        'moveInDate',
        'placeOfSigning',
        'signingDate',
      ]),
    );

    const complete = inspectLuzernerLeaseFormReadiness({
      ...base,
      moveInDate: '2026-10-01' as never,
      netRent: '1850.00' as never,
      placeOfSigning: 'Luzern',
      signingDate: '2026-09-26' as never,
    });
    expect(complete).toEqual({ ready: true, missing: [] });
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
