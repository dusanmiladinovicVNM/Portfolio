import { describe, expect, it } from 'vitest';
import type { InspectionBundleResponse } from '@portfolio/contracts';
import {
  buildInspectionPreLockReview,
  sameInspectionPreLockReviewSource,
} from '../src/dossier/inspection-pre-lock-review.js';

const ids = {
  inspection: '11111111-1111-4111-8111-111111111111',
  schema: '22222222-2222-4222-8222-222222222222',
  unitSection: '33333333-3333-4333-8333-333333333333',
  roomSection: '44444444-4444-4444-8444-444444444444',
  unitInstance: '55555555-5555-4555-8555-555555555555',
  roomInstance: '66666666-6666-4666-8666-666666666666',
  conditionItem: '77777777-7777-4777-8777-777777777777',
  noteItem: '88888888-8888-4888-8888-888888888888',
  hiddenItem: '99999999-9999-4999-8999-999999999999',
  response1: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  response2: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  response3: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  finding: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  evidence: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  generalEvidence: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
  user: '12121212-1212-4212-8212-121212121212',
  space: '13131313-1313-4313-8313-131313131313',
  documentVersion: '14141414-1414-4414-8414-141414141414',
  generalDocumentVersion: '15151515-1515-4515-8515-151515151515',
};

function bundle(): InspectionBundleResponse {
  return {
    inspection: {
      id: ids.inspection,
      code: 'INS-REVIEW-001',
      inspectionType: 'move_in',
      unitId: '16161616-1616-4616-8616-161616161616',
      tenancyId: null,
      schemaVersionId: ids.schema,
      assignedToUserId: ids.user,
      createdByUserId: ids.user,
      scheduledFor: '2026-09-26',
      status: 'in_progress',
      startedAt: '2026-09-26T08:00:00.000Z',
      lockedAt: null,
      finalizedAt: null,
      cancelledAt: null,
      version: 3,
      contentRevision: 7,
    },
    schema: {
      id: ids.schema,
      schemaCode: 'MOVE-IN',
      versionNumber: 1,
      inspectionType: 'move_in',
      title: 'Move-in',
      status: 'published',
      requiredSignatureRoles: ['tenant', 'landlord'],
      sections: [
        {
          id: ids.unitSection,
          key: 'general',
          title: 'General',
          description: null,
          sortOrder: 0,
          scope: 'unit',
          spaceTypes: [],
          items: [
            {
              id: ids.conditionItem,
              sectionId: ids.unitSection,
              key: 'condition',
              type: 'select',
              label: 'Condition',
              required: true,
              sortOrder: 0,
              options: [
                { value: 'good', label: 'Good' },
                { value: 'damaged', label: 'Damaged' },
              ],
              visibleWhen: null,
              requiredWhen: null,
            },
          ],
        },
        {
          id: ids.roomSection,
          key: 'room',
          title: 'Room',
          description: null,
          sortOrder: 1,
          scope: 'space',
          spaceTypes: ['bedroom'],
          items: [
            {
              id: ids.noteItem,
              sectionId: ids.roomSection,
              key: 'damage-note',
              type: 'textarea',
              label: 'Damage notes',
              required: false,
              sortOrder: 0,
              options: [],
              visibleWhen: {
                fieldKey: 'condition',
                operator: 'equals',
                value: 'damaged',
              },
              requiredWhen: {
                fieldKey: 'condition',
                operator: 'equals',
                value: 'damaged',
              },
            },
            {
              id: ids.hiddenItem,
              sectionId: ids.roomSection,
              key: 'legacy-note',
              type: 'text',
              label: 'Legacy note',
              required: false,
              sortOrder: 1,
              options: [],
              visibleWhen: {
                fieldKey: 'condition',
                operator: 'equals',
                value: 'good',
              },
              requiredWhen: null,
            },
          ],
        },
      ],
    },
    sectionInstances: [
      {
        id: ids.unitInstance,
        inspectionId: ids.inspection,
        sectionId: ids.unitSection,
        scope: 'unit',
        spaceId: null,
        spaceCode: null,
        spaceName: null,
        spaceType: null,
        spaceSortOrder: null,
      },
      {
        id: ids.roomInstance,
        inspectionId: ids.inspection,
        sectionId: ids.roomSection,
        scope: 'space',
        spaceId: ids.space,
        spaceCode: 'BED-01',
        spaceName: 'Bedroom 1',
        spaceType: 'bedroom',
        spaceSortOrder: 0,
      },
    ],
    sectionStates: [
      {
        sectionInstanceId: ids.unitInstance,
        sectionId: ids.unitSection,
        revision: 1,
      },
      {
        sectionInstanceId: ids.roomInstance,
        sectionId: ids.roomSection,
        revision: 2,
      },
    ],
    responses: [
      {
        id: ids.response1,
        inspectionId: ids.inspection,
        sectionInstanceId: ids.unitInstance,
        sectionId: ids.unitSection,
        itemId: ids.conditionItem,
        value: 'damaged',
        comment: null,
        updatedByUserId: ids.user,
        updatedAt: '2026-09-26T08:10:00.000Z',
      },
      {
        id: ids.response2,
        inspectionId: ids.inspection,
        sectionInstanceId: ids.roomInstance,
        sectionId: ids.roomSection,
        itemId: ids.noteItem,
        value: 'Window scratch',
        comment: 'Photographed.',
        updatedByUserId: ids.user,
        updatedAt: '2026-09-26T08:11:00.000Z',
      },
      {
        id: ids.response3,
        inspectionId: ids.inspection,
        sectionInstanceId: ids.roomInstance,
        sectionId: ids.roomSection,
        itemId: ids.hiddenItem,
        value: 'Old hidden answer',
        comment: null,
        updatedByUserId: ids.user,
        updatedAt: '2026-09-26T08:12:00.000Z',
      },
    ],
    findings: [
      {
        id: ids.finding,
        inspectionId: ids.inspection,
        sectionInstanceId: ids.roomInstance,
        sectionId: ids.roomSection,
        itemId: ids.noteItem,
        severity: 'minor',
        title: 'Window scratch',
        description: 'Scratch on inner pane.',
        createdByUserId: ids.user,
        createdAt: '2026-09-26T08:20:00.000Z',
      },
    ],
    evidence: [
      {
        id: ids.evidence,
        inspectionId: ids.inspection,
        sectionInstanceId: ids.roomInstance,
        sectionId: ids.roomSection,
        itemId: ids.noteItem,
        documentVersionId: ids.documentVersion,
        kind: 'photo',
        caption: 'Window scratch photo',
        createdByUserId: ids.user,
        createdAt: '2026-09-26T08:21:00.000Z',
      },
      {
        id: ids.generalEvidence,
        inspectionId: ids.inspection,
        sectionInstanceId: null,
        sectionId: null,
        itemId: null,
        documentVersionId: ids.generalDocumentVersion,
        kind: 'attachment',
        caption: 'General handover note',
        createdByUserId: ids.user,
        createdAt: '2026-09-26T08:22:00.000Z',
      },
    ],
    signatures: [],
    finalSnapshot: null,
  };
}

describe('Inspection pre-lock review', () => {
  it('summarizes canonical SectionInstance-owned responses, findings and evidence', () => {
    const review = buildInspectionPreLockReview(bundle());

    expect(review.requiredAnswered).toBe(2);
    expect(review.requiredTotal).toBe(2);
    expect(review.complete).toBe(true);
    expect(review.findingsTotal).toBe(1);
    expect(review.evidenceTotal).toBe(2);
    expect(review.generalEvidence).toHaveLength(1);

    const room = review.sections.find(
      (section) => section.sectionInstanceId === ids.roomInstance,
    );
    expect(room?.title).toBe('Bedroom 1');
    expect(room?.findings).toHaveLength(1);
    expect(room?.evidence).toHaveLength(1);
    expect(
      room?.items.find((item) => item.itemId === ids.noteItem),
    ).toMatchObject({
      visible: true,
      required: true,
      missingRequired: false,
      answer: 'Window scratch',
      comment: 'Photographed.',
    });
  });

  it('keeps a persisted response visible in review even when its field is currently hidden', () => {
    const review = buildInspectionPreLockReview(bundle());
    const room = review.sections.find(
      (section) => section.sectionInstanceId === ids.roomInstance,
    );
    expect(
      room?.items.find((item) => item.itemId === ids.hiddenItem),
    ).toMatchObject({
      visible: false,
      hasResponse: true,
      answer: 'Old hidden answer',
    });
  });

  it('invalidates a reviewed source when canonical lifecycle or content revision changes', () => {
    const reviewed = bundle();
    expect(sameInspectionPreLockReviewSource(reviewed, reviewed)).toBe(true);

    const contentChanged = {
      ...reviewed,
      inspection: {
        ...reviewed.inspection,
        contentRevision: reviewed.inspection.contentRevision + 1,
      },
    };
    expect(
      sameInspectionPreLockReviewSource(contentChanged, reviewed),
    ).toBe(false);

    const lifecycleChanged = {
      ...reviewed,
      inspection: {
        ...reviewed.inspection,
        version: reviewed.inspection.version + 1,
      },
    };
    expect(
      sameInspectionPreLockReviewSource(lifecycleChanged, reviewed),
    ).toBe(false);
  });
});
