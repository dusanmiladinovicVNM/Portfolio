import { describe, expect, it } from 'vitest';
import {
  LUZERNER_ANCILLARY_COST_KEYS,
  asLeaseAgreementId,
  createLuzernerLeaseFormProfile,
  updateLuzernerLeaseFormProfile,
  type LuzernerLeaseFormDataInput,
} from '../src/index.js';

const agreementId = asLeaseAgreementId(
  '71000000-0000-4000-8000-000000000001',
);

function draftData(): LuzernerLeaseFormDataInput {
  return {
    occupantsCount: null,
    familyDwelling: false,
    registeredPartnership: false,
    furnished: false,
    separateRoom: false,
    cellar: false,
    attic: false,
    separateApartment: false,
    garage: false,
    garageNumber: null,
    parkingSpace: false,
    parkingSpaceNumber: null,
    additionalObjects: [],
    sharedLaundryRoom: false,
    sharedDryingRoom: false,
    sharedClothesLine: false,
    sharedStrollerStorage: false,
    sharedGarden: false,
    sharedHobbyRoom: false,
    sharedPlayground: false,
    sharedBicycleMopedStorage: false,
    sharedUseExtras: [],
    useType: null,
    customUse: null,
    handoverDate: null,
    durationMode: null,
    minimumFirstTerminationDate: null,
    terminationDateMode: null,
    ancillaryCosts: Object.fromEntries(
      LUZERNER_ANCILLARY_COST_KEYS.map((key) => [
        key,
        'not_recorded',
      ]),
    ) as LuzernerLeaseFormDataInput['ancillaryCosts'],
    customAncillaryCosts: [],
    rentAdjustmentMode: null,
    adjustmentNoticeMonths: null,
    indexPointsAtContract: null,
    settlementCutoffMode: null,
    customSettlementCutoffDate: null,
    depositAccountOnTenantName: false,
    liabilityInsurance: 'not_recorded',
    referenceInterestRate: null,
    costIncreaseBalancedUntil: null,
    consumerPriceIndex: null,
    consumerPriceIndexMonthYear: null,
    consumerPriceIndexBasis: null,
    incompleteAdjustmentReserveAmount: null,
    incompleteAdjustmentReservePercent: null,
    remarksAndAttachments: '',
    initialRentFormAttached: false,
    specialProvisions: '',
    contractPlace: null,
  };
}

describe('Luzerner lease form profile', () => {
  it('allows an explicitly incomplete draft without inventing legal choices', () => {
    const profile = createLuzernerLeaseFormProfile({
      agreementId,
      data: draftData(),
    });

    expect(profile.revision).toBe(1);
    expect(profile.data.useType).toBeNull();
    expect(profile.data.durationMode).toBeNull();
    expect(profile.data.terminationDateMode).toBeNull();
    expect(profile.data.rentAdjustmentMode).toBeNull();
    expect(
      Object.values(profile.data.ancillaryCosts).every(
        (value) => value === 'not_recorded',
      ),
    ).toBe(true);
  });

  it('normalizes exact form data and advances revision on update', () => {
    const current = createLuzernerLeaseFormProfile({
      agreementId,
      data: draftData(),
    });
    const updated = updateLuzernerLeaseFormProfile(current, {
      data: {
        ...draftData(),
        occupantsCount: 2,
        cellar: true,
        useType: 'dwelling',
        handoverDate: '2026-10-01',
        durationMode: 'minimum',
        minimumFirstTerminationDate: '2027-09-30',
        terminationDateMode: 'quarterly_mar_jun_sep',
        referenceInterestRate: '1.25',
        remarksAndAttachments: '  Übergabeprotokoll folgt.  ',
        specialProvisions: '  Keine zusätzlichen Vereinbarungen.  ',
        contractPlace: ' Luzern ',
      },
    });

    expect(updated.revision).toBe(2);
    expect(updated.data.handoverDate).toBe('2026-10-01');
    expect(updated.data.referenceInterestRate).toBe('1.25');
    expect(updated.data.remarksAndAttachments).toBe(
      'Übergabeprotokoll folgt.',
    );
    expect(updated.data.contractPlace).toBe('Luzern');
  });

  it('rejects dependent values without their legal selector', () => {
    expect(() =>
      createLuzernerLeaseFormProfile({
        agreementId,
        data: {
          ...draftData(),
          garage: false,
          garageNumber: '12',
        },
      }),
    ).toThrowError(/garageNumber requires garage=true/);

    expect(() =>
      createLuzernerLeaseFormProfile({
        agreementId,
        data: {
          ...draftData(),
          durationMode: 'minimum',
          minimumFirstTerminationDate: null,
        },
      }),
    ).toThrowError(/minimumFirstTerminationDate is required/);

    expect(() =>
      createLuzernerLeaseFormProfile({
        agreementId,
        data: {
          ...draftData(),
          settlementCutoffMode: 'custom',
          customSettlementCutoffDate: null,
        },
      }),
    ).toThrowError(/customSettlementCutoffDate is required/);
  });

  it('rejects non-canonical decimals and invalid form dates', () => {
    expect(() =>
      createLuzernerLeaseFormProfile({
        agreementId,
        data: {
          ...draftData(),
          referenceInterestRate: ' 1.25 ',
        },
      }),
    ).toThrowError(/canonical decimal/);

    expect(() =>
      createLuzernerLeaseFormProfile({
        agreementId,
        data: {
          ...draftData(),
          handoverDate: '2026-02-30',
        },
      }),
    ).toThrowError(/valid YYYY-MM-DD date/);
  });
});
