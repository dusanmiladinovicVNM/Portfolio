import { describe, expect, it } from 'vitest';
import type {
  InspectionBundleResponse,
  InspectionItemResponse,
} from '@portfolio/contracts';
import {
  buildInspectionSectionPatch,
  normalizedInspectionAnswer,
} from '../src/dossier/UnitInspections.js';

type Section = InspectionBundleResponse['schema']['sections'][number];

const sectionId = 'a1000000-0000-4000-8000-000000000003';
const textItemId = 'a1000000-0000-4000-8000-000000000004';
const booleanItemId = 'a1000000-0000-4000-8000-000000000005';

const section: Section = {
  id: sectionId,
  key: 'general',
  title: 'General',
  description: null,
  sortOrder: 0,
  items: [
    {
      id: textItemId,
      sectionId,
      key: 'notes',
      type: 'text',
      label: 'Notes',
      required: false,
      sortOrder: 0,
      options: [],
      visibleWhen: null,
      requiredWhen: null,
    },
    {
      id: booleanItemId,
      sectionId,
      key: 'present',
      type: 'checkbox',
      label: 'Present',
      required: false,
      sortOrder: 1,
      options: [],
      visibleWhen: null,
      requiredWhen: null,
    },
  ],
};

function response(
  itemId: string,
  value: InspectionItemResponse['value'],
): InspectionItemResponse {
  return {
    id: 'a2000000-0000-4000-8000-000000000001',
    inspectionId: 'a2000000-0000-4000-8000-000000000002',
    sectionId,
    itemId,
    value,
    comment: null,
    updatedByUserId: 'a2000000-0000-4000-8000-000000000003',
    updatedAt: '2026-09-21T20:00:00.000Z',
  };
}

describe('Inspection section patch builder', () => {
  it('maps a cleared text answer to PATCH clear[] instead of an empty response', () => {
    const patch = buildInspectionSectionPatch(
      section,
      [response(textItemId, 'Existing note')],
      {
        [textItemId]: { value: '', comment: '' },
        [booleanItemId]: { value: undefined, comment: '' },
      },
      { [textItemId]: true },
      4,
    );

    expect(patch).toEqual({
      expectedRevision: 4,
      set: [],
      clear: [textItemId],
    });
  });

  it('preserves false as an answered boolean rather than treating it as empty', () => {
    expect(
      normalizedInspectionAnswer(section.items[1]!, false),
    ).toBe(false);

    const patch = buildInspectionSectionPatch(
      section,
      [],
      {
        [textItemId]: { value: undefined, comment: '' },
        [booleanItemId]: { value: false, comment: '' },
      },
      { [booleanItemId]: true },
      0,
    );

    expect(patch?.set).toEqual([
      {
        itemId: booleanItemId,
        value: false,
        comment: null,
      },
    ]);
  });

  it('emits no PATCH when a touched answer still matches canonical state', () => {
    expect(
      buildInspectionSectionPatch(
        section,
        [response(textItemId, 'Same')],
        {
          [textItemId]: { value: 'Same', comment: '' },
          [booleanItemId]: { value: undefined, comment: '' },
        },
        { [textItemId]: true },
        9,
      ),
    ).toBeNull();
  });

  it('treats multiselect answers as a set for no-op detection', () => {
    const multiselectItemId = 'a1000000-0000-4000-8000-000000000006';
    const multiselectSection: Section = {
      ...section,
      items: [
        {
          id: multiselectItemId,
          sectionId,
          key: 'tags',
          type: 'multiselect',
          label: 'Tags',
          required: false,
          sortOrder: 0,
          options: [
            { value: 'a', label: 'A' },
            { value: 'b', label: 'B' },
          ],
          visibleWhen: null,
          requiredWhen: null,
        },
      ],
    };

    expect(
      buildInspectionSectionPatch(
        multiselectSection,
        [response(multiselectItemId, ['a', 'b'])],
        {
          [multiselectItemId]: {
            value: ['b', 'a'],
            comment: '',
          },
        },
        { [multiselectItemId]: true },
        2,
      ),
    ).toBeNull();
  });

});
