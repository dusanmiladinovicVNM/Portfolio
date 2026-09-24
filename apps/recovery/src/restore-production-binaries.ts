import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import postgres from 'postgres';
import {
  asDocumentId,
  asDocumentVersionId,
} from '@portfolio/domain';
import {
  PostgresDocumentRepository,
  WebCryptoSha256,
  restoreDocumentBinarySnapshot,
  type BinaryRecoverySnapshotItem,
} from '@portfolio/infrastructure';
import {
  GoogleDriveFileStorage,
  GoogleOAuthRefreshTokenProvider,
} from '@portfolio/google-drive';

function required(value: string | undefined, name: string): string {
  const trimmed = value?.trim();
  if (!trimmed) throw new Error(`${name} is required.`);
  return trimmed;
}

interface SnapshotManifest {
  readonly format?: unknown;
  readonly objectCount?: unknown;
  readonly totalBytes?: unknown;
  readonly objects?: unknown;
}

function snapshotItems(value: unknown): readonly BinaryRecoverySnapshotItem[] {
  if (!Array.isArray(value)) {
    throw new Error('Binary recovery manifest objects must be an array.');
  }

  return value.map((raw, index) => {
    if (!raw || typeof raw !== 'object') {
      throw new Error(`Binary recovery manifest item ${index} is invalid.`);
    }
    const item = raw as Record<string, unknown>;
    const stringField = (name: string): string => {
      const field = item[name];
      if (typeof field !== 'string' || field.length === 0) {
        throw new Error(
          `Binary recovery manifest item ${index} has invalid ${name}.`,
        );
      }
      return field;
    };

    const byteSize = item.byteSize;
    if (
      typeof byteSize !== 'number' ||
      !Number.isInteger(byteSize) ||
      byteSize <= 0
    ) {
      throw new Error(
        `Binary recovery manifest item ${index} has invalid byteSize.`,
      );
    }

    return {
      versionId: asDocumentVersionId(stringField('versionId')),
      documentId: asDocumentId(stringField('documentId')),
      fileName: stringField('fileName'),
      mimeType: stringField('mimeType'),
      byteSize,
      sha256: stringField('sha256'),
      provider: stringField('provider'),
      objectId: stringField('objectId'),
      objectKey: stringField('objectKey'),
    };
  });
}

const snapshotDir = required(
  process.env.PORTFOLIO_BINARY_SNAPSHOT_DIR,
  'PORTFOLIO_BINARY_SNAPSHOT_DIR',
);
const databaseUrl = required(
  process.env.PORTFOLIO_PRODUCTION_DB_URL,
  'PORTFOLIO_PRODUCTION_DB_URL',
);
const recoveryFolderId = required(
  process.env.PORTFOLIO_RECOVERY_GOOGLE_DRIVE_FOLDER_ID,
  'PORTFOLIO_RECOVERY_GOOGLE_DRIVE_FOLDER_ID',
);

const manifest = JSON.parse(
  await readFile(join(snapshotDir, 'manifest.json'), 'utf8'),
) as SnapshotManifest;

if (manifest.format !== 'portfolio-binary-snapshot-v1') {
  throw new Error('Unsupported binary recovery snapshot format.');
}

const items = snapshotItems(manifest.objects);
if (manifest.objectCount !== items.length) {
  throw new Error('Binary recovery manifest objectCount does not match objects.');
}

const declaredTotalBytes = items.reduce(
  (sum, item) => sum + item.byteSize,
  0,
);
if (manifest.totalBytes !== declaredTotalBytes) {
  throw new Error('Binary recovery manifest totalBytes does not match objects.');
}

const sql = postgres(databaseUrl, { max: 1 });

try {
  const documentRepository = new PostgresDocumentRepository(sql);
  const sha256 = new WebCryptoSha256();
  const recoveryStorage = new GoogleDriveFileStorage({
    folderId: recoveryFolderId,
    accessTokenProvider: new GoogleOAuthRefreshTokenProvider({
      clientId: required(
        process.env.PORTFOLIO_GOOGLE_CLIENT_ID,
        'PORTFOLIO_GOOGLE_CLIENT_ID',
      ),
      clientSecret: required(
        process.env.PORTFOLIO_GOOGLE_CLIENT_SECRET,
        'PORTFOLIO_GOOGLE_CLIENT_SECRET',
      ),
      refreshToken: required(
        process.env.PORTFOLIO_GOOGLE_REFRESH_TOKEN,
        'PORTFOLIO_GOOGLE_REFRESH_TOKEN',
      ),
    }),
  });

  const result = await restoreDocumentBinarySnapshot(
    {
      documentRepository,
      recoveryStorage,
      sha256,
      readContent: async (item) =>
        new Uint8Array(
          await readFile(
            join(snapshotDir, 'objects', `${item.versionId}.bin`),
          ),
        ),
    },
    items,
    process.env.PORTFOLIO_BINARY_RECOVERY_REASON?.trim() ||
      'restore immutable DocumentVersion from encrypted binary backup',
  );

  console.log(
    JSON.stringify({
      status: 'recovered',
      restored: result.restored,
      totalBytes: result.totalBytes,
    }),
  );
} finally {
  await sql.end();
}
