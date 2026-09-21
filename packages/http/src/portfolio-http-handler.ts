import {
  ApplicationError,
  resolveActor,
  type AccessItemRepository,
  type AssetInventoryRepository,
  type AssetRepository,
  type AssetServiceRepository,
  type ClockPort,
  type CostRepository,
  type DocumentRepository,
  type FileStoragePort,
  type IdGenerator,
  type ImprovementRepository,
  type InspectionRepository,
  type LeaseRepository,
  type MaintenanceRepository,
  type MeterRepository,
  type OwnershipRepository,
  type PartyRepository,
  type PortfolioRepository,
  type ReportingRepository,
  type StaffDirectoryRepository,
  type TenancyRepository,
  type UnitTimelineRepository,
  type UserAccessRepository,
  type VerifiedIdentity,
} from '@portfolio/application';
import { DomainError } from '@portfolio/domain';
import { handleAccessItemHttp } from './access-item-http-routes.js';
import { handleAssetHttp } from './asset-http-routes.js';
import { handleAssetServiceHttp } from './asset-service-http-routes.js';
import { handleCostHttp } from './cost-http-routes.js';
import { handleDocumentHttp } from './document-http-routes.js';
import { errorResponse } from './http-utils.js';
import { handleImprovementHttp } from './improvement-http-routes.js';
import { handleInspectionHttp } from './inspection-http-routes.js';
import { handleLeaseHttp } from './lease-http-routes.js';
import { handleMaintenanceHttp } from './maintenance-http-routes.js';
import { handleMeterHttp } from './meter-http-routes.js';
import { handleOwnershipHttp } from './ownership-http-routes.js';
import { handlePartyHttp } from './party-http-routes.js';
import { handlePortfolioHttp } from './portfolio-http-routes.js';
import { handleReportingHttp } from './reporting-http-routes.js';
import { handleTenancyHttp } from './tenancy-http-routes.js';
import { handleUnitTimelineHttp } from './unit-timeline-http-routes.js';

export interface PortfolioHttpDependencies {
  readonly portfolioRepository: PortfolioRepository;
  readonly reportingRepository: ReportingRepository;
  readonly accessItemRepository: AccessItemRepository;
  readonly assetRepository: AssetRepository;
  readonly assetInventoryRepository: AssetInventoryRepository;
  readonly assetServiceRepository: AssetServiceRepository;
  readonly partyRepository: PartyRepository;
  readonly ownershipRepository: OwnershipRepository;
  readonly tenancyRepository: TenancyRepository;
  readonly leaseRepository: LeaseRepository;
  readonly documentRepository: DocumentRepository;
  readonly inspectionRepository: InspectionRepository;
  readonly improvementRepository: ImprovementRepository;
  readonly costRepository: CostRepository;
  readonly maintenanceRepository: MaintenanceRepository;
  readonly meterRepository: MeterRepository;
  readonly unitTimelineRepository: UnitTimelineRepository;
  readonly staffDirectoryRepository: StaffDirectoryRepository;
  readonly fileStorage: FileStoragePort;
  readonly clock: ClockPort;
  readonly userAccessRepository: UserAccessRepository;
  readonly idGenerator: IdGenerator;
  readonly onUnexpectedError?: (error: unknown) => void;
}

export interface PortfolioHttpOptions {
  readonly basePath?: string;
}

type Handler = (
  request: Request,
  identity: VerifiedIdentity | null,
) => Promise<Response>;

function normalizeBasePath(value: string | undefined): string {
  if (!value || value === '/') return '';
  const prefixed = value.startsWith('/') ? value : '/' + value;
  return prefixed.endsWith('/') ? prefixed.slice(0, -1) : prefixed;
}

function routePath(request: Request, basePath: string): string | null {
  const pathname = new URL(request.url).pathname;
  if (!basePath) return pathname;
  if (pathname === basePath) return '/';
  if (!pathname.startsWith(basePath + '/')) return null;
  return pathname.slice(basePath.length);
}

function errorStatus(code: string): number {
  if (code === 'UNAUTHORIZED') return 401;
  if (
    code === 'FORBIDDEN' ||
    code === 'INSPECTION_ACCESS_DENIED' ||
    code === 'INSPECTION_ASSIGNMENT_FORBIDDEN' ||
    code === 'INSPECTION_UNLOCK_FORBIDDEN' ||
    code === 'INSPECTION_FINALIZE_FORBIDDEN'
  ) return 403;
  if (code === 'INVALID_REQUEST') return 400;
  if (code.endsWith('_NOT_FOUND')) return 404;
  if (
    code.endsWith('_ALREADY_EXISTS') ||
    code.endsWith('_VERSION_CONFLICT') ||
    code === 'INSPECTION_SECTION_REVISION_CONFLICT' ||
    code === 'INSPECTION_CONTENT_REVISION_CONFLICT' ||
    code === 'OWNERSHIP_PERIOD_OVERLAP' ||
    code === 'TENANCY_PLANNED_RESERVATION_OVERLAP' ||
    code === 'TENANCY_PLANNED_OCCUPANCY_CONFLICT' ||
    code === 'TENANCY_ACTUAL_OCCUPANCY_OVERLAP' ||
    code === 'TENANCY_TERM_EFFECTIVE_DATE_CONFLICT' ||
    code === 'LEASE_AGREEMENT_TERMS_ALREADY_EXIST' ||
    code === 'LEASE_AMENDMENT_TERMS_ALREADY_EXIST' ||
    code === 'ASSET_ALREADY_REPLACED' ||
    code === 'ASSET_REPLACEMENT_ALREADY_LINKED' ||
    code === 'ASSET_IDENTIFIER_GLOBAL_CONFLICT' ||
    code === 'ASSET_LOCATION_OPEN_INTERVAL_CONFLICT' ||
    code === 'ASSET_LOCATION_OVERLAP' ||
    code === 'TENANCY_ASSET_ALREADY_ASSIGNED' ||
    code === 'COST_ALREADY_REVERSED' ||
    code === 'COST_REPLACEMENT_ALREADY_USED' ||
    code === 'COST_REPLACEMENT_ALREADY_REVERSED' ||
    code === 'MAINTENANCE_FINDING_ALREADY_LINKED' ||
    code === 'MAINTENANCE_SERVICE_EVENT_ALREADY_LINKED' ||
    code === 'ACCESS_ITEM_TRANSACTION_CONFLICT' ||
    code === 'ACCESS_ITEM_NOT_AVAILABLE' ||
    code === 'ACCESS_ITEM_RETIRED' ||
    code === 'ACCESS_ITEM_ALREADY_RETIRED' ||
    code === 'METER_ALREADY_RETIRED'
  ) {
    return 409;
  }
  return 422;
}

export function createPortfolioHttpHandler(
  deps: PortfolioHttpDependencies,
  options: PortfolioHttpOptions = {},
): Handler {
  const basePath = normalizeBasePath(options.basePath);

  return async (request, identity) => {
    try {
      const path = routePath(request, basePath);
      if (path === null) {
        return errorResponse('NOT_FOUND', 'Route not found.', 404);
      }

      if (!identity) {
        return errorResponse(
          'UNAUTHORIZED',
          'Authentication is required.',
          401,
        );
      }

      const actor = await resolveActor(deps.userAccessRepository, identity);

      const handlers = [
        () =>
          handleReportingHttp(
            {
              reportingRepository: deps.reportingRepository,
              portfolioRepository: deps.portfolioRepository,
            },
            actor,
            request,
            path,
          ),
        () =>
          handleUnitTimelineHttp(
            {
              portfolioRepository: deps.portfolioRepository,
              unitTimelineRepository: deps.unitTimelineRepository,
            },
            actor,
            request,
            path,
          ),
        () =>
          handleMeterHttp(
            {
              meterRepository: deps.meterRepository,
              portfolioRepository: deps.portfolioRepository,
              tenancyRepository: deps.tenancyRepository,
              idGenerator: deps.idGenerator,
              clock: deps.clock,
            },
            actor,
            request,
            path,
          ),
        () =>
          handleAccessItemHttp(
            {
              accessItemRepository: deps.accessItemRepository,
              portfolioRepository: deps.portfolioRepository,
              tenancyRepository: deps.tenancyRepository,
              idGenerator: deps.idGenerator,
              clock: deps.clock,
            },
            actor,
            request,
            path,
          ),
        () =>
          handleMaintenanceHttp(
            {
              maintenanceRepository: deps.maintenanceRepository,
              portfolioRepository: deps.portfolioRepository,
              assetRepository: deps.assetRepository,
              assetServiceRepository: deps.assetServiceRepository,
              inspectionRepository: deps.inspectionRepository,
              partyRepository: deps.partyRepository,
              staffDirectoryRepository: deps.staffDirectoryRepository,
              idGenerator: deps.idGenerator,
              clock: deps.clock,
            },
            actor,
            request,
            path,
          ),
        () =>
          handleCostHttp(
            {
              costRepository: deps.costRepository,
              portfolioRepository: deps.portfolioRepository,
              partyRepository: deps.partyRepository,
              assetRepository: deps.assetRepository,
              assetServiceRepository: deps.assetServiceRepository,
              improvementRepository: deps.improvementRepository,
              maintenanceRepository: deps.maintenanceRepository,
              idGenerator: deps.idGenerator,
              clock: deps.clock,
            },
            actor,
            request,
            path,
          ),
        () =>
          handleImprovementHttp(
            {
              improvementRepository: deps.improvementRepository,
              portfolioRepository: deps.portfolioRepository,
              partyRepository: deps.partyRepository,
              assetRepository: deps.assetRepository,
              idGenerator: deps.idGenerator,
              clock: deps.clock,
            },
            actor,
            request,
            path,
          ),
        () =>
          handleAssetServiceHttp(
            {
              assetRepository: deps.assetRepository,
              assetServiceRepository: deps.assetServiceRepository,
              partyRepository: deps.partyRepository,
              idGenerator: deps.idGenerator,
              clock: deps.clock,
            },
            actor,
            request,
            path,
          ),
        () =>
          handleAssetHttp(
            {
              assetRepository: deps.assetRepository,
              assetInventoryRepository: deps.assetInventoryRepository,
              portfolioRepository: deps.portfolioRepository,
              tenancyRepository: deps.tenancyRepository,
              idGenerator: deps.idGenerator,
              clock: deps.clock,
            },
            actor,
            request,
            path,
          ),
        () =>
          handleInspectionHttp(
            {
              inspectionRepository: deps.inspectionRepository,
              documentRepository: deps.documentRepository,
              fileStorage: deps.fileStorage,
              partyRepository: deps.partyRepository,
              ownershipRepository: deps.ownershipRepository,
              portfolioRepository: deps.portfolioRepository,
              tenancyRepository: deps.tenancyRepository,
              staffDirectoryRepository: deps.staffDirectoryRepository,
              idGenerator: deps.idGenerator,
              clock: deps.clock,
            },
            actor,
            request,
            path,
          ),
        () =>
          handleDocumentHttp(
            {
              documentRepository: deps.documentRepository,
              fileStorage: deps.fileStorage,
              clock: deps.clock,
              portfolioRepository: deps.portfolioRepository,
              partyRepository: deps.partyRepository,
              tenancyRepository: deps.tenancyRepository,
              leaseRepository: deps.leaseRepository,
              idGenerator: deps.idGenerator,
            },
            actor,
            request,
            path,
          ),
        () =>
          handlePortfolioHttp(
            {
              portfolioRepository: deps.portfolioRepository,
              idGenerator: deps.idGenerator,
            },
            actor,
            request,
            path,
          ),
        () =>
          handlePartyHttp(
            {
              partyRepository: deps.partyRepository,
              idGenerator: deps.idGenerator,
            },
            actor,
            request,
            path,
          ),
        () =>
          handleOwnershipHttp(
            {
              portfolioRepository: deps.portfolioRepository,
              partyRepository: deps.partyRepository,
              ownershipRepository: deps.ownershipRepository,
              idGenerator: deps.idGenerator,
            },
            actor,
            request,
            path,
          ),
        () =>
          handleLeaseHttp(
            {
              leaseRepository: deps.leaseRepository,
              tenancyRepository: deps.tenancyRepository,
              partyRepository: deps.partyRepository,
              idGenerator: deps.idGenerator,
            },
            actor,
            request,
            path,
          ),
        () =>
          handleTenancyHttp(
            {
              tenancyRepository: deps.tenancyRepository,
              portfolioRepository: deps.portfolioRepository,
              partyRepository: deps.partyRepository,
              idGenerator: deps.idGenerator,
            },
            actor,
            request,
            path,
          ),
      ];

      for (const handle of handlers) {
        const response = await handle();
        if (response) return response;
      }

      return errorResponse('NOT_FOUND', 'Route not found.', 404);
    } catch (error) {
      if (error instanceof ApplicationError || error instanceof DomainError) {
        return errorResponse(
          error.code,
          error.message,
          errorStatus(error.code),
        );
      }

      deps.onUnexpectedError?.(error);
      return errorResponse(
        'INTERNAL_ERROR',
        'An unexpected error occurred.',
        500,
      );
    }
  };
}
