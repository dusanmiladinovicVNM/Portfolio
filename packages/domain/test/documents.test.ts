import { describe, expect, it } from 'vitest';
import {
  addStoredDocumentVersion,
  asDocumentId,
  asDocumentLinkId,
  asDocumentVersionId,
  asLeaseAgreementId,
  createDocument,
  createDocumentLink,
  finalizeDocumentVersion,
} from '../src/index.js';

describe('Document domain', () => {
  const document = createDocument({
    id: asDocumentId('10000000-0000-4000-8000-000000000001'),
    code: 'DOC-1',
    title: 'Signed lease',
    category: 'legal',
  });

  it('numbers immutable stored versions through the Document aggregate', () => {
    const added = addStoredDocumentVersion(document, {
      id: asDocumentVersionId('10000000-0000-4000-8000-000000000002'),
      fileName: 'lease.pdf',
      mimeType: 'application/pdf',
      byteSize: 42,
      sha256: 'A'.repeat(64),
    });

    expect(added.document.latestVersionNumber).toBe(1);
    expect(added.document.revision).toBe(2);
    expect(added.version).toMatchObject({
      versionNumber: 1,
      status: 'stored',
      sha256: 'a'.repeat(64),
    });
  });

  it('finalizes one exact binary version and never finalizes it twice', () => {
    const { version } = addStoredDocumentVersion(document, {
      id: asDocumentVersionId('10000000-0000-4000-8000-000000000002'),
      fileName: 'lease.pdf',
      mimeType: 'application/pdf',
      byteSize: 42,
      sha256: 'b'.repeat(64),
    });

    const final = finalizeDocumentVersion(version, '2026-09-18T20:00:00.000Z');
    expect(final.status).toBe('final');
    expect(final.finalizedAt).toBe('2026-09-18T20:00:00.000Z');
    expect(() =>
      finalizeDocumentVersion(final, '2026-09-18T21:00:00.000Z'),
    ).toThrowError(/Only a stored document version/);
  });

  it('requires signed_original to identify an exact legal document version', () => {
    expect(() =>
      createDocumentLink({
        id: asDocumentLinkId('10000000-0000-4000-8000-000000000003'),
        documentId: document.id,
        documentVersionId: null,
        relation: 'signed_original',
        targetType: 'lease_agreement',
        targetId: asLeaseAgreementId('10000000-0000-4000-8000-000000000004'),
      }),
    ).toThrowError(/exact final document version/);
  });
});
