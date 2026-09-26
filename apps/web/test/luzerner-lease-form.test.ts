import { describe, expect, it } from 'vitest';
import {
  LUZERNER_ANCILLARY_COST_KEYS,
} from '@portfolio/domain';
import {
  emptyLuzernerLeaseFormData,
  luzernerLeaseFormDataFromFormData,
} from '../src/dossier/luzerner-lease-form.js';

describe('Luzerner lease form UI draft', () => {
  it('starts with legal choices explicitly unresolved', () => {
    const draft = emptyLuzernerLeaseFormData();

    expect(draft.useType).toBeNull();
    expect(draft.durationMode).toBeNull();
    expect(draft.terminationDateMode).toBeNull();
    expect(draft.rentAdjustmentMode).toBeNull();
    expect(draft.settlementCutoffMode).toBeNull();
    expect(
      LUZERNER_ANCILLARY_COST_KEYS.every(
        (key) => draft.ancillaryCosts[key] === 'not_recorded',
      ),
    ).toBe(true);
  });

  it('serializes explicit Unit Dossier choices without inventing unchecked values', () => {
    const form = new FormData();
    form.set('occupantsCount', '2');
    form.set('familyDwelling', 'on');
    form.set('cellar', 'on');
    form.set('garage', 'on');
    form.set('garageNumber', 'G-12');
    form.set('useType', 'dwelling');
    form.set('handoverDate', '2026-10-01');
    form.set('durationMode', 'minimum');
    form.set('minimumFirstTerminationDate', '2027-09-30');
    form.set('terminationDateMode', 'quarterly_mar_jun_sep');
    form.set('ancillary_heating_hot_water', 'advance');
    form.set('ancillary_cold_water', 'flat');
    form.set('customAncillaryLabel1', 'Photovoltaik');
    form.set('customAncillaryTreatment1', 'flat');
    form.set('rentAdjustmentMode', 'standard');
    form.set('adjustmentNoticeMonths', '3');
    form.set('settlementCutoffMode', 'december_31');
    form.set('liabilityInsurance', 'yes');
    form.set('referenceInterestRate', '1.25');
    form.set('remarksAndAttachments', 'Übergabeprotokoll');
    form.set('specialProvisions', 'Keine Haustiere ohne Zustimmung.');
    form.set('contractPlace', 'Luzern');

    for (const key of LUZERNER_ANCILLARY_COST_KEYS) {
      if (!form.has(`ancillary_${key}`)) {
        form.set(`ancillary_${key}`, 'not_recorded');
      }
    }

    const result = luzernerLeaseFormDataFromFormData(form);

    expect(result).toMatchObject({
      occupantsCount: 2,
      familyDwelling: true,
      registeredPartnership: false,
      cellar: true,
      garage: true,
      garageNumber: 'G-12',
      parkingSpace: false,
      useType: 'dwelling',
      durationMode: 'minimum',
      minimumFirstTerminationDate: '2027-09-30',
      terminationDateMode: 'quarterly_mar_jun_sep',
      rentAdjustmentMode: 'standard',
      adjustmentNoticeMonths: 3,
      settlementCutoffMode: 'december_31',
      liabilityInsurance: 'yes',
      referenceInterestRate: '1.25',
      remarksAndAttachments: 'Übergabeprotokoll',
      contractPlace: 'Luzern',
    });
    expect(result.ancillaryCosts.heating_hot_water).toBe('advance');
    expect(result.ancillaryCosts.cold_water).toBe('flat');
    expect(result.customAncillaryCosts).toEqual([
      { label: 'Photovoltaik', treatment: 'flat' },
    ]);
  });
});
