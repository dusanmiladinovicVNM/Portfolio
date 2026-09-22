import { describe, expect, it } from 'vitest';
import type {
  InspectionBundleResponse,
  InspectionResponseDto,
  InspectionSignatureResponse,
} from '@portfolio/contracts';
import {
  assertInspectionFinalizeTransition,
  assertInspectionLockTransition,
  assertInspectionUnlockTransition,
  findRecoveredInspectionSignature,
  missingRequiredSignatureRoles,
} from '../src/dossier/inspection-finalization-owner.js';

const inspectionId = 'a1000000-0000-4000-8000-000000000001';
const unitId = 'a1000000-0000-4000-8000-000000000002';
const schemaId = 'a1000000-0000-4000-8000-000000000003';
const userId = 'a1000000-0000-4000-8000-000000000004';

function inspection(
  status: InspectionResponseDto['status'],
  version: number,
  contentRevision: number,
): InspectionResponseDto {
  return {
    id: inspectionId,
    code: 'INS-FINAL',
    inspectionType: 'move_in',
    unitId,
    tenancyId: null,
    schemaVersionId: schemaId,
    assignedToUserId: userId,
    createdByUserId: userId,
    scheduledFor: null,
    status,
    startedAt: '2026-09-22T08:00:00.000Z',
    lockedAt: status === 'locked' || status === 'finalized'
      ? '2026-09-22T09:00:00.000Z'
      : null,
    finalizedAt: status === 'finalized'
      ? '2026-09-22T10:00:00.000Z'
      : null,
    cancelledAt: null,
    version,
    contentRevision,
  };
}

function signature(
  id: string,
  role: InspectionSignatureResponse['signerRole'],
  versionId: string,
): InspectionSignatureResponse {
  return {
    id,
    inspectionId,
    signerRole: role,
    signerPartyId: null,
    signerName: 'Signer',
    signatureDocumentVersionId: versionId,
    signedByUserId: userId,
    signedAt: '2026-09-22T09:10:00.000Z',
    invalidatedAt: null,
    invalidationReason: null,
  };
}

function bundle(
  current: InspectionResponseDto,
  signatures: readonly InspectionSignatureResponse[] = [],
): InspectionBundleResponse {
  return {
    inspection: current,
    schema: {
      id: schemaId,
      schemaCode: 'MOVE-IN',
      versionNumber: 1,
      inspectionType: 'move_in',
      title: 'Move in',
      status: 'published',
      requiredSignatureRoles: ['tenant', 'landlord'],
      sections: [],
    },
    sectionStates: [],
    responses: [],
    findings: [],
    evidence: [],
    signatures: [...signatures],
    finalSnapshot:
      current.status === 'finalized'
        ? {
            id: 'a2000000-0000-4000-8000-000000000001',
            inspectionId,
            snapshotVersion: 1,
            inspectionVersion: current.version - 1,
            contentRevision: current.contentRevision,
            createdByUserId: userId,
            createdAt: '2026-09-22T10:00:00.000Z',
          }
        : null,
  };
}

describe('Inspection finalization ownership', () => {
  it('accepts only the exact lock CAS transition', () => {
    const before = inspection('in_progress', 2, 4);
    const after = {
      ...inspection('locked', 3, 4),
      lockedAt: '2026-09-22T09:00:00.000Z',
    };
    expect(() => assertInspectionLockTransition(before, after)).not.toThrow();
    expect(() =>
      assertInspectionLockTransition(before, { ...after, contentRevision: 5 }),
    ).toThrow(/lock response/);
  });

  it('requires unlock to advance lifecycle and content revision', () => {
    const before = inspection('locked', 3, 4);
    const after = inspection('in_progress', 4, 5);
    expect(() => assertInspectionUnlockTransition(before, after)).not.toThrow();
    expect(() =>
      assertInspectionUnlockTransition(before, { ...after, version: 5 }),
    ).toThrow(/unlock response/);
  });

  it('binds finalization to the exact locked source snapshot revision', () => {
    const before = inspection('locked', 5, 8);
    const canonical = bundle(inspection('finalized', 6, 8));
    expect(() =>
      assertInspectionFinalizeTransition(before, canonical),
    ).not.toThrow();

    expect(() =>
      assertInspectionFinalizeTransition(before, {
        ...canonical,
        finalSnapshot: {
          ...canonical.finalSnapshot!,
          contentRevision: 7,
        },
      }),
    ).toThrow(/immutable snapshot/);
  });

  it('recovers a signature only by exact new relation identity', () => {
    const old = signature(
      'a3000000-0000-4000-8000-000000000001',
      'witness',
      'a4000000-0000-4000-8000-000000000001',
    );
    const recovered = signature(
      'a3000000-0000-4000-8000-000000000002',
      'tenant',
      'a4000000-0000-4000-8000-000000000002',
    );
    expect(
      findRecoveredInspectionSignature(
        bundle(inspection('locked', 3, 4), [old, recovered]),
        new Set([old.id]),
        {
          inspectionId,
          signerRole: 'tenant',
          signerPartyId: null,
          signerName: 'Signer',
          signatureDocumentVersionId: recovered.signatureDocumentVersionId,
        },
      )?.id,
    ).toBe(recovered.id);
  });

  it('reports only missing active required roles', () => {
    const tenant = signature(
      'a3000000-0000-4000-8000-000000000003',
      'tenant',
      'a4000000-0000-4000-8000-000000000003',
    );
    const invalidLandlord = {
      ...signature(
        'a3000000-0000-4000-8000-000000000004',
        'landlord',
        'a4000000-0000-4000-8000-000000000004',
      ),
      invalidatedAt: '2026-09-22T09:30:00.000Z',
      invalidationReason: 'Correction',
    };
    expect(
      missingRequiredSignatureRoles(
        bundle(inspection('locked', 3, 4), [tenant, invalidLandlord]),
      ),
    ).toEqual(['landlord']);
  });
});
