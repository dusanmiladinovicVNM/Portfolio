import type { InspectionProgressSource } from '../src/dossier/inspection-progress.js';
import {
  buildInspectionRequiredProgress,
  inspectionAnswerPresent,
} from '../src/dossier/inspection-progress.js';
import { describe, expect, it } from 'vitest';

const unitSectionId = '10000000-0000-4000-8000-000000000001';
const roomSectionId = '10000000-0000-4000-8000-000000000002';
const unitInstanceId = '20000000-0000-4000-8000-000000000001';
const bedroom1InstanceId = '20000000-0000-4000-8000-000000000002';
const bedroom2InstanceId = '20000000-0000-4000-8000-000000000003';
const unitItemId = '30000000-0000-4000-8000-000000000001';
const roomConditionItemId = '30000000-0000-4000-8000-000000000002';
const roomDamageItemId = '30000000-0000-4000-8000-000000000003';

function source(
  responses: InspectionProgressSource['responses'],
): InspectionProgressSource {
  return {
    schema: {
      id: '40000000-0000-4000-8000-000000000001',
      schemaCode: 'PROGRESS',
      versionNumber: 1,
      inspectionType: 'move_in',
      title: 'Progress fixture',
      status: 'published',
      requiredSignatureRoles: [],
      sections: [
        {
          id: unitSectionId,
          key: 'general',
          title: 'General',
          description: null,
          sortOrder: 0,
          scope: 'unit',
          spaceTypes: [],
          items: [
            {
              id: unitItemId,
              sectionId: unitSectionId,
              key: 'occupancy',
              type: 'text',
              label: 'Occupancy',
              required: true,
              sortOrder: 0,
              options: [],
              visibleWhen: null,
              requiredWhen: null,
            },
          ],
        },
        {
          id: roomSectionId,
          key: 'room',
          title: 'Room',
          description: null,
          sortOrder: 1,
          scope: 'space',
          spaceTypes: ['bedroom'],
          items: [
            {
              id: roomConditionItemId,
              sectionId: roomSectionId,
              key: 'room_condition',
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
            {
              id: roomDamageItemId,
              sectionId: roomSectionId,
              key: 'room_damage_note',
              type: 'text',
              label: 'Damage note',
              required: false,
              sortOrder: 1,
              options: [],
              visibleWhen: {
                fieldKey: 'room_condition',
                operator: 'equals',
                value: 'damaged',
              },
              requiredWhen: {
                fieldKey: 'room_condition',
                operator: 'equals',
                value: 'damaged',
              },
            },
          ],
        },
      ],
    },
    sectionInstances: [
      {
        id: unitInstanceId,
        inspectionId: '50000000-0000-4000-8000-000000000001',
        sectionId: unitSectionId,
        scope: 'unit',
        spaceId: null,
        spaceCode: null,
        spaceName: null,
        spaceType: null,
        spaceSortOrder: null,
      },
      {
        id: bedroom1InstanceId,
        inspectionId: '50000000-0000-4000-8000-000000000001',
        sectionId: roomSectionId,
        scope: 'space',
        spaceId: '60000000-0000-4000-8000-000000000001',
        spaceCode: 'BED-1',
        spaceName: 'Bedroom 1',
        spaceType: 'bedroom',
        spaceSortOrder: 1,
      },
      {
        id: bedroom2InstanceId,
        inspectionId: '50000000-0000-4000-8000-000000000001',
        sectionId: roomSectionId,
        scope: 'space',
        spaceId: '60000000-0000-4000-8000-000000000002',
        spaceCode: 'BED-2',
        spaceName: 'Bedroom 2',
        spaceType: 'bedroom',
        spaceSortOrder: 2,
      },
    ],
    responses,
  };
}

function response(
  id: string,
  sectionInstanceId: string,
  sectionId: string,
  itemId: string,
  value: string | boolean | string[],
): InspectionProgressSource['responses'][number] {
  return {
    id,
    inspectionId: '50000000-0000-4000-8000-000000000001',
    sectionInstanceId,
    sectionId,
    itemId,
    value,
    comment: null,
    updatedByUserId: '70000000-0000-4000-8000-000000000001',
    updatedAt: '2026-09-26T00:00:00.000Z',
  };
}

describe('Inspection required progress', () => {
  it('keeps conditional requiredness inside the same frozen Space instance', () => {
    const progress = buildInspectionRequiredProgress(
      source([
        response('80000000-0000-4000-8000-000000000001', unitInstanceId, unitSectionId, unitItemId, 'occupied'),
        response('80000000-0000-4000-8000-000000000002', bedroom1InstanceId, roomSectionId, roomConditionItemId, 'good'),
        response('80000000-0000-4000-8000-000000000003', bedroom2InstanceId, roomSectionId, roomConditionItemId, 'damaged'),
      ]),
    );

    expect(progress).toMatchObject({
      requiredTotal: 4,
      requiredAnswered: 3,
      missingRequired: 1,
      complete: false,
    });
    expect(
      progress.sections.find(
        (section) => section.sectionInstanceId === bedroom1InstanceId,
      ),
    ).toMatchObject({
      requiredTotal: 1,
      requiredAnswered: 1,
      missingRequired: 0,
      complete: true,
    });
    expect(
      progress.sections.find(
        (section) => section.sectionInstanceId === bedroom2InstanceId,
      ),
    ).toMatchObject({
      requiredTotal: 2,
      requiredAnswered: 1,
      missingRequired: 1,
      missingItemIds: [roomDamageItemId],
      complete: false,
    });
  });

  it('becomes complete only after the canonical conditional response is saved', () => {
    const progress = buildInspectionRequiredProgress(
      source([
        response('81000000-0000-4000-8000-000000000001', unitInstanceId, unitSectionId, unitItemId, 'occupied'),
        response('81000000-0000-4000-8000-000000000002', bedroom1InstanceId, roomSectionId, roomConditionItemId, 'good'),
        response('81000000-0000-4000-8000-000000000003', bedroom2InstanceId, roomSectionId, roomConditionItemId, 'damaged'),
        response('81000000-0000-4000-8000-000000000004', bedroom2InstanceId, roomSectionId, roomDamageItemId, 'Scratch'),
      ]),
    );

    expect(progress).toMatchObject({
      requiredTotal: 4,
      requiredAnswered: 4,
      missingRequired: 0,
      complete: true,
    });
  });

  it('treats false as answered while blank text and empty multiselect remain missing', () => {
    expect(inspectionAnswerPresent(false)).toBe(true);
    expect(inspectionAnswerPresent('   ')).toBe(false);
    expect(inspectionAnswerPresent([])).toBe(false);
    expect(inspectionAnswerPresent(['x'])).toBe(true);
  });
});
