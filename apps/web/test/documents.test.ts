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
        {
          document,
          link: {
            id: '66666666-6666-4666-8666-666666666666',
            documentId: document.id,
            documentVersionId: '77777777-7777-4777-8777-777777777777',
            relation: 'generated_contract',
            targetType: 'lease_agreement',
            targetId: '88888888-8888-4888-8888-888888888888',
          },
          linkedVersion: {
            id: '77777777-7777-4777-8777-777777777777',
            documentId: document.id,
            versionNumber: 1,
            fileName: 'mietvertrag.pdf',
            mimeType: 'application/pdf',
            byteSize: 11,
            sha256: 'b'.repeat(64),
            status: 'final',
            finalizedAt: '2026-10-03T06:41:15.436Z',
          },
        },
      ],
    });

    expect(parsed.items).toHaveLength(3);
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
