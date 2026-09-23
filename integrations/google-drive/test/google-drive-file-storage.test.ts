import { describe, expect, it, vi } from 'vitest';
import { GoogleDriveFileStorage } from '../src/index.js';

const tokenProvider = {
  async getAccessToken() {
    return 'test-token';
  },
};

async function sha256(content: Uint8Array): Promise<string> {
  const copy = new Uint8Array(content.byteLength);
  copy.set(content);
  const digest = await crypto.subtle.digest('SHA-256', copy.buffer);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function driveFile(
  id: string,
  objectKey: string,
  content: Uint8Array,
  hash: string,
) {
  return {
    id,
    size: String(content.byteLength),
    sha256Checksum: hash,
    appProperties: { portfolioObjectKey: objectKey },
  };
}

describe('GoogleDriveFileStorage', () => {
  it('uses a resumable session and single PUT for the bounded upload contract', async () => {
    const content = new TextEncoder().encode('signed lease');
    const objectKey = 'document-version:123';
    const expectedHash = await sha256(content);
    const created = driveFile(
      'drive-file-1',
      objectKey,
      content,
      expectedHash,
    );
    const requests: Request[] = [];
    const sessionUrl =
      'https://www.googleapis.com/upload/drive/v3/files?upload_id=session-1';
    const storage = new GoogleDriveFileStorage({
      folderId: 'folder-1',
      accessTokenProvider: tokenProvider,
      fetchImpl: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);

        if (request.method === 'GET') {
          return Response.json({ files: [] });
        }
        if (request.method === 'POST') {
          return new Response(null, {
            status: 200,
            headers: { location: sessionUrl },
          });
        }
        if (request.method === 'PUT') {
          return Response.json(created);
        }

        throw new Error(`Unexpected request method ${request.method}`);
      },
    });

    const stored = await storage.put({
      objectKey,
      fileName: 'lease.pdf',
      mimeType: 'application/pdf',
      content,
    });

    expect(stored).toEqual({
      provider: 'google-drive',
      objectId: 'drive-file-1',
      objectKey,
      byteSize: content.byteLength,
      sha256: expectedHash,
      disposition: 'created',
    });
    expect(requests).toHaveLength(3);
    expect(requests[0]!.url).toContain('includeItemsFromAllDrives=true');

    expect(requests[1]!.url).toContain('uploadType=resumable');
    expect(requests[1]!.headers.get('authorization')).toBe(
      'Bearer test-token',
    );
    expect(requests[1]!.headers.get('content-type')).toContain(
      'application/json',
    );
    expect(requests[1]!.headers.get('x-upload-content-length')).toBe(
      String(content.byteLength),
    );
    expect(requests[1]!.headers.get('x-upload-content-type')).toBe(
      'application/pdf',
    );
    expect(await requests[1]!.json()).toMatchObject({
      name: 'lease.pdf',
      parents: ['folder-1'],
      appProperties: { portfolioObjectKey: objectKey },
    });

    expect(requests[2]!.url).toBe(sessionUrl);
    expect(requests[2]!.method).toBe('PUT');
    expect(requests[2]!.headers.get('content-length')).toBe(
      String(content.byteLength),
    );
    expect(requests[2]!.headers.get('content-type')).toBe(
      'application/pdf',
    );
    expect(new Uint8Array(await requests[2]!.arrayBuffer())).toEqual(
      content,
    );
  });

  it('is idempotent for the same object key and exact content identity', async () => {
    const content = new TextEncoder().encode('same content');
    const objectKey = 'document-version:stable';
    const expectedHash = await sha256(content);
    const fetchImpl = vi.fn(async () =>
      Response.json({
        files: [
          driveFile(
            'drive-existing',
            objectKey,
            content,
            expectedHash,
          ),
        ],
      }),
    );

    const storage = new GoogleDriveFileStorage({
      folderId: 'folder-1',
      accessTokenProvider: tokenProvider,
      fetchImpl: fetchImpl as typeof fetch,
    });

    const stored = await storage.put({
      objectKey,
      fileName: 'lease.pdf',
      mimeType: 'application/pdf',
      content,
    });

    expect(stored).toMatchObject({
      objectId: 'drive-existing',
      disposition: 'reused',
      byteSize: content.byteLength,
      sha256: expectedHash,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('rejects an object-key collision with different binary content', async () => {
    const incoming = new TextEncoder().encode('different');
    const objectKey = 'document-version:stable';

    const storage = new GoogleDriveFileStorage({
      folderId: 'folder-1',
      accessTokenProvider: tokenProvider,
      fetchImpl: async () =>
        Response.json({
          files: [
            driveFile(
              'drive-existing',
              objectKey,
              new Uint8Array(4),
              '0'.repeat(64),
            ),
          ],
        }),
    });

    await expect(
      storage.put({
        objectKey,
        fileName: 'lease.pdf',
        mimeType: 'application/pdf',
        content: incoming,
      }),
    ).rejects.toThrowError(/different content/);
  });

  it('fails closed on duplicate object keys even when their bytes match', async () => {
    const content = new TextEncoder().encode('same bytes');
    const objectKey = 'document-version:duplicate';
    const expectedHash = await sha256(content);

    const storage = new GoogleDriveFileStorage({
      folderId: 'folder-1',
      accessTokenProvider: tokenProvider,
      fetchImpl: async () =>
        Response.json({
          files: [
            driveFile('drive-b', objectKey, content, expectedHash),
            driveFile('drive-a', objectKey, content, expectedHash),
          ],
        }),
    });

    await expect(
      storage.put({
        objectKey,
        fileName: 'photo.jpg',
        mimeType: 'image/jpeg',
        content,
      }),
    ).rejects.toThrowError(/canonical database reconciliation is required/);
  });

  it('fails closed when duplicate object keys disagree on content identity', async () => {
    const content = new TextEncoder().encode('canonical');
    const objectKey = 'document-version:conflicting-duplicates';
    const expectedHash = await sha256(content);

    const storage = new GoogleDriveFileStorage({
      folderId: 'folder-1',
      accessTokenProvider: tokenProvider,
      fetchImpl: async () =>
        Response.json({
          files: [
            driveFile('drive-a', objectKey, content, expectedHash),
            {
              ...driveFile(
                'drive-b',
                objectKey,
                content,
                expectedHash,
              ),
              sha256Checksum: 'f'.repeat(64),
            },
          ],
        }),
    });

    await expect(
      storage.put({
        objectKey,
        fileName: 'photo.jpg',
        mimeType: 'image/jpeg',
        content,
      }),
    ).rejects.toThrowError(
      /canonical database reconciliation is required/,
    );
  });

  it('requires complete provider identity metadata after resumable upload', async () => {
    const content = new TextEncoder().encode('binary');
    const objectKey = 'document-version:metadata';
    let calls = 0;

    const storage = new GoogleDriveFileStorage({
      folderId: 'folder-1',
      accessTokenProvider: tokenProvider,
      fetchImpl: async (_input, init) => {
        calls += 1;
        if (init?.method === 'POST') {
          return new Response(null, {
            status: 200,
            headers: {
              location:
                'https://www.googleapis.com/upload/drive/v3/files?upload_id=metadata',
            },
          });
        }
        if (init?.method === 'PUT') {
          return Response.json({
            id: 'drive-file-1',
            size: String(content.byteLength),
            appProperties: { portfolioObjectKey: objectKey },
          });
        }
        return Response.json({ files: [] });
      },
    });

    await expect(
      storage.put({
        objectKey,
        fileName: 'binary.dat',
        mimeType: 'application/octet-stream',
        content,
      }),
    ).rejects.toThrowError(/valid SHA-256 checksum/);

    expect(calls).toBe(3);
  });

  it('enforces the provider write bound before hashing or network I/O', async () => {
    const fetchImpl = vi.fn();
    const storage = new GoogleDriveFileStorage({
      folderId: 'folder-1',
      accessTokenProvider: tokenProvider,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      maxUploadBytes: 4,
    });

    await expect(
      storage.put({
        objectKey: 'document-version:too-large',
        fileName: 'large.bin',
        mimeType: 'application/octet-stream',
        content: new Uint8Array(5),
      }),
    ).rejects.toThrowError(/exceeds buffered write limit/);

    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('stats an exact object reference and returns checksum metadata', async () => {
    const expectedHash = 'a'.repeat(64);
    const objectKey = 'document-version:123';
    const storage = new GoogleDriveFileStorage({
      folderId: 'folder-1',
      accessTokenProvider: tokenProvider,
      fetchImpl: async () =>
        Response.json({
          id: 'drive-file-1',
          size: '42',
          sha256Checksum: expectedHash,
          appProperties: { portfolioObjectKey: objectKey },
        }),
    });

    await expect(
      storage.stat({
        provider: 'google-drive',
        objectId: 'drive-file-1',
        objectKey,
      }),
    ).resolves.toEqual({
      provider: 'google-drive',
      objectId: 'drive-file-1',
      objectKey,
      byteSize: 42,
      sha256: expectedHash,
    });
  });

  it('treats a missing object as already removed without issuing DELETE', async () => {
    const requests: Request[] = [];
    const storage = new GoogleDriveFileStorage({
      folderId: 'folder-1',
      accessTokenProvider: tokenProvider,
      fetchImpl: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        return new Response(null, { status: 404 });
      },
    });

    await expect(
      storage.remove({
        provider: 'google-drive',
        objectId: 'missing',
        objectKey: 'document-version:missing',
      }),
    ).resolves.toBeUndefined();

    expect(requests).toHaveLength(1);
    expect(requests[0]!.method).toBe('GET');
  });

  it('refuses to delete a Drive id whose object key does not match canonical storage identity', async () => {
    const requests: Request[] = [];
    const storage = new GoogleDriveFileStorage({
      folderId: 'folder-1',
      accessTokenProvider: tokenProvider,
      fetchImpl: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        return Response.json({
          id: 'drive-file-1',
          size: '4',
          sha256Checksum: 'a'.repeat(64),
          appProperties: {
            portfolioObjectKey: 'document-version:other',
          },
        });
      },
    });

    await expect(
      storage.remove({
        provider: 'google-drive',
        objectId: 'drive-file-1',
        objectKey: 'document-version:expected',
      }),
    ).rejects.toThrowError(/does not match the Portfolio object key/);

    expect(requests).toHaveLength(1);
    expect(requests[0]!.method).toBe('GET');
  });

  it('reads exact content and computes integrity metadata from downloaded bytes', async () => {
    const content = new TextEncoder().encode('signed lease binary');
    const objectKey = 'document-version:read-1';
    const expectedHash = await sha256(content);
    const requests: Request[] = [];

    const storage = new GoogleDriveFileStorage({
      folderId: 'folder-1',
      accessTokenProvider: tokenProvider,
      fetchImpl: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        const url = new URL(request.url);

        if (url.searchParams.get('alt') === 'media') {
          return new Response(content);
        }

        return Response.json(
          driveFile(
            'drive-file-1',
            objectKey,
            content,
            expectedHash,
          ),
        );
      },
    });

    const result = await storage.read(
      {
        provider: 'google-drive',
        objectId: 'drive-file-1',
        objectKey,
      },
      { maxBytes: 1024 },
    );

    expect(result).not.toBeNull();
    expect(result).toMatchObject({
      provider: 'google-drive',
      objectId: 'drive-file-1',
      objectKey,
      byteSize: content.byteLength,
      sha256: expectedHash,
    });
    expect([...(result?.content ?? [])]).toEqual([...content]);
    expect(requests).toHaveLength(2);
    expect(new URL(requests[1]!.url).searchParams.get('alt')).toBe(
      'media',
    );
  });

  it('fails closed when downloaded bytes no longer match Drive metadata', async () => {
    const canonical = new TextEncoder().encode('canonical');
    const tampered = new TextEncoder().encode('tampered');
    const objectKey = 'document-version:read-2';
    const canonicalHash = await sha256(canonical);

    const storage = new GoogleDriveFileStorage({
      folderId: 'folder-1',
      accessTokenProvider: tokenProvider,
      fetchImpl: async (input) => {
        const url = new URL(
          input instanceof Request ? input.url : input.toString(),
        );
        if (url.searchParams.get('alt') === 'media') {
          return new Response(tampered);
        }

        return Response.json(
          driveFile(
            'drive-file-1',
            objectKey,
            canonical,
            canonicalHash,
          ),
        );
      },
    });

    await expect(
      storage.read(
        {
          provider: 'google-drive',
          objectId: 'drive-file-1',
          objectKey,
        },
        { maxBytes: 1024 },
      ),
    ).rejects.toThrowError(/does not match file metadata/);
  });

  it('rejects oversized Drive metadata before requesting media bytes', async () => {
    const requests: Request[] = [];
    const objectKey = 'document-version:read-limit-1';
    const storage = new GoogleDriveFileStorage({
      folderId: 'folder-1',
      accessTokenProvider: tokenProvider,
      fetchImpl: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        return Response.json({
          id: 'drive-file-1',
          size: '17',
          sha256Checksum: 'a'.repeat(64),
          appProperties: { portfolioObjectKey: objectKey },
        });
      },
    });

    await expect(
      storage.read(
        {
          provider: 'google-drive',
          objectId: 'drive-file-1',
          objectKey,
        },
        { maxBytes: 16 },
      ),
    ).rejects.toThrowError(/exceeds buffered read limit/);

    expect(requests).toHaveLength(1);
    expect(new URL(requests[0]!.url).searchParams.get('alt')).not.toBe(
      'media',
    );
  });

  it('bounds the media body if Drive content grows after metadata was read', async () => {
    const canonical = new Uint8Array([1, 2, 3]);
    const oversized = new Uint8Array([1, 2, 3, 4, 5, 6]);
    const objectKey = 'document-version:read-limit-2';
    const canonicalHash = await sha256(canonical);

    const storage = new GoogleDriveFileStorage({
      folderId: 'folder-1',
      accessTokenProvider: tokenProvider,
      fetchImpl: async (input) => {
        const url = new URL(
          input instanceof Request ? input.url : input.toString(),
        );
        if (url.searchParams.get('alt') === 'media') {
          return new Response(oversized);
        }
        return Response.json(
          driveFile(
            'drive-file-1',
            objectKey,
            canonical,
            canonicalHash,
          ),
        );
      },
    });

    await expect(
      storage.read(
        {
          provider: 'google-drive',
          objectId: 'drive-file-1',
          objectKey,
        },
        { maxBytes: 4 },
      ),
    ).rejects.toThrowError(/exceeds buffered read limit/);
  });
});
