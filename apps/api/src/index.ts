import { createSupabaseContext } from '@supabase/server';
import postgres from 'postgres';
import type { FileStoragePort, PdfPort } from '@portfolio/application';
import { createPortfolioHttpHandler } from '@portfolio/http';
import {
  PostgresAccessItemRepository,
  PostgresAssetInventoryRepository,
  PostgresAssetRepository,
  PostgresAssetServiceRepository,
  PostgresCostRepository,
  PostgresDocumentRepository,
  PostgresImprovementRepository,
  PostgresInspectionRepository,
  PostgresLeaseRepository,
  PostgresMaintenanceRepository,
  PostgresMeterRepository,
  PostgresOwnershipRepository,
  PostgresPartyRepository,
  PostgresPortfolioRepository,
  PostgresReportingRepository,
  PostgresTenancyRepository,
  PostgresUnitTimelineRepository,
  PostgresUserAccessRepository,
  SystemClock,
  WebCryptoIdGenerator,
} from '@portfolio/infrastructure';

export interface SupabaseApiConfig {
  readonly databaseUrl: string;
  readonly fileStorage: FileStoragePort;
  readonly pdfPort: PdfPort;
  readonly basePath?: string;
}

export interface SupabaseApi {
  fetch(request: Request): Promise<Response>;
  close(): Promise<void>;
}

export function createSupabaseApi(config: SupabaseApiConfig): SupabaseApi {
  const sql = postgres(config.databaseUrl, {
    max: 1,
    prepare: false,
    ssl: 'require',
  });

  const portfolioRepository = new PostgresPortfolioRepository(sql);
  const reportingRepository = new PostgresReportingRepository(sql);
  const accessItemRepository = new PostgresAccessItemRepository(sql);
  const assetRepository = new PostgresAssetRepository(sql);
  const assetInventoryRepository = new PostgresAssetInventoryRepository(sql);
  const assetServiceRepository = new PostgresAssetServiceRepository(sql);
  const partyRepository = new PostgresPartyRepository(sql);
  const ownershipRepository = new PostgresOwnershipRepository(sql);
  const leaseRepository = new PostgresLeaseRepository(sql);
  const tenancyRepository = new PostgresTenancyRepository(sql);
  const userAccessRepository = new PostgresUserAccessRepository(sql);
  const documentRepository = new PostgresDocumentRepository(sql);
  const costRepository = new PostgresCostRepository(sql);
  const inspectionRepository = new PostgresInspectionRepository(sql);
  const improvementRepository = new PostgresImprovementRepository(sql);
  const maintenanceRepository = new PostgresMaintenanceRepository(sql);
  const meterRepository = new PostgresMeterRepository(sql);
  const unitTimelineRepository = new PostgresUnitTimelineRepository(sql);

  const applicationHandler = createPortfolioHttpHandler(
    {
      accessItemRepository,
      assetRepository,
      assetInventoryRepository,
      assetServiceRepository,
      portfolioRepository,
      reportingRepository,
      partyRepository,
      ownershipRepository,
      tenancyRepository,
      leaseRepository,
      documentRepository,
      inspectionRepository,
      improvementRepository,
      costRepository,
      maintenanceRepository,
      meterRepository,
      unitTimelineRepository,
      staffDirectoryRepository: userAccessRepository,
      fileStorage: config.fileStorage,
      pdfPort: config.pdfPort,
      clock: new SystemClock(),
      userAccessRepository,
      idGenerator: new WebCryptoIdGenerator(),
      onUnexpectedError: (error) => {
        console.error('Unhandled Portfolio API error', error);
      },
    },
    { basePath: config.basePath ?? '/functions/v1/api' },
  );

  return {
    async fetch(request: Request): Promise<Response> {
      const { data: context, error } = await createSupabaseContext(request, {
        auth: 'user',
      });

      if (error) {
        return Response.json(
          {
            error: {
              code: error.code || 'UNAUTHORIZED',
              message: error.message || 'Authentication failed.',
            },
          },
          { status: error.status || 401 },
        );
      }

      const subject = context.jwtClaims?.sub;
      if (typeof subject !== 'string' || subject.length === 0) {
        return Response.json(
          { error: { code: 'UNAUTHORIZED', message: 'Authenticated user has no subject claim.' } },
          { status: 401 },
        );
      }

      return applicationHandler(request, {
        provider: 'supabase',
        subject,
      });
    },

    async close(): Promise<void> {
      await sql.end();
    },
  };
}
