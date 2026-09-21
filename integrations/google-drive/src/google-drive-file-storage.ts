import type {
  FileStoragePort,
  FileStoragePutInput,
  StorageObjectContent,
  StorageObjectReference,
  StoredFile,
} from '@portfolio/application';

export interface GoogleDriveAccessTokenProvider {
  getAccessToken(): Promise<string>;
}

export interface GoogleDriveFileStorageOptions {
  readonly folderId: string;
  readonly accessTokenProvider: GoogleDriveAccessTokenProvider;
  readonly fetchImpl?: typeof fetch;
  readonly cryptoImpl?: Crypto;
}

interface DriveFile {
  id?: string;
  size?: string;
  sha256Checksum?: string;
  appProperties?: Record<string, string>;
}

interface DriveListResponse {
  files?: DriveFile[];
}

const PROVIDER = 'google-drive';

function required(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`${field} is required.`);
  }
  return normalized;
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

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `Google Drive request failed with HTTP ${response.status}: ${detail.slice(0, 500)}`,
    );
  }
  return await response.json() as T;
}

export class GoogleDriveFileStorage implements FileStoragePort {
  private readonly folderId: string;
  private readonly accessTokenProvider: GoogleDriveAccessTokenProvider;
  private readonly fetchImpl: typeof fetch;
  private readonly cryptoImpl: Crypto;

  constructor(options: GoogleDriveFileStorageOptions) {
    this.folderId = required(options.folderId, 'folderId');
    this.accessTokenProvider = options.accessTokenProvider;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.cryptoImpl = options.cryptoImpl ?? crypto;
  }

  async put(input: FileStoragePutInput): Promise<StoredFile> {
    const objectKey = required(input.objectKey, 'objectKey');
    const fileName = required(input.fileName, 'fileName');
    const mimeType = required(input.mimeType, 'mimeType').toLowerCase();

    if (input.content.byteLength === 0) {
      throw new Error('Google Drive storage does not accept empty document content.');
    }

    const sha256 = await sha256Hex(this.cryptoImpl, input.content);
    const token = await this.accessTokenProvider.getAccessToken();
    const existing = await this.findByObjectKey(token, objectKey);

    if (existing) {
      if (existing.sha256Checksum !== sha256) {
        throw new Error(
          'Google Drive object key already exists with different content.',
        );
      }

      if (!existing.id) {
        throw new Error('Google Drive returned an existing file without an id.');
      }

      return {
        provider: PROVIDER,
        objectId: existing.id,
        objectKey,
        byteSize: Number(existing.size ?? input.content.byteLength),
        sha256,
        disposition: 'reused',
      };
    }

    const boundary = `portfolio_${sha256.slice(0, 24)}`;
    const encoder = new TextEncoder();
    const metadata = JSON.stringify({
      name: fileName,
      parents: [this.folderId],
      appProperties: {
        portfolioObjectKey: objectKey,
        portfolioSha256: sha256,
      },
    });

    const prefix = encoder.encode(
      `--${boundary}\r\n` +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      metadata +
      `\r\n--${boundary}\r\n` +
      `Content-Type: ${mimeType}\r\n\r\n`,
    );
    const suffix = encoder.encode(`\r\n--${boundary}--\r\n`);
    const body = concatBytes([prefix, input.content, suffix]);

    const url = new URL('https://www.googleapis.com/upload/drive/v3/files');
    url.searchParams.set('uploadType', 'multipart');
    url.searchParams.set('supportsAllDrives', 'true');
    url.searchParams.set(
      'fields',
      'id,name,mimeType,size,sha256Checksum,appProperties',
    );

    const created = await readJson<DriveFile>(
      await this.fetchImpl(url, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': `multipart/related; boundary=${boundary}`,
        },
        body: toArrayBuffer(body),
      }),
    );

    if (!created.id) {
      throw new Error('Google Drive upload succeeded without returning a file id.');
    }

    if (created.sha256Checksum && created.sha256Checksum !== sha256) {
      throw new Error('Google Drive SHA-256 checksum does not match uploaded content.');
    }

    return {
      provider: PROVIDER,
      objectId: created.id,
      objectKey,
      byteSize: Number(created.size ?? input.content.byteLength),
      sha256,
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
    const url = new URL(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(reference.objectId)}`,
    );
    url.searchParams.set('supportsAllDrives', 'true');
    url.searchParams.set('fields', 'id,size,sha256Checksum,appProperties');

    const response = await this.fetchImpl(url, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (response.status === 404) return null;

    const file = await readJson<DriveFile>(response);
    if (file.appProperties?.portfolioObjectKey !== reference.objectKey) {
      throw new Error(
        'Google Drive object metadata does not match the Portfolio object key.',
      );
    }

    const sha256 = file.sha256Checksum?.toLowerCase();
    if (!sha256 || !/^[0-9a-f]{64}$/.test(sha256)) {
      throw new Error(
        'Google Drive object does not expose a valid SHA-256 checksum.',
      );
    }

    return {
      ...reference,
      byteSize: Number(file.size ?? 0),
      sha256,
    };
  }

  async read(
    reference: StorageObjectReference,
  ): Promise<StorageObjectContent | null> {
    const metadata = await this.stat(reference);
    if (!metadata) return null;

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

    const content = new Uint8Array(await response.arrayBuffer());
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
    const url = new URL(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(reference.objectId)}`,
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

  private async findByObjectKey(
    token: string,
    objectKey: string,
  ): Promise<DriveFile | null> {
    const q =
      `'${escapeDriveQueryValue(this.folderId)}' in parents and trashed = false and ` +
      `appProperties has { key='portfolioObjectKey' and value='${escapeDriveQueryValue(objectKey)}' }`;

    const url = new URL('https://www.googleapis.com/drive/v3/files');
    url.searchParams.set('q', q);
    url.searchParams.set('spaces', 'drive');
    url.searchParams.set('pageSize', '2');
    url.searchParams.set('supportsAllDrives', 'true');
    url.searchParams.set('includeItemsFromAllDrives', 'true');
    url.searchParams.set(
      'fields',
      'files(id,name,mimeType,size,sha256Checksum,appProperties)',
    );

    const result = await readJson<DriveListResponse>(
      await this.fetchImpl(url, {
        headers: { authorization: `Bearer ${token}` },
      }),
    );

    const files = result.files ?? [];
    if (files.length > 1) {
      throw new Error(
        'Google Drive contains multiple files for the same Portfolio object key.',
      );
    }

    return files[0] ?? null;
  }
}
