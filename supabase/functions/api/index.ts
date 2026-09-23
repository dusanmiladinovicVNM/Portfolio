import { createSupabaseApi } from '@portfolio/api';
import {
  GoogleDriveFileStorage,
  GoogleOAuthRefreshTokenProvider,
} from '@portfolio/google-drive';
import { CanonicalInspectionPdfRenderer } from '@portfolio/pdf';
import { createCorsHandler } from './cors.ts';
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
  serviceVersion: config.releaseSha,
  ...(config.readinessTimeoutMs === undefined
    ? {}
    : { readinessTimeoutMs: config.readinessTimeoutMs }),
});

Deno.serve(
  createCorsHandler(config.webOrigin, (request) => api.fetch(request)),
);
