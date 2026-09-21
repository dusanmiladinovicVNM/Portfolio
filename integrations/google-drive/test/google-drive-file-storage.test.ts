import { describe, expect, it } from 'vitest';
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

describe('GoogleDriveFileStorage', () => {
  it('uploads metadata and binary content and returns provider-neutral metadata', async () => {
    const content = new TextEncoder().encode('signed lease');
    const expectedHash = await sha256(content);
    const requests: Request[] = [];

    const storage = new GoogleDriveFileStorage({
      folderId: 'folder-1',
      accessTokenProvider: tokenProvider,
      fetchImpl: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);

        if (request.method === 'GET') {
          return Response.json({ files: [] });
        }

        return Response.json({
          id: 'drive-file-1',
          size: String(content.byteLength),
          sha256Checksum: expectedHash,
        });
      },
    });

    const stored = await storage.put({
      objectKey: 'document-version:123',
      fileName: 'lease.pdf',
      mimeType: 'application/pdf',
      content,
    });

    expect(stored).toEqual({
      provider: 'google-drive',
      objectId: 'drive-file-1',
      objectKey: 'document-version:123',
      byteSize: content.byteLength,
      sha256: expectedHash,
      disposition: 'created',
    });
    expect(requests).toHaveLength(2);
    expect(requests[0]!.url).toContain('includeItemsFromAllDrives=true');
    expect(requests[1]!.url).toContain('uploadType=multipart');
    expect(requests[1]!.headers.get('authorization')).toBe('Bearer test-token');
  });

  it('is idempotent for the same object key and content hash', async () => {
    const content = new TextEncoder().encode('same content');
    const expectedHash = await sha256(content);
    let calls = 0;

    const storage = new GoogleDriveFileStorage({
      folderId: 'folder-1',
      accessTokenProvider: tokenProvider,
      fetchImpl: async () => {
        calls += 1;
        return Response.json({
          files: [{
            id: 'drive-existing',
            size: String(content.byteLength),
            sha256Checksum: expectedHash,
          }],
        });
      },
    });

    const stored = await storage.put({
      objectKey: 'document-version:stable',
      fileName: 'lease.pdf',
      mimeType: 'application/pdf',
      content,
    });

    expect(stored).toMatchObject({
      objectId: 'drive-existing',
      disposition: 'reused',
    });
    expect(calls).toBe(1);
  });

  it('rejects an object-key collision with different binary content', async () => {
    const storage = new GoogleDriveFileStorage({
      folderId: 'folder-1',
      accessTokenProvider: tokenProvider,
      fetchImpl: async () =>
        Response.json({
          files: [{
            id: 'drive-existing',
            size: '4',
            sha256Checksum: '0'.repeat(64),
          }],
        }),
    });

    await expect(
      storage.put({
        objectKey: 'document-version:stable',
        fileName: 'lease.pdf',
        mimeType: 'application/pdf',
        content: new TextEncoder().encode('different'),
      }),
    ).rejects.toThrowError(/different content/);
  });

  it('stats an exact object reference and returns checksum metadata', async () => {
    const expectedHash = 'a'.repeat(64);
    const storage = new GoogleDriveFileStorage({
      folderId: 'folder-1',
      accessTokenProvider: tokenProvider,
      fetchImpl: async () =>
        Response.json({
          id: 'drive-file-1',
          size: '42',
          sha256Checksum: expectedHash,
          appProperties: { portfolioObjectKey: 'document-version:123' },
        }),
    });

    await expect(
      storage.stat({
        provider: 'google-drive',
        objectId: 'drive-file-1',
        objectKey: 'document-version:123',
      }),
    ).resolves.toEqual({
      provider: 'google-drive',
      objectId: 'drive-file-1',
      objectKey: 'document-version:123',
      byteSize: 42,
      sha256: expectedHash,
    });
  });

  it('treats a missing object as already removed during compensation', async () => {
    const storage = new GoogleDriveFileStorage({
      folderId: 'folder-1',
      accessTokenProvider: tokenProvider,
      fetchImpl: async (_input, init) => {
        expect(init?.method).toBe('DELETE');
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
  });

  it('reads exact content and computes integrity metadata from downloaded bytes', async () => {
    const content = new TextEncoder().encode('signed lease binary');
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

        return Response.json({
          id: 'drive-file-1',
          size: String(content.byteLength),
          sha256Checksum: expectedHash,
          appProperties: {
            portfolioObjectKey: 'document-version:read-1',
          },
        });
      },
    });

    const result = await storage.read({
      provider: 'google-drive',
      objectId: 'drive-file-1',
      objectKey: 'document-version:read-1',
    });

    expect(result).not.toBeNull();
    expect(result).toMatchObject({
      provider: 'google-drive',
      objectId: 'drive-file-1',
      objectKey: 'document-version:read-1',
      byteSize: content.byteLength,
      sha256: expectedHash,
    });
    expect([...(result?.content ?? [])]).toEqual([...content]);
    expect(requests).toHaveLength(2);
    expect(new URL(requests[1]!.url).searchParams.get('alt')).toBe('media');
  });

  it('fails closed when downloaded bytes no longer match Drive metadata', async () => {
    const canonical = new TextEncoder().encode('canonical');
    const tampered = new TextEncoder().encode('tampered');
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

        return Response.json({
          id: 'drive-file-1',
          size: String(canonical.byteLength),
          sha256Checksum: canonicalHash,
          appProperties: {
            portfolioObjectKey: 'document-version:read-2',
          },
        });
      },
    });

    await expect(
      storage.read({
        provider: 'google-drive',
        objectId: 'drive-file-1',
        objectKey: 'document-version:read-2',
      }),
    ).rejects.toThrowError(/does not match file metadata/);
  });

});
