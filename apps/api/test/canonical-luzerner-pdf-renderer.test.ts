import { describe, expect, it } from 'vitest';
import type { LuzernerLeasePdfRenderInput } from '@portfolio/application';
import { CanonicalLuzernerPdfRenderer } from '../src/canonical-luzerner-pdf-renderer.js';

const BLOCK_BYTES = 32768;

function template(): Uint8Array {
  const blocks = Array.from({ length: 8 }, (_, index) => {
    const marker =
      '%%PORTFOLIO_LUZERNER_OVERLAY_PAGE_' + (index + 1) + '%%';
    return marker + ' '.repeat(BLOCK_BYTES - marker.length);
  });
  return new TextEncoder().encode(blocks.join(''));
}

function fixture(): LuzernerLeasePdfRenderInput {
  return {
    agreementCode: 'AGR-LU-2027-001',
    agreementEffectiveFrom: '2027-07-01',
    property: {
      street: 'Seestrasse',
      houseNumber: '12',
      postalCode: '6003',
      city: 'Luzern',
    },
    unit: {
      unitNumber: '3.01',
      unitType: 'apartment',
      rooms: 3.5,
    },
    landlords: [
      {
        displayName: 'Portfolio Immobilien AG',
        addressLine: 'Pilatusstrasse 1',
        postalCode: '6003',
        city: 'Luzern',
      },
    ],
    landlordRepresentatives: [
      {
        displayName: 'Verwaltung Muster AG',
        addressLine: 'Hirschengraben 7',
        postalCode: '6003',
        city: 'Luzern',
      },
    ],
    tenants: [
      {
        displayName: 'Anna Müller',
        addressLine: 'Altstadtgasse 4',
        postalCode: '6004',
        city: 'Luzern',
      },
      {
        displayName: 'Peter Meier',
        addressLine: 'Altstadtgasse 4',
        postalCode: '6004',
        city: 'Luzern',
      },
    ],
    form: {
      ewid: '30123456',
      egid: '191234567',
      intendedForPersonCount: 2,
      familyApartment: true,
      registeredPartnership: false,
      furnished: false,
      separateRoom: true,
      cellar: true,
      attic: false,
      separateApartment: false,
      garage: true,
      garageNumber: 'G-12',
      parkingSpace: true,
      parkingSpaceNumber: 'P-7',
      additionalObjectLabel: 'Hobbyraum 3',
      sharedUse: {
        laundry_room: true,
        drying_room: true,
        drying_area: false,
        stroller_room: false,
        garden: true,
        hobby_room: false,
        playground: true,
        bicycle_moped_room: true,
      },
      customSharedUse: ['Dachterrasse', 'Werkraum'],
      useType: 'apartment',
      useTypeOther: null,
      moveInDate: '2027-07-01',
      durationKind: 'indefinite',
      minimumCancelableOn: null,
      fixedEndDate: null,
      terminationSchedule: 'monthly_except_december',
      terminationScheduleCustom: null,
      noticePeriodKind: 'residential_3_months',
      longerNoticeMonths: null,
      currency: 'CHF',
      netRent: '1800.00',
      garageParkingRent: '120.00',
      ancillaryAdvance: '160.00',
      ancillaryFlat: '30.00',
      ancillaryCosts: {
        heating_hot_water: 'advance',
        cold_water: 'advance',
        caretaker_stair_cleaning: 'flat',
        garden_surroundings_snow: 'excluded',
        lift: 'excluded',
        common_electricity_gas: 'advance',
        ara_kva_sewer: 'advance',
        tv_cable: 'excluded',
        laundry: 'flat',
        administration_share: 'flat',
      },
      customAncillaryCosts: [
        { label: 'Solarstrom Allgemein', mode: 'advance' },
        { label: 'Paketbox-Service', mode: 'flat' },
      ],
      paymentFrequency: 'monthly',
      rentAdjustmentMode: 'termination_date',
      rentAdjustmentAdvanceMonths: 3,
      consumerPriceIndexPoints: null,
      ancillaryClosingDate: 'december_31',
      ancillaryClosingDateCustom: null,
      securityAmount: '5400.00',
      tenantNamedDepositAccount: true,
      depositAccountReference: 'Kautionskonto Luzerner Kantonalbank',
      privateLiabilityPolicy: 'yes',
      mortgageReferenceRate: '1.25 %',
      costIncreaseCompensatedThrough: '30.06.2027',
      consumerPriceIndex: '107.3',
      consumerPriceIndexMonthYear: '05/2027',
      consumerPriceIndexBasis: '12/2020',
      rentReserveAmount: '150.00',
      rentReservePercent: '2.0',
      separateRentReserveAgreement: true,
      remarksAttachments: 'Hausordnung und Zustandsprotokoll bilden integrierenden Bestandteil.',
      initialRentFormAttached: true,
      specialProvisions:
        'Die Parteien vereinbaren die Benutzung der Dachterrasse gemäss Hausordnung.',
      placeOfSigning: 'Luzern',
      signingDate: '2027-06-15',
    },
  } as unknown as LuzernerLeasePdfRenderInput;
}

describe('CanonicalLuzernerPdfRenderer', () => {
  it('renders the canonical LU form deterministically into the eight reserved page overlays', async () => {
    const renderer = new CanonicalLuzernerPdfRenderer(template());
    const input = fixture();

    const first = await renderer.renderLuzernerLeaseAgreement(input);
    const second = await renderer.renderLuzernerLeaseAgreement(input);
    const source = new TextDecoder().decode(first.content);

    expect(first.fileName).toBe('mietvertrag-AGR-LU-2027-001.pdf');
    expect(first.content).toEqual(second.content);
    expect(source).not.toContain('%%PORTFOLIO_LUZERNER_OVERLAY_PAGE_');

    expect(source).toContain('<506F7274666F6C696F20496D6D6F62696C69656E204147> Tj');
    expect(source).toContain('<56657277616C74756E67204D7573746572204147> Tj');
    expect(source).toContain('<416E6E61204DFC6C6C6572> Tj');
    expect(source).toContain('<30312E30372E32303237> Tj');
    expect(source).toContain('<32273131302E3030> Tj');
    expect(source).toContain('<486F6262797261756D2033> Tj');
    expect(source).toContain('<446163687465727261737365> Tj');
    expect(source).toContain('<536F6C61727374726F6D20416C6C67656D65696E> Tj');
    expect(source).toContain('<4C757A65726E2C2031352E30362E32303237> Tj');
  });

  it('rejects more tenant parties than the physical LU 2020 form can display', async () => {
    const input = fixture();
    const renderer = new CanonicalLuzernerPdfRenderer(template());

    await expect(
      renderer.renderLuzernerLeaseAgreement({
        ...input,
        tenants: [
          ...input.tenants,
          {
            displayName: 'Tenant 3',
            addressLine: null,
            postalCode: null,
            city: null,
          },
          {
            displayName: 'Tenant 4',
            addressLine: null,
            postalCode: null,
            city: null,
          },
        ],
      }),
    ).rejects.toMatchObject({ code: 'LUZERNER_PDF_TENANT_CAPACITY' });
  });

  it('fails explicitly rather than corrupting characters outside WinAnsi', async () => {
    const input = fixture();
    const renderer = new CanonicalLuzernerPdfRenderer(template());

    await expect(
      renderer.renderLuzernerLeaseAgreement({
        ...input,
        tenants: [
          {
            ...input.tenants[0]!,
            displayName: 'Čedomir Tenant',
          },
        ],
      }),
    ).rejects.toMatchObject({ code: 'LUZERNER_PDF_UNSUPPORTED_CHARACTER' });
  });

  it('rejects a template whose fixed-size page overlay markers are incomplete', () => {
    expect(
      () => new CanonicalLuzernerPdfRenderer(new TextEncoder().encode('not-a-template')),
    ).toThrowError(/overlay marker/u);
  });
});
