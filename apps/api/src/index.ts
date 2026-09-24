import { PostgresApiRateLimiter } from './api-rate-limit.js';
import { isPublicHealthRuntimePath } from './runtime-path.js';
import { createSupabaseContext } from '@supabase/server';
import postgres from 'postgres';
import type { FileStoragePort, PdfPort } from '@portfolio/application';
import {
  createObservedHttpHandler,
  createPortfolioHttpHandler,
  safeOperationalLog,
  type OperationalLogger,
} from '@portfolio/http';
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
  WebCryptoSha256,
} from '@portfolio/infrastructure';

export interface SupabaseApiConfig {
  readonly databaseUrl: string;
  readonly fileStorage: FileStoragePort;
  readonly pdfPort: PdfPort;
  readonly basePath?: string;
  readonly serviceVersion?: string;
  readonly readinessTimeoutMs?: number;
  readonly logger?: OperationalLogger;
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
  const apiRateLimiter = new PostgresApiRateLimiter(sql);

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

  const logger: OperationalLogger =
    config.logger ??
    {
      log(event) {
        const line = JSON.stringify({
          timestamp: new Date().toISOString(),
          service: 'portfolio-api',
          ...(config.serviceVersion === undefined
            ? {}
            : { releaseSha: config.serviceVersion }),
          ...event,
        });
        if (event.level === 'error') {
          console.error(line);
        } else if (event.level === 'warn') {
          console.warn(line);
        } else {
          console.info(line);
        }
      },
    };

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
      sha256: new WebCryptoSha256(),
      clock: new SystemClock(),
      userAccessRepository,
      idGenerator: new WebCryptoIdGenerator(),
      readinessCheck: async () => {
        await sql`select 1`;
        await sql`select 1 from public.api_rate_limit_buckets limit 0`;
        await sql`select 1 from public.document_version_storage_relocations limit 0`;
      },
      onUnexpectedError: (error, context) => {
        safeOperationalLog(logger, {
          level: 'error',
          event: 'http.unexpected_error',
          requestId: context.requestId,
          method: context.method,
          path: context.path,
          errorName: error instanceof Error ? error.name : 'UnknownError',
        });
      },
    },
    {
      basePath: config.basePath ?? '/functions/v1/api',
      ...(config.serviceVersion === undefined
        ? {}
        : { serviceVersion: config.serviceVersion }),
      ...(config.readinessTimeoutMs === undefined
        ? {}
        : { readinessTimeoutMs: config.readinessTimeoutMs }),
    },
  );

  const authenticatedHandler = async (request: Request): Promise<Response> => {
      const path = new URL(request.url).pathname;
      const basePath = config.basePath ?? '/functions/v1/api';

      if (isPublicHealthRuntimePath(path, basePath)) {
        return applicationHandler(request, null);
      }

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

      let rateLimit;
      try {
        rateLimit = await apiRateLimiter.consume(
          `supabase:${subject}`,
          request,
        );
      } catch (error) {
        safeOperationalLog(logger, {
          level: 'error',
          event: 'http.unexpected_error',
          requestId: request.headers.get('x-request-id'),
          method: request.method,
          path,
          errorName:
            error instanceof Error
              ? `RateLimitCheck:${error.name}`
              : 'RateLimitCheck:UnknownError',
        });
        return Response.json(
          {
            error: {
              code: 'RATE_LIMIT_CHECK_UNAVAILABLE',
              message: 'Request admission control is temporarily unavailable.',
            },
          },
          { status: 503 },
        );
      }

      if (!rateLimit.allowed) {
        return Response.json(
          {
            error: {
              code: 'RATE_LIMIT_EXCEEDED',
              message: 'Too many requests. Retry after the indicated delay.',
            },
          },
          {
            status: 429,
            headers: {
              'retry-after': String(rateLimit.retryAfterSeconds),
            },
          },
        );
      }

      return applicationHandler(request, {
        provider: 'supabase',
        subject,
      });
  };

  const observedHandler = createObservedHttpHandler(
    authenticatedHandler,
    logger,
  );

  return {
    fetch: observedHandler,

    async close(): Promise<void> {
      await sql.end();
    },
  };
}

export * from './canonical-inspection-pdf-renderer.js';

export * from './runtime-path.js';
