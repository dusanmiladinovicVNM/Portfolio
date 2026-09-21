import { asDateOnly, type DateOnly } from '../shared/date-only.js';
import { DomainError } from '../shared/domain-error.js';
import type {
  LeaseAgreementId,
  PropertyId,
  TenancyId,
  TenancyTermVersionId,
  UnitId,
} from '../shared/entity-id.js';
import {
  asCurrencyCode,
  asMoneyAmount,
  type CurrencyCode,
  type MoneyAmount,
} from '../shared/money.js';
import type { LeaseAgreementStatus } from '../contracts/lease-agreement.js';
import type {
  BillingFrequency,
  TermSourceType,
} from '../contracts/tenancy-term-version.js';
import type { TenancyStatus } from '../tenancy/tenancy.js';
import type { UnitType } from '../portfolio/unit.js';

export const REPORTING_OCCUPANCY_STATUSES = [
  'occupied',
  'planned',
  'vacant',
] as const;

export const REPORTING_CONTRACT_COVERAGE_STATUSES = [
  'effective',
  'future_signed',
  'draft_only',
  'missing',
] as const;

export type ReportingOccupancyStatus =
  (typeof REPORTING_OCCUPANCY_STATUSES)[number];

export type ReportingContractCoverageStatus =
  (typeof REPORTING_CONTRACT_COVERAGE_STATUSES)[number];

export interface ReportingCostSummary {
  readonly currency: CurrencyCode;
  readonly capex: MoneyAmount;
  readonly opex: MoneyAmount;
  readonly unclassified: MoneyAmount;
  readonly total: MoneyAmount;
}

export interface ReportingTenancySummary {
  readonly id: TenancyId;
  readonly code: string;
  readonly currentStatus: TenancyStatus;
  readonly plannedStart: DateOnly | null;
  readonly plannedEnd: DateOnly | null;
  readonly actualStart: DateOnly | null;
  readonly actualEnd: DateOnly | null;
}

export interface ReportingTermSummary {
  readonly id: TenancyTermVersionId;
  readonly sourceType: TermSourceType;
  readonly effectiveFrom: DateOnly;
  readonly currency: CurrencyCode;
  readonly baseRent: MoneyAmount;
  readonly serviceCharge: MoneyAmount;
  readonly utilitiesAdvance: MoneyAmount;
  readonly parkingRent: MoneyAmount;
  readonly otherRecurringCharge: MoneyAmount;
  readonly recurringTotal: MoneyAmount;
  readonly depositRequired: MoneyAmount;
  readonly billingFrequency: BillingFrequency;
}

export interface ReportingContractSummary {
  readonly coverageStatus: ReportingContractCoverageStatus;
  readonly agreementId: LeaseAgreementId | null;
  readonly agreementCode: string | null;
  readonly agreementCurrentStatus: LeaseAgreementStatus | null;
  readonly effectiveFrom: DateOnly | null;
  readonly effectiveTo: DateOnly | null;
  readonly signedAt: DateOnly | null;
  readonly effectiveTerms: ReportingTermSummary | null;
}

export interface ReportingCurrentOperations {
  readonly openMaintenanceIssueCount: number;
  readonly urgentMaintenanceIssueCount: number;
  readonly openMaintenanceWorkOrderCount: number;
  readonly locatedAssetCount: number;
  readonly activeAssetCount: number;
  readonly inactiveAssetCount: number;
  readonly activeServicePlanCount: number;
  readonly openWarrantyClaimCount: number;
  readonly activeMeterCount: number;
}

export interface UnitReportingOverview {
  readonly asOf: DateOnly;
  readonly unitId: UnitId;
  readonly propertyId: PropertyId;
  readonly propertyCode: string;
  readonly propertyName: string;
  readonly unitCode: string;
  readonly unitNumber: string;
  readonly unitType: UnitType;
  readonly floor: string | null;
  readonly areaM2: number | null;
  readonly rooms: number | null;
  readonly occupancyStatus: ReportingOccupancyStatus;
  readonly tenancy: ReportingTenancySummary | null;
  readonly contract: ReportingContractSummary;
  readonly currentOperations: ReportingCurrentOperations;
  readonly unitAttributedCostsByCurrency: readonly ReportingCostSummary[];
}

export interface PropertyReportingSummary {
  readonly propertyId: PropertyId;
  readonly propertyCode: string;
  readonly propertyName: string;
  readonly unitCount: number;
  readonly occupiedUnitCount: number;
  readonly plannedUnitCount: number;
  readonly vacantUnitCount: number;
  readonly currentOpenMaintenanceIssueCount: number;
  readonly currentUrgentMaintenanceIssueCount: number;
  readonly currentLocatedAssetCount: number;
  readonly currentActiveAssetCount: number;
  readonly currentActiveMeterCount: number;
}

export interface PortfolioDashboard {
  readonly asOf: DateOnly;
  readonly propertyCount: number;
  readonly unitCount: number;
  readonly occupiedUnitCount: number;
  readonly plannedUnitCount: number;
  readonly vacantUnitCount: number;
  readonly currentOperations: ReportingCurrentOperations;
  readonly portfolioCostsByCurrency: readonly ReportingCostSummary[];
  readonly properties: readonly PropertyReportingSummary[];
}

function required(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new DomainError('REPORTING_INVALID_PROJECTION', `${field} is required.`);
  }
  return normalized;
}

function nonNegativeInteger(value: number, field: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new DomainError(
      'REPORTING_INVALID_PROJECTION',
      `${field} must be a non-negative integer.`,
    );
  }
  return value;
}

function scaledMoney(value: MoneyAmount): bigint {
  return BigInt(value.replace('.', ''));
}

function moneyFromScaled(value: bigint): MoneyAmount {
  const raw = value.toString().padStart(3, '0');
  return asMoneyAmount(`${raw.slice(0, -2) || '0'}.${raw.slice(-2)}`);
}

function normalizeCostSummary(
  input: {
    readonly currency: string;
    readonly capex: string;
    readonly opex: string;
    readonly unclassified: string;
    readonly total: string;
  },
): ReportingCostSummary {
  const currency = asCurrencyCode(input.currency);
  const capex = asMoneyAmount(input.capex);
  const opex = asMoneyAmount(input.opex);
  const unclassified = asMoneyAmount(input.unclassified);
  const total = asMoneyAmount(input.total);
  const expected = moneyFromScaled(
    scaledMoney(capex) + scaledMoney(opex) + scaledMoney(unclassified),
  );

  if (total !== expected) {
    throw new DomainError(
      'REPORTING_INVALID_PROJECTION',
      'Cost total must equal CAPEX + OPEX + unclassified.',
    );
  }

  return { currency, capex, opex, unclassified, total };
}

export function createReportingTermSummary(input: {
  readonly id: TenancyTermVersionId;
  readonly sourceType: TermSourceType;
  readonly effectiveFrom: string;
  readonly currency: string;
  readonly baseRent: string;
  readonly serviceCharge: string;
  readonly utilitiesAdvance: string;
  readonly parkingRent: string;
  readonly otherRecurringCharge: string;
  readonly recurringTotal: string;
  readonly depositRequired: string;
  readonly billingFrequency: BillingFrequency;
}): ReportingTermSummary {
  const baseRent = asMoneyAmount(input.baseRent);
  const serviceCharge = asMoneyAmount(input.serviceCharge);
  const utilitiesAdvance = asMoneyAmount(input.utilitiesAdvance);
  const parkingRent = asMoneyAmount(input.parkingRent);
  const otherRecurringCharge = asMoneyAmount(input.otherRecurringCharge);
  const recurringTotal = asMoneyAmount(input.recurringTotal);
  const expectedRecurring = moneyFromScaled(
    scaledMoney(baseRent) +
      scaledMoney(serviceCharge) +
      scaledMoney(utilitiesAdvance) +
      scaledMoney(parkingRent) +
      scaledMoney(otherRecurringCharge),
  );

  if (recurringTotal !== expectedRecurring) {
    throw new DomainError(
      'REPORTING_INVALID_PROJECTION',
      'Recurring total must equal all recurring charge components.',
    );
  }

  return {
    id: input.id,
    sourceType: input.sourceType,
    effectiveFrom: asDateOnly(input.effectiveFrom),
    currency: asCurrencyCode(input.currency),
    baseRent,
    serviceCharge,
    utilitiesAdvance,
    parkingRent,
    otherRecurringCharge,
    recurringTotal,
    depositRequired: asMoneyAmount(input.depositRequired),
    billingFrequency: input.billingFrequency,
  };
}

function normalizeOperations(
  input: ReportingCurrentOperations,
): ReportingCurrentOperations {
  return {
    openMaintenanceIssueCount: nonNegativeInteger(
      input.openMaintenanceIssueCount,
      'openMaintenanceIssueCount',
    ),
    urgentMaintenanceIssueCount: nonNegativeInteger(
      input.urgentMaintenanceIssueCount,
      'urgentMaintenanceIssueCount',
    ),
    openMaintenanceWorkOrderCount: nonNegativeInteger(
      input.openMaintenanceWorkOrderCount,
      'openMaintenanceWorkOrderCount',
    ),
    locatedAssetCount: nonNegativeInteger(
      input.locatedAssetCount,
      'locatedAssetCount',
    ),
    activeAssetCount: nonNegativeInteger(
      input.activeAssetCount,
      'activeAssetCount',
    ),
    inactiveAssetCount: nonNegativeInteger(
      input.inactiveAssetCount,
      'inactiveAssetCount',
    ),
    activeServicePlanCount: nonNegativeInteger(
      input.activeServicePlanCount,
      'activeServicePlanCount',
    ),
    openWarrantyClaimCount: nonNegativeInteger(
      input.openWarrantyClaimCount,
      'openWarrantyClaimCount',
    ),
    activeMeterCount: nonNegativeInteger(
      input.activeMeterCount,
      'activeMeterCount',
    ),
  };
}

export function createReportingCostSummary(
  input: Parameters<typeof normalizeCostSummary>[0],
): ReportingCostSummary {
  return normalizeCostSummary(input);
}

export function createUnitReportingOverview(input: {
  readonly asOf: string;
  readonly unitId: UnitId;
  readonly propertyId: PropertyId;
  readonly propertyCode: string;
  readonly propertyName: string;
  readonly unitCode: string;
  readonly unitNumber: string;
  readonly unitType: UnitType;
  readonly floor: string | null;
  readonly areaM2: number | null;
  readonly rooms: number | null;
  readonly occupancyStatus: ReportingOccupancyStatus;
  readonly tenancy: ReportingTenancySummary | null;
  readonly contract: ReportingContractSummary;
  readonly currentOperations: ReportingCurrentOperations;
  readonly unitAttributedCostsByCurrency: readonly Parameters<
    typeof normalizeCostSummary
  >[0][];
}): UnitReportingOverview {
  const asOf = asDateOnly(input.asOf);

  if (input.occupancyStatus === 'vacant' && input.tenancy !== null) {
    throw new DomainError(
      'REPORTING_INVALID_PROJECTION',
      'Vacant Unit cannot carry a reporting Tenancy.',
    );
  }

  if (input.occupancyStatus !== 'vacant' && input.tenancy === null) {
    throw new DomainError(
      'REPORTING_INVALID_PROJECTION',
      'Occupied/planned Unit requires a reporting Tenancy.',
    );
  }

  if (
    input.contract.coverageStatus !== 'missing' &&
    (input.contract.agreementId === null ||
      input.contract.agreementCode === null ||
      input.contract.agreementCurrentStatus === null ||
      input.contract.effectiveFrom === null)
  ) {
    throw new DomainError(
      'REPORTING_INVALID_PROJECTION',
      'Non-missing contract coverage requires an Agreement identity.',
    );
  }

  if (
    input.contract.coverageStatus === 'effective' &&
    input.contract.effectiveTerms === null
  ) {
    throw new DomainError(
      'REPORTING_INVALID_PROJECTION',
      'Effective contract coverage requires effective Tenancy terms.',
    );
  }

  if (
    input.contract.coverageStatus !== 'effective' &&
    input.contract.effectiveTerms !== null
  ) {
    throw new DomainError(
      'REPORTING_INVALID_PROJECTION',
      'Non-effective contract coverage cannot expose effective Tenancy terms.',
    );
  }

  if (
    input.contract.effectiveTerms !== null &&
    input.contract.effectiveTerms.effectiveFrom > asOf
  ) {
    throw new DomainError(
      'REPORTING_INVALID_PROJECTION',
      'Effective reporting terms cannot start after asOf.',
    );
  }

  const costs = input.unitAttributedCostsByCurrency
    .map(normalizeCostSummary)
    .sort((left, right) => left.currency.localeCompare(right.currency));

  const seenCurrencies = new Set<string>();
  for (const cost of costs) {
    if (seenCurrencies.has(cost.currency)) {
      throw new DomainError(
        'REPORTING_INVALID_PROJECTION',
        'Cost summaries must contain at most one row per currency.',
      );
    }
    seenCurrencies.add(cost.currency);
  }

  return {
    ...input,
    asOf,
    propertyCode: required(input.propertyCode, 'propertyCode'),
    propertyName: required(input.propertyName, 'propertyName'),
    unitCode: required(input.unitCode, 'unitCode'),
    unitNumber: required(input.unitNumber, 'unitNumber'),
    currentOperations: normalizeOperations(input.currentOperations),
    unitAttributedCostsByCurrency: costs,
  };
}

export function createPortfolioDashboard(input: {
  readonly asOf: string;
  readonly propertyCount: number;
  readonly unitCount: number;
  readonly occupiedUnitCount: number;
  readonly plannedUnitCount: number;
  readonly vacantUnitCount: number;
  readonly currentOperations: ReportingCurrentOperations;
  readonly portfolioCostsByCurrency: readonly Parameters<
    typeof normalizeCostSummary
  >[0][];
  readonly properties: readonly PropertyReportingSummary[];
}): PortfolioDashboard {
  const asOf = asDateOnly(input.asOf);
  const propertyCount = nonNegativeInteger(input.propertyCount, 'propertyCount');
  const unitCount = nonNegativeInteger(input.unitCount, 'unitCount');
  const occupiedUnitCount = nonNegativeInteger(
    input.occupiedUnitCount,
    'occupiedUnitCount',
  );
  const plannedUnitCount = nonNegativeInteger(
    input.plannedUnitCount,
    'plannedUnitCount',
  );
  const vacantUnitCount = nonNegativeInteger(
    input.vacantUnitCount,
    'vacantUnitCount',
  );

  if (
    occupiedUnitCount + plannedUnitCount + vacantUnitCount !== unitCount
  ) {
    throw new DomainError(
      'REPORTING_INVALID_PROJECTION',
      'Portfolio occupancy counts must partition Unit count.',
    );
  }

  if (input.properties.length !== propertyCount) {
    throw new DomainError(
      'REPORTING_INVALID_PROJECTION',
      'Property summary count must match propertyCount.',
    );
  }

  const properties = input.properties
    .map((property) => {
      const unitCountValue = nonNegativeInteger(
        property.unitCount,
        'property.unitCount',
      );
      const occupied = nonNegativeInteger(
        property.occupiedUnitCount,
        'property.occupiedUnitCount',
      );
      const planned = nonNegativeInteger(
        property.plannedUnitCount,
        'property.plannedUnitCount',
      );
      const vacant = nonNegativeInteger(
        property.vacantUnitCount,
        'property.vacantUnitCount',
      );

      if (occupied + planned + vacant !== unitCountValue) {
        throw new DomainError(
          'REPORTING_INVALID_PROJECTION',
          'Property occupancy counts must partition Unit count.',
        );
      }

      return {
        ...property,
        propertyCode: required(property.propertyCode, 'propertyCode'),
        propertyName: required(property.propertyName, 'propertyName'),
        unitCount: unitCountValue,
        occupiedUnitCount: occupied,
        plannedUnitCount: planned,
        vacantUnitCount: vacant,
        currentOpenMaintenanceIssueCount: nonNegativeInteger(
          property.currentOpenMaintenanceIssueCount,
          'property.currentOpenMaintenanceIssueCount',
        ),
        currentUrgentMaintenanceIssueCount: nonNegativeInteger(
          property.currentUrgentMaintenanceIssueCount,
          'property.currentUrgentMaintenanceIssueCount',
        ),
        currentLocatedAssetCount: nonNegativeInteger(
          property.currentLocatedAssetCount,
          'property.currentLocatedAssetCount',
        ),
        currentActiveAssetCount: nonNegativeInteger(
          property.currentActiveAssetCount,
          'property.currentActiveAssetCount',
        ),
        currentActiveMeterCount: nonNegativeInteger(
          property.currentActiveMeterCount,
          'property.currentActiveMeterCount',
        ),
      };
    })
    .sort((left, right) => {
      const byCode = left.propertyCode.localeCompare(right.propertyCode);
      return byCode !== 0
        ? byCode
        : left.propertyId.localeCompare(right.propertyId);
    });

  const costs = input.portfolioCostsByCurrency
    .map(normalizeCostSummary)
    .sort((left, right) => left.currency.localeCompare(right.currency));

  if (new Set(costs.map((cost) => cost.currency)).size !== costs.length) {
    throw new DomainError(
      'REPORTING_INVALID_PROJECTION',
      'Portfolio cost summaries must contain at most one row per currency.',
    );
  }

  return {
    asOf,
    propertyCount,
    unitCount,
    occupiedUnitCount,
    plannedUnitCount,
    vacantUnitCount,
    currentOperations: normalizeOperations(input.currentOperations),
    portfolioCostsByCurrency: costs,
    properties,
  };
}
