import { z } from 'zod';
import {
  BILLING_FREQUENCIES,
  LEASE_AGREEMENT_STATUSES,
  REPORTING_CONTRACT_COVERAGE_STATUSES,
  REPORTING_OCCUPANCY_STATUSES,
  TENANCY_STATUSES,
  TERM_SOURCE_TYPES,
  UNIT_TYPES,
} from '@portfolio/domain';
import { entityIdSchema } from './portfolio.js';

const dateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const moneySchema = z.string().regex(/^(0|[1-9]\d*)\.\d{2}$/);
const currencySchema = z.string().regex(/^[A-Z]{3}$/);

export const reportingAsOfQuerySchema = z.object({
  asOf: dateOnlySchema,
});

export const reportingCostSummaryResponseSchema = z.object({
  currency: currencySchema,
  capex: moneySchema,
  opex: moneySchema,
  unclassified: moneySchema,
  total: moneySchema,
});

export const reportingCurrentOperationsResponseSchema = z.object({
  openMaintenanceIssueCount: z.number().int().nonnegative(),
  urgentMaintenanceIssueCount: z.number().int().nonnegative(),
  openMaintenanceWorkOrderCount: z.number().int().nonnegative(),
  locatedAssetCount: z.number().int().nonnegative(),
  activeAssetCount: z.number().int().nonnegative(),
  inactiveAssetCount: z.number().int().nonnegative(),
  activeServicePlanCount: z.number().int().nonnegative(),
  openWarrantyClaimCount: z.number().int().nonnegative(),
  activeMeterCount: z.number().int().nonnegative(),
});

export const reportingTenancySummaryResponseSchema = z.object({
  id: entityIdSchema,
  code: z.string().min(1),
  currentStatus: z.enum(TENANCY_STATUSES),
  plannedStart: dateOnlySchema.nullable(),
  plannedEnd: dateOnlySchema.nullable(),
  actualStart: dateOnlySchema.nullable(),
  actualEnd: dateOnlySchema.nullable(),
});

export const reportingTermSummaryResponseSchema = z.object({
  id: entityIdSchema,
  sourceType: z.enum(TERM_SOURCE_TYPES),
  effectiveFrom: dateOnlySchema,
  currency: currencySchema,
  baseRent: moneySchema,
  serviceCharge: moneySchema,
  utilitiesAdvance: moneySchema,
  parkingRent: moneySchema,
  otherRecurringCharge: moneySchema,
  recurringTotal: moneySchema,
  depositRequired: moneySchema,
  billingFrequency: z.enum(BILLING_FREQUENCIES),
});

export const reportingContractSummaryResponseSchema = z.object({
  coverageStatus: z.enum(REPORTING_CONTRACT_COVERAGE_STATUSES),
  currentDraftAgreementCount: z.number().int().nonnegative(),
  agreementId: entityIdSchema.nullable(),
  agreementCode: z.string().min(1).nullable(),
  agreementCurrentStatus: z.enum(LEASE_AGREEMENT_STATUSES).nullable(),
  effectiveFrom: dateOnlySchema.nullable(),
  effectiveTo: dateOnlySchema.nullable(),
  signedAt: dateOnlySchema.nullable(),
  effectiveTerms: reportingTermSummaryResponseSchema.nullable(),
});

export const unitReportingOverviewResponseSchema = z.object({
  asOf: dateOnlySchema,
  unitId: entityIdSchema,
  propertyId: entityIdSchema,
  propertyCode: z.string().min(1),
  propertyName: z.string().min(1),
  unitCode: z.string().min(1),
  unitNumber: z.string().min(1),
  unitType: z.enum(UNIT_TYPES),
  floor: z.string().nullable(),
  areaM2: z.number().positive().nullable(),
  rooms: z.number().positive().nullable(),
  occupancyStatus: z.enum(REPORTING_OCCUPANCY_STATUSES),
  tenancy: reportingTenancySummaryResponseSchema.nullable(),
  contract: reportingContractSummaryResponseSchema,
  currentOperations: reportingCurrentOperationsResponseSchema,
  unitAttributedCostsByCurrency: z.array(
    reportingCostSummaryResponseSchema,
  ),
});

export const propertyReportingSummaryResponseSchema = z.object({
  propertyId: entityIdSchema,
  propertyCode: z.string().min(1),
  propertyName: z.string().min(1),
  unitCount: z.number().int().nonnegative(),
  occupiedUnitCount: z.number().int().nonnegative(),
  plannedUnitCount: z.number().int().nonnegative(),
  vacantUnitCount: z.number().int().nonnegative(),
  currentOpenMaintenanceIssueCount: z.number().int().nonnegative(),
  currentUrgentMaintenanceIssueCount: z.number().int().nonnegative(),
  currentLocatedAssetCount: z.number().int().nonnegative(),
  currentActiveAssetCount: z.number().int().nonnegative(),
  currentActiveMeterCount: z.number().int().nonnegative(),
});

export const portfolioDashboardResponseSchema = z.object({
  asOf: dateOnlySchema,
  propertyCount: z.number().int().nonnegative(),
  unitCount: z.number().int().nonnegative(),
  occupiedUnitCount: z.number().int().nonnegative(),
  plannedUnitCount: z.number().int().nonnegative(),
  vacantUnitCount: z.number().int().nonnegative(),
  currentOperations: reportingCurrentOperationsResponseSchema,
  portfolioCostsByCurrency: z.array(
    reportingCostSummaryResponseSchema,
  ),
  properties: z.array(propertyReportingSummaryResponseSchema),
});

export type UnitReportingOverviewResponse = z.infer<
  typeof unitReportingOverviewResponseSchema
>;

export type PortfolioDashboardResponse = z.infer<
  typeof portfolioDashboardResponseSchema
>;
