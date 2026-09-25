import { describe, expect, it } from 'vitest';
import type {
  DocumentResponse,
  DocumentVersionResponse,
  InspectionBundleResponse,
  InspectionEvidenceResponse,
  InspectionFindingResponse,
} from '@portfolio/contracts';
import {
  assertInspectionBundleOwner,
  findRecoveredEvidenceDocument,
  findRecoveredInspectionEvidence,
  findRecoveredUploadedDocumentVersion,
} from '../src/dossier/inspection-content-owner.js';

const inspectionId = 'a1000000-0000-4000-8000-000000000001';
const unitId = 'a1000000-0000-4000-8000-000000000002';
const schemaId = 'a1000000-0000-4000-8000-000000000003';
const sectionId = 'a1000000-0000-4000-8000-000000000004';
const itemId = 'a1000000-0000-4000-8000-000000000005';
const userId = 'a1000000-0000-4000-8000-000000000006';
const sectionInstanceId = 'a1000000-0000-4000-8000-000000000007';

function baseBundle(): InspectionBundleResponse {
  return {
    inspection: {
      id: inspectionId,
      code: 'INS-OWNER',
      inspectionType: 'move_in',
      unitId,
      tenancyId: null,
      schemaVersionId: schemaId,
      assignedToUserId: userId,
      createdByUserId: userId,
      scheduledFor: null,
      status: 'in_progress',
      startedAt: '2026-09-22T08:00:00.000Z',
      lockedAt: null,
      finalizedAt: null,
      cancelledAt: null,
      version: 2,
      contentRevision: 0,
    },
    schema: {
      id: schemaId,
      schemaCode: 'MOVE-IN',
      versionNumber: 1,
      inspectionType: 'move_in',
      title: 'Move in',
      status: 'published',
      requiredSignatureRoles: [],
      sections: [{
        id: sectionId,
        key: 'general',
        title: 'General',
        description: null,
        sortOrder: 0,
        scope: 'unit',
        spaceTypes: [],
        items: [{
          id: itemId,
          sectionId,
          key: 'condition',
          type: 'text',
          label: 'Condition',
          required: false,
          sortOrder: 0,
          options: [],
          visibleWhen: null,
          requiredWhen: null,
        }],
      }],
    },
    sectionInstances: [{
      id: sectionInstanceId,
      inspectionId,
      sectionId,
      scope: 'unit',
      spaceId: null,
      spaceCode: null,
      spaceName: null,
      spaceType: null,
      spaceSortOrder: null,
    }],
    sectionStates: [{ sectionInstanceId, sectionId, revision: 0 }],
    responses: [],
    findings: [],
    evidence: [],
    signatures: [],
    finalSnapshot: null,
  };
}

function finding(id: string): InspectionFindingResponse {
  return {
    id,
    inspectionId,
    sectionInstanceId,
    sectionId,
    itemId,
    severity: 'major',
    title: 'Window scratch',
    description: 'Visible on handover.',
    createdByUserId: userId,
    createdAt: '2026-09-22T08:30:00.000Z',
  };
}

function evidence(id: string, documentVersionId: string): InspectionEvidenceResponse {
  return {
    id,
    inspectionId,
    sectionInstanceId,
    sectionId,
    itemId,
    documentVersionId,
    kind: 'photo',
    caption: 'Window scratch',
    createdByUserId: userId,
    createdAt: '2026-09-22T08:35:00.000Z',
  };
}

describe('Inspection content ownership and recovery', () => {
  it('fails closed when a canonical bundle contains Finding data from another Inspection', () => {
    const bundle = baseBundle();
    expect(() =>
      assertInspectionBundleOwner(inspectionId, unitId, {
        ...bundle,
        findings: [{ ...finding('a2000000-0000-4000-8000-000000000001'), inspectionId: 'b1000000-0000-4000-8000-000000000001' }],
      }),
    ).toThrow(/another Inspection/);
  });

  it('fails closed when Evidence item ownership crosses the active schema section', () => {
    const bundle = baseBundle();
    expect(() =>
      assertInspectionBundleOwner(inspectionId, unitId, {
        ...bundle,
        evidence: [{
          ...evidence(
            'a2000000-0000-4000-8000-000000000002',
            'a3000000-0000-4000-8000-000000000001',
          ),
          itemId: 'b2000000-0000-4000-8000-000000000001',
        }],
      }),
    ).toThrow(/another schema section/);
  });

  it('fails closed when a response claims the right section but another section instance', () => {
    const bundle = baseBundle();
    expect(() =>
      assertInspectionBundleOwner(inspectionId, unitId, {
        ...bundle,
        responses: [{
          id: 'a2000000-0000-4000-8000-000000000010',
          inspectionId,
          sectionInstanceId:
            'b1000000-0000-4000-8000-000000000007',
          sectionId,
          itemId,
          value: 'Good',
          comment: null,
          updatedByUserId: userId,
          updatedAt: '2026-09-22T08:25:00.000Z',
        }],
      }),
    ).toThrow(/another Inspection section instance/);
  });

  it('validates returned Finding registration without inventing a uniqueness key', () => {
    const bundle = baseBundle();
    const created = finding('a2000000-0000-4000-8000-000000000011');
    expect(() =>
      assertInspectionBundleOwner(inspectionId, unitId, {
        ...bundle,
        findings: [created],
      }),
    ).not.toThrow();
  });

  it('recovers an Evidence link by exact DocumentVersion and scope without accepting an old duplicate', () => {
    const versionId = 'a3000000-0000-4000-8000-000000000010';
    const old = evidence('a2000000-0000-4000-8000-000000000020', versionId);
    const recovered = evidence('a2000000-0000-4000-8000-000000000021', versionId);
    const bundle = { ...baseBundle(), evidence: [old, recovered] };

    expect(
      findRecoveredInspectionEvidence(
        bundle,
        new Set([old.id]),
        {
          inspectionId,
          sectionInstanceId,
          sectionId,
          itemId,
          documentVersionId: versionId,
          kind: 'photo',
          caption: 'Window scratch',
        },
      )?.id,
    ).toBe(recovered.id);
  });

  it('recovers Document creation and upload only from one new canonical identity', () => {
    const document: DocumentResponse = {
      id: 'a4000000-0000-4000-8000-000000000001',
      code: 'EVID-001',
      title: 'Window photo',
      category: 'photo',
      status: 'active',
      latestVersionNumber: 0,
      revision: 1,
    };
    expect(
      findRecoveredEvidenceDocument(
        [document],
        new Set(),
        { code: 'EVID-001', title: 'Window photo', category: 'photo' },
      )?.id,
    ).toBe(document.id);

    const version: DocumentVersionResponse = {
      id: 'a5000000-0000-4000-8000-000000000001',
      documentId: document.id,
      versionNumber: 1,
      fileName: 'window.jpg',
      mimeType: 'image/jpeg',
      byteSize: 3,
      sha256: 'a'.repeat(64),
      status: 'stored',
      finalizedAt: null,
    };
    expect(
      findRecoveredUploadedDocumentVersion(
        [version],
        new Set(),
        document,
        { fileName: 'window.jpg', mimeType: 'image/jpeg', byteSize: 3 },
      )?.id,
    ).toBe(version.id);
  });
});
