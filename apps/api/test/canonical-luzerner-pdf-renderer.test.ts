import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { LuzernerLeasePdfRenderInput } from '@portfolio/application';
import { CanonicalLuzernerPdfRenderer } from '../src/canonical-luzerner-pdf-renderer.js';
import { PAGE_2_FIXED_TEXT } from '../src/luzerner-2020-template/page-02.js';
import {
  LUZERNER_2020_FIXED_WORDING,
  LUZERNER_2020_FIXED_WORDING_SHA256,
  LUZERNER_2020_PAGE_COUNT,
  LUZERNER_2020_TEMPLATE_CODE,
  LUZERNER_2020_TEMPLATE_REVISION,
} from '../src/luzerner-2020-template/source-wording.js';

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
  it('locks the reviewed LU-2020 wording and excludes source-specific sample clauses', () => {
    const canonical = LUZERNER_2020_FIXED_WORDING.join('\n\f\n');
    const sha256 = createHash('sha256').update(canonical, 'utf8').digest('hex');

    expect(LUZERNER_2020_TEMPLATE_CODE).toBe('lu-2020');
    expect(LUZERNER_2020_TEMPLATE_REVISION).toBe(1);
    expect(LUZERNER_2020_PAGE_COUNT).toBe(8);
    expect(LUZERNER_2020_FIXED_WORDING).toHaveLength(8);
    expect(sha256).toBe(LUZERNER_2020_FIXED_WORDING_SHA256);

    expect(canonical).toContain('Allgemeine Bedingungen');
    expect(canonical).toContain('3.4 Verrechnung und Sicherheitsleistung');
    expect(canonical).toContain('3.3.2 Für die Verteilung der anderen Betriebskosten');
    expect(canonical).toContain('8. Besondere Bestimmungen');
    expect(canonical).not.toContain('Mietverhältnis wird übernommen;');
    expect(canonical).not.toContain('￾');
  });

  it('builds a deterministic native eight-page PDF without binary-template overlays', async () => {
    const renderer = new CanonicalLuzernerPdfRenderer();
    const input = fixture();

    const first = await renderer.renderLuzernerLeaseAgreement(input);
    const second = await renderer.renderLuzernerLeaseAgreement(input);
    const source = new TextDecoder().decode(first.content);
    expect(first.fileName).toBe('mietvertrag-AGR-LU-2027-001.pdf');
    expect(first.content).toEqual(second.content);
    expect(source.startsWith('%PDF-1.4')).toBe(true);
    expect(source).toContain('/Count 8');
    expect(source).not.toContain('PORTFOLIO_LUZERNER_OVERLAY');
    expect(source).toContain('<416C6C67656D65696E6520426564696E67756E67656E');
    expect(source).toContain('<382E204265736F6E646572652042657374696D6D756E67656E');
    expect(source).toContain('46FC7220646965205665727465696C756E672064657220616E646572656E20');
    expect(source).toContain('95 Tz');

    expect(source).toContain('<506F7274666F6C696F20496D6D6F62696C69656E2041472C20');
    expect(source).toContain('<56657277616C74756E67204D75737465722041472C20');
    expect(source).toContain('<416E6E61204DFC6C6C6572> Tj');
    expect(source).toContain('<30312E30372E32303237> Tj');
    expect(source).toContain('<32273131302E3030> Tj');
    expect(source).toContain('<486F6262797261756D2033> Tj');
    expect(source).toContain('<446163687465727261737365> Tj');
    expect(source).toContain('536F6C61727374726F6D20416C6C67656D65696E');
    expect(source).toContain('<4C757A65726E2C2031352E30362E32303237> Tj');
    expect(PAGE_2_FIXED_TEXT.filter((line) => line.text === '*')).toHaveLength(0);
    expect(source.match(/<2A> Tj/g)).toHaveLength(4);
  });

  it('rejects more tenant parties than the LU 2020 contract layout can display', async () => {
    const input = fixture();
    const renderer = new CanonicalLuzernerPdfRenderer();

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

  it('fails closed when a single-line field still overflows at minimum font size', async () => {
    const input = fixture();
    const renderer = new CanonicalLuzernerPdfRenderer();

    await expect(
      renderer.renderLuzernerLeaseAgreement({
        ...input,
        landlords: [
          {
            ...input.landlords[0]!,
            displayName: 'Extremely Long Landlord Name '.repeat(40),
          },
        ],
      }),
    ).rejects.toMatchObject({ code: 'LUZERNER_PDF_TEXT_OVERFLOW' });
  });

  it('fails closed when a custom ancillary label exceeds its physical row width', async () => {
    const input = fixture();
    const renderer = new CanonicalLuzernerPdfRenderer();

    await expect(
      renderer.renderLuzernerLeaseAgreement({
        ...input,
        form: {
          ...input.form,
          customAncillaryCosts: [
            {
              label: 'Extremely long ancillary cost description '.repeat(40),
              mode: 'advance',
            },
          ],
        },
      }),
    ).rejects.toMatchObject({ code: 'LUZERNER_PDF_TEXT_OVERFLOW' });
  });

  it('fails closed when a custom termination schedule exceeds its physical field width', async () => {
    const input = fixture();
    const renderer = new CanonicalLuzernerPdfRenderer();

    await expect(
      renderer.renderLuzernerLeaseAgreement({
        ...input,
        form: {
          ...input.form,
          terminationSchedule: 'custom',
          terminationScheduleCustom:
            'Extremely long custom termination schedule '.repeat(30),
        },
      }),
    ).rejects.toMatchObject({ code: 'LUZERNER_PDF_TEXT_OVERFLOW' });
  });

  it('dispatches only the explicitly requested frozen template revision', async () => {
    const input = fixture();
    const renderer = new CanonicalLuzernerPdfRenderer();

    expect(renderer.getCurrentTemplateIdentity()).toEqual({
      templateCode: 'lu-2020',
      templateRevision: 1,
    });

    await expect(
      renderer.renderLuzernerLeaseAgreement(input, {
        templateCode: 'lu-2020',
        templateRevision: 2,
      }),
    ).rejects.toMatchObject({
      code: 'LUZERNER_PDF_TEMPLATE_REVISION_UNSUPPORTED',
    });
  });

  it('fails explicitly rather than corrupting characters outside WinAnsi', async () => {
    const input = fixture();
    const renderer = new CanonicalLuzernerPdfRenderer();

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
});
