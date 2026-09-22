import type {
  DocumentResponse,
  DocumentVersionResponse,
  InspectionBundleResponse,
  InspectionEvidenceResponse,
  InspectionFindingResponse,
} from '@portfolio/contracts';
import { assertUploadedDocumentVersion } from '../documents/signed-document-owner.js';

function normalizedOptionalText(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return value.trim() || null;
}

function sectionOwner(
  bundle: InspectionBundleResponse,
  sectionId: string,
) {
  return bundle.schema.sections.find((section) => section.id === sectionId);
}

function assertItemOwner(
  bundle: InspectionBundleResponse,
  sectionId: string,
  itemId: string,
  subject: string,
): void {
  const section = sectionOwner(bundle, sectionId);
  if (!section || !section.items.some((item) => item.id === itemId)) {
    throw new Error(`${subject} item belongs to another schema section.`);
  }
}

export interface InspectionFindingRegistration {
  readonly inspectionId: string;
  readonly sectionId: string;
  readonly itemId: string | null;
  readonly severity: InspectionFindingResponse['severity'];
  readonly title: string;
  readonly description: string | null;
}

export interface InspectionEvidenceRegistration {
  readonly inspectionId: string;
  readonly sectionId: string | null;
  readonly itemId: string | null;
  readonly documentVersionId: string;
  readonly kind: Exclude<InspectionEvidenceResponse['kind'], 'final_report'>;
  readonly caption: string | null;
}

export function assertInspectionBundleOwner(
  inspectionId: string,
  unitId: string,
  bundle: InspectionBundleResponse,
): void {
  if (
    bundle.inspection.id !== inspectionId ||
    bundle.inspection.unitId !== unitId
  ) {
    throw new Error('Inspection bundle crossed its aggregate ownership boundary.');
  }
  if (bundle.schema.id !== bundle.inspection.schemaVersionId) {
    throw new Error('Inspection bundle returned a different schema owner.');
  }

  for (const state of bundle.sectionStates) {
    if (!sectionOwner(bundle, state.sectionId)) {
      throw new Error('Inspection SectionState belongs to another schema.');
    }
  }

  for (const response of bundle.responses) {
    if (response.inspectionId !== inspectionId) {
      throw new Error('Inspection Response belongs to another Inspection.');
    }
    assertItemOwner(
      bundle,
      response.sectionId,
      response.itemId,
      'Inspection Response',
    );
  }

  for (const finding of bundle.findings) {
    if (finding.inspectionId !== inspectionId) {
      throw new Error('Inspection Finding belongs to another Inspection.');
    }
    if (!sectionOwner(bundle, finding.sectionId)) {
      throw new Error('Inspection Finding belongs to another schema section.');
    }
    if (finding.itemId !== null) {
      assertItemOwner(
        bundle,
        finding.sectionId,
        finding.itemId,
        'Inspection Finding',
      );
    }
  }

  for (const evidence of bundle.evidence) {
    if (evidence.inspectionId !== inspectionId) {
      throw new Error('Inspection Evidence belongs to another Inspection.');
    }
    if (evidence.itemId !== null && evidence.sectionId === null) {
      throw new Error('Inspection Evidence item is missing its section owner.');
    }
    if (evidence.sectionId !== null) {
      if (!sectionOwner(bundle, evidence.sectionId)) {
        throw new Error('Inspection Evidence belongs to another schema section.');
      }
      if (evidence.itemId !== null) {
        assertItemOwner(
          bundle,
          evidence.sectionId,
          evidence.itemId,
          'Inspection Evidence',
        );
      }
    }
  }
}

export function assertCreatedInspectionFinding(
  expected: InspectionFindingRegistration,
  finding: InspectionFindingResponse,
): void {
  if (
    finding.inspectionId !== expected.inspectionId ||
    finding.sectionId !== expected.sectionId ||
    finding.itemId !== expected.itemId ||
    finding.severity !== expected.severity ||
    finding.title !== expected.title.trim() ||
    finding.description !== normalizedOptionalText(expected.description)
  ) {
    throw new Error('Created Inspection Finding does not match the command target.');
  }
}

export function assertAttachedInspectionEvidence(
  expected: InspectionEvidenceRegistration,
  evidence: InspectionEvidenceResponse,
): void {
  if (
    evidence.inspectionId !== expected.inspectionId ||
    evidence.sectionId !== expected.sectionId ||
    evidence.itemId !== expected.itemId ||
    evidence.documentVersionId !== expected.documentVersionId ||
    evidence.kind !== expected.kind ||
    evidence.caption !== normalizedOptionalText(expected.caption)
  ) {
    throw new Error('Attached Inspection Evidence does not match the command target.');
  }
}

export function findRecoveredInspectionEvidence(
  bundle: InspectionBundleResponse,
  preExistingIds: ReadonlySet<string>,
  expected: InspectionEvidenceRegistration,
): InspectionEvidenceResponse | null {
  const candidates = bundle.evidence.filter((evidence) => {
    if (preExistingIds.has(evidence.id)) return false;
    try {
      assertAttachedInspectionEvidence(expected, evidence);
      return true;
    } catch {
      return false;
    }
  });
  return candidates.length === 1 ? candidates[0]! : null;
}

export function assertCreatedEvidenceDocument(
  expected: Pick<DocumentResponse, 'code' | 'title' | 'category'>,
  document: DocumentResponse,
): void {
  if (
    document.code !== expected.code.trim() ||
    document.title !== expected.title.trim() ||
    document.category !== expected.category ||
    document.status !== 'active' ||
    document.latestVersionNumber !== 0 ||
    document.revision !== 1
  ) {
    throw new Error(
      'Created evidence Document does not match the submitted registration.',
    );
  }
}

export function findRecoveredEvidenceDocument(
  documents: readonly DocumentResponse[],
  preExistingIds: ReadonlySet<string>,
  expected: Pick<DocumentResponse, 'code' | 'title' | 'category'>,
): DocumentResponse | null {
  const candidates = documents.filter((document) => {
    if (preExistingIds.has(document.id)) return false;
    try {
      assertCreatedEvidenceDocument(expected, document);
      return true;
    } catch {
      return false;
    }
  });
  return candidates.length === 1 ? candidates[0]! : null;
}

export function findRecoveredUploadedDocumentVersion(
  versions: readonly DocumentVersionResponse[],
  preExistingIds: ReadonlySet<string>,
  document: DocumentResponse,
  expected: {
    readonly fileName: string;
    readonly mimeType: string;
    readonly byteSize: number;
  },
): DocumentVersionResponse | null {
  const candidates = versions.filter((version) => {
    if (preExistingIds.has(version.id)) return false;
    try {
      assertUploadedDocumentVersion(document, expected, version);
      return true;
    } catch {
      return false;
    }
  });
  return candidates.length === 1 ? candidates[0]! : null;
}
