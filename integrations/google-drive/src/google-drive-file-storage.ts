import {
  DEFAULT_BUFFERED_DOCUMENT_BINARY_POLICY,
  type BufferedDocumentBinaryPolicy,
  type FileStoragePort,
  type FileStoragePutInput,
  type StorageObjectContent,
  type StorageObjectReference,
  type StoredFile,
} from '@portfolio/application';

export interface GoogleDriveAccessTokenProvider {
  getAccessToken(): Promise<string>;
}

export interface GoogleDriveFileStorageOptions {
  readonly folderId: string;
  readonly accessTokenProvider: GoogleDriveAccessTokenProvider;
  readonly fetchImpl?: typeof fetch;
  readonly cryptoImpl?: Crypto;
  readonly maxUploadBytes?: number;
}

interface DriveFile {
  id?: string;
  size?: string;
  sha256Checksum?: string;
  appProperties?: Record<string, string>;
}

interface DriveListResponse {
  files?: DriveFile[];
  nextPageToken?: string;
}

interface ResolvedDriveFile {
  readonly id: string;
  readonly byteSize: number;
  readonly sha256: string;
}


const PROVIDER = 'google-drive';

function required(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`${field} is required.`);
  }
  return normalized;
}

function positiveSafeInteger(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${field} must be a positive safe integer.`);
  }
  return value;
}

function driveSize(value: string | undefined): number {
  if (!value || !/^\d+$/.test(value)) {
    throw new Error('Google Drive object does not expose a valid byte size.');
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error('Google Drive object byte size is outside the supported range.');
  }
  return parsed;
}

function driveSha256(value: string | undefined): string {
  const normalized = value?.toLowerCase();
  if (!normalized || !/^[0-9a-f]{64}$/.test(normalized)) {
    throw new Error(
      'Google Drive object does not expose a valid SHA-256 checksum.',
    );
  }
  return normalized;
}

function resolveDriveFile(
  file: DriveFile,
  objectKey: string,
  expected?: {
    readonly byteSize: number;
    readonly sha256: string;
  },
): ResolvedDriveFile {
  if (!file.id) {
    throw new Error('Google Drive returned a file without an id.');
  }
  if (file.appProperties?.portfolioObjectKey !== objectKey) {
    throw new Error(
      'Google Drive object metadata does not match the Portfolio object key.',
    );
  }

  const byteSize = driveSize(file.size);
  const sha256 = driveSha256(file.sha256Checksum);

  if (
    expected &&
    (byteSize !== expected.byteSize ||
      sha256 !== expected.sha256.toLowerCase())
  ) {
    throw new Error(
      'Google Drive object key already exists with different content.',
    );
  }

  return {
    id: file.id,
    byteSize,
    sha256,
  };
}

function escapeDriveQueryValue(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll("'", "\\'");
}

function concatBytes(parts: readonly Uint8Array[]): Uint8Array {
  const length = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.byteLength;
  }
  return result;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

async function sha256Hex(
  cryptoImpl: Crypto,
  content: Uint8Array,
): Promise<string> {
  const digest = await cryptoImpl.subtle.digest(
    'SHA-256',
    toArrayBuffer(content),
  );

  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function readBodyBounded(
  response: Response,
  maxBytes: number,
): Promise<Uint8Array> {
  const announcedLength = response.headers.get('content-length');
  if (announcedLength !== null) {
    const parsedLength = Number(announcedLength);
    if (Number.isFinite(parsedLength) && parsedLength > maxBytes) {
      try {
        await response.body?.cancel('buffered read limit exceeded');
      } catch {}
      throw new Error('Google Drive response exceeds buffered read limit.');
    }
  }

  if (!response.body) return new Uint8Array();

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value || value.byteLength === 0) continue;

      total += value.byteLength;
      if (total > maxBytes) {
        try {
          await reader.cancel('buffered read limit exceeded');
        } catch {}
        throw new Error('Google Drive response exceeds buffered read limit.');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  return concatBytes(chunks);
}

async function requireOk(response: Response): Promise<Response> {
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `Google Drive request failed with HTTP ${response.status}: ${detail.slice(0, 500)}`,
    );
  }
  return response;
}

async function readJson<T>(response: Response): Promise<T> {
  await requireOk(response);
  return await response.json() as T;
}

function resumableSessionUrl(response: Response): string {
  const location = response.headers.get('location');
  if (!location) {
    throw new Error(
      'Google Drive resumable upload did not return a session URL.',
    );
  }

  let url: URL;
  try {
    url = new URL(location);
  } catch {
    throw new Error(
      'Google Drive resumable upload returned an invalid session URL.',
    );
  }

  if (url.protocol !== 'https:' || url.hostname !== 'www.googleapis.com') {
    throw new Error(
      'Google Drive resumable upload returned an unexpected session origin.',
    );
  }

  return url.toString();
}

const MAX_RESUMABLE_RECOVERY_ATTEMPTS = 3;

function isAmbiguousDriveUploadResponse(response: Response): boolean {
  return response.status >= 500 && response.status <= 599;
}

function resumableConfirmedOffset(response: Response, totalBytes: number): number {
  if (response.status !== 308) {
    throw new Error(
      `Google Drive resumable status query returned unexpected HTTP ${response.status}.`,
    );
  }

  const range = response.headers.get('range');
  if (range === null) return 0;

  const match = /^bytes=0-(\d+)$/.exec(range.trim());
  if (!match) {
    throw new Error(
      'Google Drive resumable status query returned an invalid Range header.',
    );
  }

  const lastReceivedByte = Number(match[1]);
  if (
    !Number.isSafeInteger(lastReceivedByte) ||
    lastReceivedByte < 0 ||
    lastReceivedByte >= totalBytes
  ) {
    throw new Error(
      'Google Drive resumable status query returned an impossible byte range.',
    );
  }

  return lastReceivedByte + 1;
}

async function queryResumableUploadStatus(
  fetchImpl: typeof fetch,
  sessionUrl: string,
  token: string,
  totalBytes: number,
): Promise<Response> {
  return await fetchImpl(sessionUrl, {
    method: 'PUT',
    headers: {
      authorization: `Bearer ${token}`,
      'content-length': '0',
      'content-range': `bytes */${totalBytes}`,
    },
  });
}

async function putResumableRange(
  fetchImpl: typeof fetch,
  sessionUrl: string,
  token: string,
  mimeType: string,
  content: Uint8Array,
  offset: number,
): Promise<Response> {
  const remaining = content.subarray(offset);
  const headers: Record<string, string> = {
    authorization: `Bearer ${token}`,
    'content-length': String(remaining.byteLength),
    'content-type': mimeType,
  };

  if (offset > 0) {
    headers['content-range'] =
      `bytes ${offset}-${content.byteLength - 1}/${content.byteLength}`;
  }

  return await fetchImpl(sessionUrl, {
    method: 'PUT',
    headers,
    body: toArrayBuffer(remaining),
  });
}

async function completeResumableUpload(
  fetchImpl: typeof fetch,
  sessionUrl: string,
  token: string,
  mimeType: string,
  content: Uint8Array,
): Promise<DriveFile> {
  let nextOffset = 0;
  let recoveryAttempts = 0;

  while (true) {
    let response: Response | null = null;
    let ambiguous = false;

    try {
      response = await putResumableRange(
        fetchImpl,
        sessionUrl,
        token,
        mimeType,
        content,
        nextOffset,
      );
      ambiguous = isAmbiguousDriveUploadResponse(response);
    } catch {
      ambiguous = true;
    }

    if (response && (response.status === 200 || response.status === 201)) {
      return await readJson<DriveFile>(response);
    }

    if (!ambiguous) {
      if (response?.status === 308) {
        nextOffset = resumableConfirmedOffset(response, content.byteLength);
        continue;
      }
      if (response) await requireOk(response);
      throw new Error('Google Drive resumable upload failed unexpectedly.');
    }

    recoveryAttempts += 1;
    if (recoveryAttempts > MAX_RESUMABLE_RECOVERY_ATTEMPTS) {
      throw new Error(
        'Google Drive resumable upload outcome remains ambiguous after recovery attempts.',
      );
    }

    let statusResponse: Response;
    try {
      statusResponse = await queryResumableUploadStatus(
        fetchImpl,
        sessionUrl,
        token,
        content.byteLength,
      );
    } catch {
      continue;
    }

    if (statusResponse.status === 200 || statusResponse.status === 201) {
      return await readJson<DriveFile>(statusResponse);
    }

    if (statusResponse.status === 308) {
      nextOffset = resumableConfirmedOffset(
        statusResponse,
        content.byteLength,
      );
      continue;
    }

    if (isAmbiguousDriveUploadResponse(statusResponse)) {
      continue;
    }

    await requireOk(statusResponse);
  }
}

export class GoogleDriveFileStorage implements FileStoragePort {
  private readonly folderId: string;
  private readonly accessTokenProvider: GoogleDriveAccessTokenProvider;
  private readonly fetchImpl: typeof fetch;
  private readonly cryptoImpl: Crypto;
  private readonly maxUploadBytes: number;

  constructor(options: GoogleDriveFileStorageOptions) {
    this.folderId = required(options.folderId, 'folderId');
    this.accessTokenProvider = options.accessTokenProvider;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.cryptoImpl = options.cryptoImpl ?? crypto;
    this.maxUploadBytes = positiveSafeInteger(
      options.maxUploadBytes ??
        DEFAULT_BUFFERED_DOCUMENT_BINARY_POLICY.maxBytes,
      'maxUploadBytes',
    );
  }

  async put(input: FileStoragePutInput): Promise<StoredFile> {
    const objectKey = required(input.objectKey, 'objectKey');
    const fileName = required(input.fileName, 'fileName');
    const mimeType = required(input.mimeType, 'mimeType').toLowerCase();

    if (input.content.byteLength === 0) {
      throw new Error(
        'Google Drive storage does not accept empty document content.',
      );
    }
    if (input.content.byteLength > this.maxUploadBytes) {
      throw new Error('Google Drive upload exceeds buffered write limit.');
    }

    const sha256 = await sha256Hex(this.cryptoImpl, input.content);
    const expected = {
      byteSize: input.content.byteLength,
      sha256,
    };
    const token = await this.accessTokenProvider.getAccessToken();

    const existing = await this.resolveObjectKey(
      token,
      objectKey,
      expected,
    );
    if (existing) {
      return {
        provider: PROVIDER,
        objectId: existing.id,
        objectKey,
        byteSize: existing.byteSize,
        sha256: existing.sha256,
        disposition: 'reused',
      };
    }

    const metadata = JSON.stringify({
      name: fileName,
      parents: [this.folderId],
      appProperties: {
        portfolioObjectKey: objectKey,
        portfolioSha256: sha256,
      },
    });

    const initiationUrl = new URL(
      'https://www.googleapis.com/upload/drive/v3/files',
    );
    initiationUrl.searchParams.set('uploadType', 'resumable');
    initiationUrl.searchParams.set('supportsAllDrives', 'true');
    initiationUrl.searchParams.set(
      'fields',
      'id,size,sha256Checksum,appProperties',
    );

    const initiationResponse = await requireOk(
      await this.fetchImpl(initiationUrl, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json; charset=UTF-8',
          'x-upload-content-length': String(input.content.byteLength),
          'x-upload-content-type': mimeType,
        },
        body: metadata,
      }),
    );
    const sessionUrl = resumableSessionUrl(initiationResponse);

    // Start with one complete bounded PUT. If its outcome is ambiguous,
    // reconcile the same resumable session before sending anything else.
    // A 308 response identifies the exact confirmed prefix, so only the
    // remaining suffix is retried and no second Drive create is initiated.
    const created = await completeResumableUpload(
      this.fetchImpl,
      sessionUrl,
      token,
      mimeType,
      input.content,
    );

    const createdFile = resolveDriveFile(
      created,
      objectKey,
      expected,
    );

    return {
      provider: PROVIDER,
      objectId: createdFile.id,
      objectKey,
      byteSize: createdFile.byteSize,
      sha256: createdFile.sha256,
      disposition: 'created',
    };
  }

  async stat(reference: StorageObjectReference) {
    if (reference.provider !== PROVIDER) {
      throw new Error(
        `GoogleDriveFileStorage cannot inspect provider '${reference.provider}'.`,
      );
    }

    const token = await this.accessTokenProvider.getAccessToken();
    const file = await this.getById(token, reference.objectId);
    if (!file) return null;

    const resolved = resolveDriveFile(file, reference.objectKey);
    return {
      ...reference,
      byteSize: resolved.byteSize,
      sha256: resolved.sha256,
    };
  }

  async read(
    reference: StorageObjectReference,
    policy: BufferedDocumentBinaryPolicy,
  ): Promise<StorageObjectContent | null> {
    const metadata = await this.stat(reference);
    if (!metadata) return null;
    if (metadata.byteSize > policy.maxBytes) {
      throw new Error('Google Drive object exceeds buffered read limit.');
    }

    const token = await this.accessTokenProvider.getAccessToken();
    const url = new URL(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(reference.objectId)}`,
    );
    url.searchParams.set('alt', 'media');
    url.searchParams.set('supportsAllDrives', 'true');

    const response = await this.fetchImpl(url, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (response.status === 404) return null;
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(
        `Google Drive download failed with HTTP ${response.status}: ${detail.slice(0, 500)}`,
      );
    }

    const content = await readBodyBounded(response, policy.maxBytes);
    const sha256 = await sha256Hex(this.cryptoImpl, content);
    if (
      metadata.byteSize !== content.byteLength ||
      metadata.sha256 !== sha256
    ) {
      throw new Error(
        'Google Drive downloaded content does not match file metadata.',
      );
    }

    return {
      ...reference,
      byteSize: content.byteLength,
      sha256,
      content,
    };
  }

  async remove(reference: StorageObjectReference): Promise<void> {
    if (reference.provider !== PROVIDER) {
      throw new Error(
        `GoogleDriveFileStorage cannot remove provider '${reference.provider}'.`,
      );
    }

    const token = await this.accessTokenProvider.getAccessToken();
    const file = await this.getById(token, reference.objectId);
    if (!file) return;

    // Refuse to delete a Drive id whose Portfolio object identity no longer
    // matches the reference supplied by canonical metadata.
    resolveDriveFile(file, reference.objectKey);
    await this.deleteById(token, reference.objectId);
  }

  private async getById(
    token: string,
    objectId: string,
  ): Promise<DriveFile | null> {
    const url = new URL(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(objectId)}`,
    );
    url.searchParams.set('supportsAllDrives', 'true');
    url.searchParams.set('fields', 'id,size,sha256Checksum,appProperties');

    const response = await this.fetchImpl(url, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (response.status === 404) return null;
    return readJson<DriveFile>(response);
  }

  private async deleteById(
    token: string,
    objectId: string,
  ): Promise<void> {
    const url = new URL(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(objectId)}`,
    );
    url.searchParams.set('supportsAllDrives', 'true');

    const response = await this.fetchImpl(url, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${token}` },
    });

    if (!response.ok && response.status !== 404) {
      const detail = await response.text();
      throw new Error(
        `Google Drive delete failed with HTTP ${response.status}: ${detail.slice(0, 500)}`,
      );
    }
  }

  private async listByObjectKey(
    token: string,
    objectKey: string,
  ): Promise<readonly DriveFile[]> {
    const q =
      `'${escapeDriveQueryValue(this.folderId)}' in parents and trashed = false and ` +
      `appProperties has { key='portfolioObjectKey' and value='${escapeDriveQueryValue(objectKey)}' }`;

    const url = new URL('https://www.googleapis.com/drive/v3/files');
    url.searchParams.set('q', q);
    url.searchParams.set('spaces', 'drive');
    url.searchParams.set('pageSize', '100');
    url.searchParams.set('supportsAllDrives', 'true');
    url.searchParams.set('includeItemsFromAllDrives', 'true');
    url.searchParams.set(
      'fields',
      'nextPageToken,files(id,size,sha256Checksum,appProperties)',
    );

    const result = await readJson<DriveListResponse>(
      await this.fetchImpl(url, {
        headers: { authorization: `Bearer ${token}` },
      }),
    );

    if (result.nextPageToken) {
      throw new Error(
        'Google Drive contains too many files for one Portfolio object key; manual reconciliation is required.',
      );
    }

    return result.files ?? [];
  }

  private async resolveObjectKey(
    token: string,
    objectKey: string,
    expected: {
      readonly byteSize: number;
      readonly sha256: string;
    },
  ): Promise<ResolvedDriveFile | null> {
    const files = await this.listByObjectKey(token, objectKey);
    if (files.length === 0) return null;
    if (files.length > 1) {
      throw new Error(
        'Google Drive contains multiple files for the same Portfolio object key; canonical database reconciliation is required.',
      );
    }

    return resolveDriveFile(files[0]!, objectKey, expected);
  }
}
