import { describe, expect, it } from 'vitest';
import type {
  DocumentLinkResponse,
  DocumentResponse,
  DocumentVersionResponse,
  LeaseAgreementDocumentReferenceResponse,
  LeaseAmendmentDocumentReferenceResponse,
} from '@portfolio/contracts';
import {
  assertAgreementDocumentReferencesOwner,
  assertAmendmentDocumentReferencesOwner,
  assertCreatedDocument,
  assertDocumentVersionListOwner,
  assertFinalizedDocumentVersion,
  assertSignedOriginalLink,
  assertUploadedDocumentVersion,
} from '../src/documents/signed-document-owner.js';

const documentId = '11111111-1111-4111-8111-111111111111';
const otherDocumentId = '22222222-2222-4222-8222-222222222222';
const versionId = '33333333-3333-4333-8333-333333333333';
const otherVersionId = '44444444-4444-4444-8444-444444444444';
const agreementId = '55555555-5555-4555-8555-555555555555';

function document(overrides: Partial<DocumentResponse> = {}): DocumentResponse {
  return {
    id: documentId,
    code: 'DOC-1',
    title: 'Lease',
    category: 'legal',
    status: 'active',
    latestVersionNumber: 0,
    revision: 1,
    ...overrides,
  };
}

function version(
  overrides: Partial<DocumentVersionResponse> = {},
): DocumentVersionResponse {
  return {
    id: versionId,
    documentId,
    versionNumber: 1,
    fileName: 'lease.pdf',
    mimeType: 'application/pdf',
    byteSize: 3,
    sha256: 'a'.repeat(64),
    status: 'stored',
    finalizedAt: null,
    ...overrides,
  };
}

function agreementReference(
  targetId = agreementId,
): LeaseAgreementDocumentReferenceResponse {
  return {
    document: document({ latestVersionNumber: 1, revision: 2 }),
    link: {
      ...link(),
      targetType: 'lease_agreement',
      targetId,
    },
    linkedVersion: version({
      status: 'final',
      finalizedAt: '2026-09-22T08:00:00.000Z',
    }),
  };
}

function amendmentReference(
  targetId = agreementId,
): LeaseAmendmentDocumentReferenceResponse {
  return {
    document: document({ latestVersionNumber: 1, revision: 2 }),
    link: {
      ...link(),
      targetType: 'lease_amendment',
      targetId,
    },
    linkedVersion: version({
      status: 'final',
      finalizedAt: '2026-09-22T08:00:00.000Z',
    }),
  };
}

function link(
  overrides: Partial<DocumentLinkResponse> = {},
): DocumentLinkResponse {
  return {
    id: '66666666-6666-4666-8666-666666666666',
    documentId,
    documentVersionId: versionId,
    relation: 'signed_original',
    targetType: 'lease_agreement',
    targetId: agreementId,
    ...overrides,
  };
}

describe('signed Document owner guards', () => {
  it('rejects legal Document references owned by another target', () => {
    expect(() =>
      assertAgreementDocumentReferencesOwner(
        agreementId,
        [agreementReference()],
      ),
    ).not.toThrow();
    expect(() =>
      assertAgreementDocumentReferencesOwner(
        agreementId,
        [agreementReference(otherDocumentId)],
      ),
    ).toThrow('another Agreement');

    expect(() =>
      assertAmendmentDocumentReferencesOwner(
        agreementId,
        [amendmentReference()],
      ),
    ).not.toThrow();
    expect(() =>
      assertAmendmentDocumentReferencesOwner(
        agreementId,
        [amendmentReference(otherDocumentId)],
      ),
    ).toThrow('another Amendment');
  });


  it('accepts only the canonical initial Document state after create', () => {
    const expected = {
      code: 'DOC-1',
      title: 'Lease',
      category: 'legal' as const,
    };
    expect(() => assertCreatedDocument(expected, document())).not.toThrow();
    expect(() =>
      assertCreatedDocument(expected, document({ revision: 2 })),
    ).toThrow('initial canonical lifecycle');
    expect(() =>
      assertCreatedDocument(expected, document({ latestVersionNumber: 1 })),
    ).toThrow('initial canonical lifecycle');
    expect(() =>
      assertCreatedDocument(
        expected,
        document({ code: 'DOC-OTHER' }),
      ),
    ).toThrow('submitted legal Document');
  });

  it('rejects cross-Document version lists', () => {
    expect(() =>
      assertDocumentVersionListOwner(documentId, [version()]),
    ).not.toThrow();

    expect(() =>
      assertDocumentVersionListOwner(documentId, [
        version({ documentId: otherDocumentId }),
      ]),
    ).toThrow('another Document');
  });

  it('binds upload response to the Document and expected next version', () => {
    expect(() =>
      assertUploadedDocumentVersion(
        document(),
        {
          fileName: 'lease.pdf',
          mimeType: 'application/pdf',
          byteSize: 3,
        },
        version(),
      ),
    ).not.toThrow();

    expect(() =>
      assertUploadedDocumentVersion(
        document(),
        {
          fileName: 'lease.pdf',
          mimeType: 'application/pdf',
          byteSize: 3,
        },
        version({ documentId: otherDocumentId }),
      ),
    ).toThrow('another Document');

    expect(() =>
      assertUploadedDocumentVersion(
        document(),
        {
          fileName: 'lease.pdf',
          mimeType: 'application/pdf',
          byteSize: 3,
        },
        version({ versionNumber: 2 }),
      ),
    ).toThrow('expected next version');

    expect(() =>
      assertUploadedDocumentVersion(
        document(),
        {
          fileName: 'lease.pdf',
          mimeType: 'application/pdf',
          byteSize: 3,
        },
        version({
          status: 'final',
          finalizedAt: '2026-09-22T08:00:00.000Z',
        }),
      ),
    ).toThrow('canonical stored state');

    expect(() =>
      assertUploadedDocumentVersion(
        document(),
        {
          fileName: 'other.pdf',
          mimeType: 'application/pdf',
          byteSize: 3,
        },
        version(),
      ),
    ).toThrow('submitted binary metadata');
  });

  it('binds finalization response to the exact Version identity', () => {
    const finalized = version({
      status: 'final',
      finalizedAt: '2026-09-22T08:00:00.000Z',
    });

    expect(() =>
      assertFinalizedDocumentVersion(documentId, versionId, finalized),
    ).not.toThrow();

    expect(() =>
      assertFinalizedDocumentVersion(
        documentId,
        versionId,
        { ...finalized, id: otherVersionId },
      ),
    ).toThrow('command target');

    expect(() =>
      assertFinalizedDocumentVersion(
        documentId,
        versionId,
        { ...finalized, documentId: otherDocumentId },
      ),
    ).toThrow('another Document');
  });

  it('binds signed-original link completion to exact Document, Version and target', () => {
    expect(() =>
      assertSignedOriginalLink(
        documentId,
        versionId,
        'lease_agreement',
        agreementId,
        link(),
      ),
    ).not.toThrow();

    expect(() =>
      assertSignedOriginalLink(
        documentId,
        versionId,
        'lease_agreement',
        agreementId,
        link({ documentVersionId: otherVersionId }),
      ),
    ).toThrow('exact version');

    expect(() =>
      assertSignedOriginalLink(
        documentId,
        versionId,
        'lease_agreement',
        agreementId,
        link({ targetId: otherDocumentId }),
      ),
    ).toThrow('another legal target');
  });
});
