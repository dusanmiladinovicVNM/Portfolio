import { CanonicalInspectionPdfRenderer, createSupabaseApi } from '@portfolio/api';
import {
  GoogleDriveFileStorage,
  GoogleOAuthRefreshTokenProvider,
} from '@portfolio/google-drive';
import { PORTFOLIO_BUILD_SHA } from './build-info.ts';
import { createCorsHandler } from './cors.ts';
import { SUPABASE_FUNCTION_BASE_PATH } from './host-routing.ts';
import { readRuntimeConfig } from './runtime-config.ts';

const config = readRuntimeConfig(Deno.env);

const accessTokenProvider = new GoogleOAuthRefreshTokenProvider({
  clientId: config.googleClientId,
  clientSecret: config.googleClientSecret,
  refreshToken: config.googleRefreshToken,
});

const api = createSupabaseApi({
  databaseUrl: config.databaseUrl,
  fileStorage: new GoogleDriveFileStorage({
    folderId: config.googleDriveFolderId,
    accessTokenProvider,
  }),
  pdfPort: new CanonicalInspectionPdfRenderer(),
  basePath: SUPABASE_FUNCTION_BASE_PATH,
  serviceVersion: PORTFOLIO_BUILD_SHA,
  ...(config.readinessTimeoutMs === undefined
    ? {}
    : { readinessTimeoutMs: config.readinessTimeoutMs }),
});

const fetch = createCorsHandler(
  config.webOrigin,
  (request) => api.fetch(request),
);

export default { fetch };
