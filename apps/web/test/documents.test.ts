import { describe, expect, it } from 'vitest';
import { unitDocumentListResponseSchema } from '@portfolio/contracts';

describe('Unit document contract', () => {
  const document = {
    id: '11111111-1111-4111-8111-111111111111',
    code: 'DOC-1',
    title: 'Evidence',
    category: 'technical',
    status: 'active',
    latestVersionNumber: 1,
    revision: 2,
  };

  it('preserves DocumentLink grain and optional exact linked version', () => {
    const parsed = unitDocumentListResponseSchema.parse({
      items: [
        {
          document,
          link: {
            id: '22222222-2222-4222-8222-222222222222',
            documentId: document.id,
            documentVersionId: null,
            relation: 'other',
            targetType: 'unit',
            targetId: '33333333-3333-4333-8333-333333333333',
          },
          linkedVersion: null,
        },
        {
          document,
          link: {
            id: '44444444-4444-4444-8444-444444444444',
            documentId: document.id,
            documentVersionId: '55555555-5555-4555-8555-555555555555',
            relation: 'supporting',
            targetType: 'unit',
            targetId: '33333333-3333-4333-8333-333333333333',
          },
          linkedVersion: {
            id: '55555555-5555-4555-8555-555555555555',
            documentId: document.id,
            versionNumber: 1,
            fileName: 'evidence.pdf',
            mimeType: 'application/pdf',
            byteSize: 10,
            sha256: 'a'.repeat(64),
            status: 'stored',
            finalizedAt: null,
          },
        },
      ],
    });

    expect(parsed.items).toHaveLength(2);
    expect(parsed.items[0]?.linkedVersion).toBeNull();
    expect(parsed.items[1]?.linkedVersion?.versionNumber).toBe(1);
  });

  it('rejects a mismatched linked version instead of accepting incoherent DTOs', () => {
    const parsed = unitDocumentListResponseSchema.safeParse({
      items: [
        {
          document,
          link: {
            id: '22222222-2222-4222-8222-222222222222',
            documentId: document.id,
            documentVersionId: '55555555-5555-4555-8555-555555555555',
            relation: 'supporting',
            targetType: 'unit',
            targetId: '33333333-3333-4333-8333-333333333333',
          },
          linkedVersion: null,
        },
      ],
    });

    expect(parsed.success).toBe(false);
  });
});
