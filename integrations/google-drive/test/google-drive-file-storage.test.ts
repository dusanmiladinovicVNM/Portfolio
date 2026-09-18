import { describe, expect, it } from 'vitest';
import { GoogleDriveFileStorage } from '../src/index.js';

const tokenProvider = {
  async getAccessToken() {
    return 'test-token';
  },
};

async function sha256(content: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', content);
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

    expect(stored.objectId).toBe('drive-existing');
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
});
