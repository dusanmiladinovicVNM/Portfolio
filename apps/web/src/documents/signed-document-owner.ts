import type {
  DocumentLinkResponse,
  DocumentResponse,
  DocumentVersionResponse,
} from '@portfolio/contracts';

export function assertDocumentVersionListOwner(
  documentId: string,
  versions: readonly DocumentVersionResponse[],
): void {
  if (versions.some((version) => version.documentId !== documentId)) {
    throw new Error(
      'Document version list contains a version owned by another Document.',
    );
  }
}

export function assertCreatedDocument(
  document: DocumentResponse,
): void {
  if (
    document.status !== 'active' ||
    document.latestVersionNumber !== 0 ||
    document.revision !== 1
  ) {
    throw new Error(
      'Created Document does not match the initial canonical lifecycle.',
    );
  }
}

export function assertUploadedDocumentVersion(
  document: DocumentResponse,
  version: DocumentVersionResponse,
): void {
  if (version.documentId !== document.id) {
    throw new Error('Uploaded version belongs to another Document.');
  }
  if (version.versionNumber !== document.latestVersionNumber + 1) {
    throw new Error('Uploaded version does not match the expected next version.');
  }
  if (version.status !== 'stored' || version.finalizedAt !== null) {
    throw new Error('Uploaded version is not in the canonical stored state.');
  }
}

export function assertFinalizedDocumentVersion(
  documentId: string,
  versionId: string,
  version: DocumentVersionResponse,
): void {
  if (version.id !== versionId) {
    throw new Error('Finalized version response does not match the command target.');
  }
  if (version.documentId !== documentId) {
    throw new Error('Finalized version belongs to another Document.');
  }
  if (version.status !== 'final' || version.finalizedAt === null) {
    throw new Error('Finalized version response is not final.');
  }
}

export function assertSignedOriginalLink(
  documentId: string,
  versionId: string,
  targetType: 'lease_agreement' | 'lease_amendment',
  targetId: string,
  link: DocumentLinkResponse,
): void {
  if (link.documentId !== documentId) {
    throw new Error('Signed-original link response belongs to another Document.');
  }
  if (link.documentVersionId !== versionId) {
    throw new Error('Signed-original link response does not identify the exact version.');
  }
  if (link.relation !== 'signed_original') {
    throw new Error('Signed-original link response has the wrong relation.');
  }
  if (link.targetType !== targetType || link.targetId !== targetId) {
    throw new Error('Signed-original link response belongs to another legal target.');
  }
}
