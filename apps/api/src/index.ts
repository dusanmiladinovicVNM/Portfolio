import { createSupabaseContext } from '@supabase/server';
import postgres from 'postgres';
import { createPortfolioHttpHandler } from '@portfolio/http';
import {
  PostgresPortfolioRepository,
  PostgresUserAccessRepository,
  WebCryptoIdGenerator,
} from '@portfolio/infrastructure';

export interface SupabaseApiConfig {
  readonly databaseUrl: string;
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
  const userAccessRepository = new PostgresUserAccessRepository(sql);

  const applicationHandler = createPortfolioHttpHandler(
    {
      portfolioRepository,
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
