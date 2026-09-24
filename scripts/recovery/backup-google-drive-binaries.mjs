import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

function required(value, name) {
  const trimmed = value?.trim();
  if (!trimmed) throw new Error(`${name} is required.`);
  return trimmed;
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function assertCanonicalItem(item) {
  for (const field of [
    'versionId',
    'documentId',
    'fileName',
    'mimeType',
    'sha256',
    'provider',
    'objectId',
    'objectKey',
  ]) {
    if (typeof item?.[field] !== 'string' || item[field].length === 0) {
      throw new Error(`Canonical binary item has invalid ${field}.`);
    }
  }
  if (item.provider !== 'google-drive') {
    throw new Error(`Unsupported canonical binary provider: ${item.provider}`);
  }
  if (!Number.isInteger(item.byteSize) || item.byteSize <= 0) {
    throw new Error('Canonical binary item has invalid byteSize.');
  }
  if (!/^[0-9a-f]{64}$/.test(item.sha256)) {
    throw new Error('Canonical binary item has invalid SHA-256.');
  }
  if (item.objectKey !== `document-version:${item.versionId}`) {
    throw new Error('Canonical binary objectKey does not match DocumentVersion identity.');
  }
}

async function getAccessToken() {
  const body = new URLSearchParams({
    client_id: required(process.env.PORTFOLIO_GOOGLE_CLIENT_ID, 'PORTFOLIO_GOOGLE_CLIENT_ID'),
    client_secret: required(process.env.PORTFOLIO_GOOGLE_CLIENT_SECRET, 'PORTFOLIO_GOOGLE_CLIENT_SECRET'),
    refresh_token: required(process.env.PORTFOLIO_GOOGLE_REFRESH_TOKEN, 'PORTFOLIO_GOOGLE_REFRESH_TOKEN'),
    grant_type: 'refresh_token',
  });

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!response.ok) {
    throw new Error(`Google OAuth refresh failed with HTTP ${response.status}.`);
  }
  const payload = await response.json();
  return required(payload.access_token, 'Google access_token');
}

async function driveMetadata(token, objectId) {
  const url = new URL(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(objectId)}`,
  );
  url.searchParams.set('supportsAllDrives', 'true');
  url.searchParams.set(
    'fields',
    'id,parents,size,sha256Checksum,appProperties,mimeType,name',
  );
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(
      `Google Drive metadata read failed for ${objectId} with HTTP ${response.status}.`,
    );
  }
  return response.json();
}

async function driveBytes(token, objectId) {
  const url = new URL(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(objectId)}`,
  );
  url.searchParams.set('alt', 'media');
  url.searchParams.set('supportsAllDrives', 'true');
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error(
      `Google Drive binary read failed for ${objectId} with HTTP ${response.status}.`,
    );
  }
  return new Uint8Array(await response.arrayBuffer());
}

function assertDriveMetadata(item, metadata, folderId) {
  if (!metadata) {
    throw new Error(`Canonical Drive object is missing: ${item.versionId}`);
  }
  if (metadata.id !== item.objectId) {
    throw new Error(`Drive objectId mismatch for ${item.versionId}.`);
  }
  if (!Array.isArray(metadata.parents) || !metadata.parents.includes(folderId)) {
    throw new Error(`Drive object is outside the configured Portfolio folder: ${item.versionId}`);
  }
  if (metadata.appProperties?.portfolioObjectKey !== item.objectKey) {
    throw new Error(`Drive objectKey mismatch for ${item.versionId}.`);
  }
  if (Number(metadata.size) !== item.byteSize) {
    throw new Error(`Drive byteSize mismatch for ${item.versionId}.`);
  }
  if (String(metadata.sha256Checksum ?? '').toLowerCase() !== item.sha256) {
    throw new Error(`Drive SHA-256 metadata mismatch for ${item.versionId}.`);
  }
}

async function verifySnapshotDirectory(snapshotDir) {
  const manifest = JSON.parse(
    await readFile(join(snapshotDir, 'manifest.json'), 'utf8'),
  );
  if (!Array.isArray(manifest.objects)) {
    throw new Error('Binary snapshot manifest has no objects array.');
  }

  let totalBytes = 0;
  for (const item of manifest.objects) {
    assertCanonicalItem(item);
    const path = join(snapshotDir, 'objects', `${item.versionId}.bin`);
    const bytes = await readFile(path);
    if (bytes.byteLength !== item.byteSize) {
      throw new Error(`Snapshot byteSize mismatch for ${item.versionId}.`);
    }
    if (sha256(bytes) !== item.sha256) {
      throw new Error(`Snapshot SHA-256 mismatch for ${item.versionId}.`);
    }
    totalBytes += bytes.byteLength;
  }

  if (manifest.objectCount !== manifest.objects.length) {
    throw new Error('Binary snapshot objectCount does not match manifest objects.');
  }
  if (manifest.totalBytes !== totalBytes) {
    throw new Error('Binary snapshot totalBytes does not match verified bytes.');
  }

  return {
    objectCount: manifest.objects.length,
    totalBytes,
  };
}

async function createSnapshot() {
  const canonicalPath = required(
    process.env.PORTFOLIO_BINARY_CANONICAL_JSON,
    'PORTFOLIO_BINARY_CANONICAL_JSON',
  );
  const snapshotDir = required(
    process.env.PORTFOLIO_BINARY_SNAPSHOT_DIR,
    'PORTFOLIO_BINARY_SNAPSHOT_DIR',
  );
  const folderId = required(
    process.env.PORTFOLIO_GOOGLE_DRIVE_FOLDER_ID,
    'PORTFOLIO_GOOGLE_DRIVE_FOLDER_ID',
  );
  const codeSha = required(
    process.env.PORTFOLIO_BACKUP_CODE_SHA,
    'PORTFOLIO_BACKUP_CODE_SHA',
  );

  const canonical = JSON.parse(await readFile(canonicalPath, 'utf8'));
  if (!Array.isArray(canonical)) {
    throw new Error('Canonical binary inventory must be a JSON array.');
  }

  await rm(snapshotDir, { recursive: true, force: true });
  await mkdir(join(snapshotDir, 'objects'), { recursive: true });

  const token = await getAccessToken();
  const objects = [];
  let totalBytes = 0;

  for (const item of canonical) {
    assertCanonicalItem(item);
    const metadata = await driveMetadata(token, item.objectId);
    assertDriveMetadata(item, metadata, folderId);

    const bytes = await driveBytes(token, item.objectId);
    if (bytes.byteLength !== item.byteSize) {
      throw new Error(`Downloaded byteSize mismatch for ${item.versionId}.`);
    }
    if (sha256(bytes) !== item.sha256) {
      throw new Error(`Downloaded SHA-256 mismatch for ${item.versionId}.`);
    }

    await writeFile(
      join(snapshotDir, 'objects', `${item.versionId}.bin`),
      bytes,
    );
    objects.push(item);
    totalBytes += bytes.byteLength;
  }

  const manifest = {
    format: 'portfolio-binary-snapshot-v1',
    createdAtUtc: new Date().toISOString(),
    codeSha,
    objectCount: objects.length,
    totalBytes,
    objects,
  };
  await writeFile(
    join(snapshotDir, 'manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n',
    'utf8',
  );

  return verifySnapshotDirectory(snapshotDir);
}

async function selfTest() {
  const root = await mkdtemp(join(tmpdir(), 'portfolio-binary-backup-'));
  try {
    const snapshotDir = join(root, 'snapshot');
    await mkdir(join(snapshotDir, 'objects'), { recursive: true });
    const bytes = Buffer.from('binary-proof');
    const versionId = '63000000-0000-4000-8000-000000000099';
    const item = {
      versionId,
      documentId: '63000000-0000-4000-8000-000000000098',
      fileName: 'proof.bin',
      mimeType: 'application/octet-stream',
      byteSize: bytes.byteLength,
      sha256: sha256(bytes),
      provider: 'google-drive',
      objectId: 'drive-proof',
      objectKey: `document-version:${versionId}`,
    };
    await writeFile(join(snapshotDir, 'objects', `${versionId}.bin`), bytes);
    await writeFile(
      join(snapshotDir, 'manifest.json'),
      JSON.stringify({
        format: 'portfolio-binary-snapshot-v1',
        createdAtUtc: '2026-09-24T00:00:00.000Z',
        codeSha: 'test-sha',
        objectCount: 1,
        totalBytes: bytes.byteLength,
        objects: [item],
      }),
    );

    await expectReject(async () => {
      assertDriveMetadata(
        item,
        {
          id: item.objectId,
          parents: ['wrong-folder'],
          size: String(item.byteSize),
          sha256Checksum: item.sha256,
          appProperties: { portfolioObjectKey: item.objectKey },
        },
        'expected-folder',
      );
    }, /outside the configured Portfolio folder/);

    assert.deepEqual(await verifySnapshotDirectory(snapshotDir), {
      objectCount: 1,
      totalBytes: bytes.byteLength,
    });

    await writeFile(
      join(snapshotDir, 'objects', `${versionId}.bin`),
      Buffer.from('tampered'),
    );
    await expectReject(
      () => verifySnapshotDirectory(snapshotDir),
      /Snapshot byteSize mismatch|Snapshot SHA-256 mismatch/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }

  console.log('Production binary backup self-test passed.');
}

async function expectReject(operation, pattern) {
  let thrown;
  try {
    await operation();
  } catch (error) {
    thrown = error;
  }
  assert.ok(thrown instanceof Error);
  assert.match(thrown.message, pattern);
}

const mode = process.argv[2];
if (mode === '--self-test') {
  await selfTest();
} else if (mode === '--verify') {
  const dir = required(process.argv[3], 'snapshot directory');
  const result = await verifySnapshotDirectory(dir);
  console.log(JSON.stringify(result));
} else if (!mode) {
  const result = await createSnapshot();
  console.log(JSON.stringify(result));
} else {
  throw new Error(`Unknown mode: ${basename(mode)}`);
}
