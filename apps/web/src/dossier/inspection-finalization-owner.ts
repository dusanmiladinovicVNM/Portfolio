import type {
  InspectionBundleResponse,
  InspectionResponseDto,
  InspectionSignatureResponse,
} from '@portfolio/contracts';

function assertSameIdentity(
  before: InspectionResponseDto,
  after: InspectionResponseDto,
): void {
  if (
    after.id !== before.id ||
    after.unitId !== before.unitId ||
    after.schemaVersionId !== before.schemaVersionId ||
    after.tenancyId !== before.tenancyId ||
    after.inspectionType !== before.inspectionType ||
    after.code !== before.code
  ) {
    throw new Error('Inspection lifecycle response crossed historical identity.');
  }
}

export function assertInspectionLockTransition(
  before: InspectionResponseDto,
  after: InspectionResponseDto,
): void {
  assertSameIdentity(before, after);
  if (
    before.status !== 'in_progress' ||
    after.status !== 'locked' ||
    after.version !== before.version + 1 ||
    after.contentRevision !== before.contentRevision ||
    after.lockedAt === null
  ) {
    throw new Error('Inspection lock response does not match the requested CAS transition.');
  }
}

export function assertInspectionUnlockTransition(
  before: InspectionResponseDto,
  after: InspectionResponseDto,
): void {
  assertSameIdentity(before, after);
  if (
    before.status !== 'locked' ||
    after.status !== 'in_progress' ||
    after.version !== before.version + 1 ||
    after.contentRevision !== before.contentRevision + 1 ||
    after.lockedAt !== null
  ) {
    throw new Error('Inspection unlock response does not match the requested CAS transition.');
  }
}

export function assertInspectionFinalizeTransition(
  before: InspectionResponseDto,
  canonical: InspectionBundleResponse,
): void {
  const after = canonical.inspection;
  assertSameIdentity(before, after);
  if (
    before.status !== 'locked' ||
    after.status !== 'finalized' ||
    after.version !== before.version + 1 ||
    after.contentRevision !== before.contentRevision ||
    after.finalizedAt === null ||
    canonical.finalSnapshot === null ||
    canonical.finalSnapshot.inspectionId !== before.id ||
    canonical.finalSnapshot.inspectionVersion !== before.version ||
    canonical.finalSnapshot.contentRevision !== before.contentRevision
  ) {
    throw new Error(
      'Inspection finalization does not match the locked source revision and immutable snapshot.',
    );
  }
}

export interface InspectionSignatureRegistration {
  readonly inspectionId: string;
  readonly signerRole: InspectionSignatureResponse['signerRole'];
  readonly signerPartyId: string | null;
  readonly signerName: string;
  readonly signatureDocumentVersionId: string;
}

export function assertInspectionSignature(
  expected: InspectionSignatureRegistration,
  signature: InspectionSignatureResponse,
): void {
  if (
    signature.inspectionId !== expected.inspectionId ||
    signature.signerRole !== expected.signerRole ||
    signature.signerPartyId !== expected.signerPartyId ||
    signature.signerName !== expected.signerName.trim() ||
    signature.signatureDocumentVersionId !== expected.signatureDocumentVersionId ||
    signature.invalidatedAt !== null
  ) {
    throw new Error('Inspection signature response does not match the captured signature.');
  }
}

export function findRecoveredInspectionSignature(
  bundle: InspectionBundleResponse,
  preExistingIds: ReadonlySet<string>,
  expected: InspectionSignatureRegistration,
): InspectionSignatureResponse | null {
  const candidates = bundle.signatures.filter((signature) => {
    if (preExistingIds.has(signature.id)) return false;
    try {
      assertInspectionSignature(expected, signature);
      return true;
    } catch {
      return false;
    }
  });
  return candidates.length === 1 ? candidates[0]! : null;
}

export function missingRequiredSignatureRoles(
  bundle: InspectionBundleResponse,
): readonly InspectionSignatureResponse['signerRole'][] {
  const activeRoles = new Set(
    bundle.signatures
      .filter((signature) => signature.invalidatedAt === null)
      .map((signature) => signature.signerRole),
  );
  return bundle.schema.requiredSignatureRoles.filter(
    (role) => !activeRoles.has(role),
  );
}
