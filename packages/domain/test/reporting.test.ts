import { describe, expect, it } from 'vitest';
import {
  asLeaseAgreementId,
  asPropertyId,
  asTenancyId,
  asTenancyTermVersionId,
  asUnitId,
  createPortfolioDashboard,
  createReportingCostSummary,
  createUnitReportingOverview,
} from '../src/index.js';

const propertyId = asPropertyId(
  '11111111-1111-4111-8111-111111111111',
);
const unitId = asUnitId('22222222-2222-4222-8222-222222222222');
const tenancyId = asTenancyId(
  '33333333-3333-4333-8333-333333333333',
);
const agreementId = asLeaseAgreementId(
  '44444444-4444-4444-8444-444444444444',
);
const termId = asTenancyTermVersionId(
  '55555555-5555-4555-8555-555555555555',
);

const emptyOps = {
  openMaintenanceIssueCount: 0,
  urgentMaintenanceIssueCount: 0,
  openMaintenanceWorkOrderCount: 0,
  locatedAssetCount: 0,
  activeAssetCount: 0,
  inactiveAssetCount: 0,
  activeServicePlanCount: 0,
  openWarrantyClaimCount: 0,
  activeMeterCount: 0,
};

describe('Reporting projections', () => {
  it('validates exact money summary arithmetic without floating point', () => {
    expect(
      createReportingCostSummary({
        currency: 'CHF',
        capex: '100.10',
        opex: '20.20',
        unclassified: '0.70',
        total: '121.00',
      }),
    ).toMatchObject({
      currency: 'CHF',
      total: '121.00',
    });

    expect(() =>
      createReportingCostSummary({
        currency: 'CHF',
        capex: '100.10',
        opex: '20.20',
        unclassified: '0.70',
        total: '120.99',
      }),
    ).toThrowError(
      expect.objectContaining({ code: 'REPORTING_INVALID_PROJECTION' }),
    );
  });

  it('preserves occupancy, effective contract and exact term semantics', () => {
    expect(
      createUnitReportingOverview({
        asOf: '2026-09-21',
        unitId,
        propertyId,
        propertyCode: 'PROP-1',
        propertyName: 'Main Property',
        unitCode: 'UNIT-1',
        unitNumber: '1A',
        unitType: 'apartment',
        floor: '1',
        areaM2: 72.5,
        rooms: 3,
        occupancyStatus: 'occupied',
        tenancy: {
          id: tenancyId,
          code: 'TEN-1',
          currentStatus: 'active',
          plannedStart: '2026-09-01',
          plannedEnd: null,
          actualStart: '2026-09-10',
          actualEnd: null,
        },
        contract: {
          coverageStatus: 'effective',
          currentDraftAgreementCount: 0,
          agreementId,
          agreementCode: 'AGR-1',
          agreementCurrentStatus: 'signed',
          effectiveFrom: '2026-09-10',
          effectiveTo: null,
          signedAt: '2026-09-09',
          effectiveTerms: {
            id: termId,
            sourceType: 'agreement',
            effectiveFrom: '2026-09-10',
            currency: 'CHF',
            baseRent: '1000.00',
            serviceCharge: '150.00',
            utilitiesAdvance: '100.00',
            parkingRent: '50.00',
            otherRecurringCharge: '0.00',
            recurringTotal: '1300.00',
            depositRequired: '3000.00',
            billingFrequency: 'monthly',
          },
        },
        currentOperations: emptyOps,
        unitAttributedCostsByCurrency: [
          {
            currency: 'CHF',
            capex: '20.00',
            opex: '5.00',
            unclassified: '0.00',
            total: '25.00',
          },
        ],
      }),
    ).toMatchObject({
      asOf: '2026-09-21',
      occupancyStatus: 'occupied',
      contract: {
        coverageStatus: 'effective',
        effectiveTerms: { recurringTotal: '1300.00' },
      },
    });
  });

  it('separates current draft workflow from legal as-of coverage', () => {
    expect(
      createUnitReportingOverview({
        asOf: '2026-09-21',
        unitId,
        propertyId,
        propertyCode: 'PROP-1',
        propertyName: 'Main Property',
        unitCode: 'UNIT-1',
        unitNumber: '1A',
        unitType: 'apartment',
        floor: null,
        areaM2: null,
        rooms: null,
        occupancyStatus: 'occupied',
        tenancy: {
          id: tenancyId,
          code: 'TEN-1',
          currentStatus: 'active',
          plannedStart: null,
          plannedEnd: null,
          actualStart: '2026-09-01',
          actualEnd: null,
        },
        contract: {
          coverageStatus: 'missing',
          currentDraftAgreementCount: 1,
          agreementId: null,
          agreementCode: null,
          agreementCurrentStatus: null,
          effectiveFrom: null,
          effectiveTo: null,
          signedAt: null,
          effectiveTerms: null,
        },
        currentOperations: emptyOps,
        unitAttributedCostsByCurrency: [],
      }),
    ).toMatchObject({
      contract: {
        coverageStatus: 'missing',
        currentDraftAgreementCount: 1,
        agreementId: null,
      },
    });
  });

  it('rejects legal coverage whose dates contradict asOf', () => {
    expect(() =>
      createUnitReportingOverview({
        asOf: '2026-09-21',
        unitId,
        propertyId,
        propertyCode: 'PROP-1',
        propertyName: 'Main Property',
        unitCode: 'UNIT-1',
        unitNumber: '1A',
        unitType: 'apartment',
        floor: null,
        areaM2: null,
        rooms: null,
        occupancyStatus: 'occupied',
        tenancy: {
          id: tenancyId,
          code: 'TEN-1',
          currentStatus: 'active',
          plannedStart: null,
          plannedEnd: null,
          actualStart: '2026-09-01',
          actualEnd: null,
        },
        contract: {
          coverageStatus: 'future_signed',
          currentDraftAgreementCount: 0,
          agreementId,
          agreementCode: 'AGR-1',
          agreementCurrentStatus: 'signed',
          effectiveFrom: '2026-09-20',
          effectiveTo: null,
          signedAt: '2026-09-10',
          effectiveTerms: null,
        },
        currentOperations: emptyOps,
        unitAttributedCostsByCurrency: [],
      }),
    ).toThrowError(
      expect.objectContaining({ code: 'REPORTING_INVALID_PROJECTION' }),
    );
  });

  it('rejects vacant Unit carrying a selected Tenancy', () => {
    expect(() =>
      createUnitReportingOverview({
        asOf: '2026-09-21',
        unitId,
        propertyId,
        propertyCode: 'PROP-1',
        propertyName: 'Main Property',
        unitCode: 'UNIT-1',
        unitNumber: '1A',
        unitType: 'apartment',
        floor: null,
        areaM2: null,
        rooms: null,
        occupancyStatus: 'vacant',
        tenancy: {
          id: tenancyId,
          code: 'TEN-1',
          currentStatus: 'ended',
          plannedStart: null,
          plannedEnd: null,
          actualStart: '2026-01-01',
          actualEnd: '2026-02-01',
        },
        contract: {
          coverageStatus: 'missing',
          currentDraftAgreementCount: 0,
          agreementId: null,
          agreementCode: null,
          agreementCurrentStatus: null,
          effectiveFrom: null,
          effectiveTo: null,
          signedAt: null,
          effectiveTerms: null,
        },
        currentOperations: emptyOps,
        unitAttributedCostsByCurrency: [],
      }),
    ).toThrowError(
      expect.objectContaining({ code: 'REPORTING_INVALID_PROJECTION' }),
    );
  });

  it('requires portfolio occupancy buckets to partition Unit count', () => {
    expect(() =>
      createPortfolioDashboard({
        asOf: '2026-09-21',
        propertyCount: 1,
        unitCount: 2,
        occupiedUnitCount: 1,
        plannedUnitCount: 1,
        vacantUnitCount: 1,
        currentOperations: emptyOps,
        portfolioCostsByCurrency: [],
        properties: [
          {
            propertyId,
            propertyCode: 'PROP-1',
            propertyName: 'Main Property',
            unitCount: 2,
            occupiedUnitCount: 1,
            plannedUnitCount: 0,
            vacantUnitCount: 1,
            currentOpenMaintenanceIssueCount: 0,
            currentUrgentMaintenanceIssueCount: 0,
            currentLocatedAssetCount: 0,
            currentActiveAssetCount: 0,
            currentActiveMeterCount: 0,
          },
        ],
      }),
    ).toThrowError(
      expect.objectContaining({ code: 'REPORTING_INVALID_PROJECTION' }),
    );
  });
});
