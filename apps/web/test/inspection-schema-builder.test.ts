import { describe, expect, it } from 'vitest';
import type { InspectionSchemaVersionResponse } from '@portfolio/contracts';
import {
  conditionSourcesForItem,
  duplicateInspectionSchemaSection,
  inspectionSchemaDraftFromVersion,
  inspectionSchemaDraftRequest,
  inspectionSchemaVersionMatchesRequest,
  renameInspectionSchemaItemKey,
  validateInspectionSchemaBuilderDraft,
} from '../src/admin/inspection-schema-builder.js';

const schema: InspectionSchemaVersionResponse = {
  id: '11111111-1111-4111-8111-111111111111',
  schemaCode: 'MOVE-IN',
  versionNumber: 3,
  inspectionType: 'move_in',
  title: 'Move-in inspection',
  status: 'published',
  requiredSignatureRoles: ['tenant', 'landlord'],
  sections: [
    {
      id: '22222222-2222-4222-8222-222222222222',
      key: 'general',
      title: 'General',
      description: 'Overall condition',
      sortOrder: 0,
      scope: 'unit',
      spaceTypes: [],
      items: [
        {
          id: '33333333-3333-4333-8333-333333333333',
          sectionId: '22222222-2222-4222-8222-222222222222',
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
      id: '44444444-4444-4444-8444-444444444444',
      key: 'rooms',
      title: 'Rooms',
      description: null,
      sortOrder: 1,
      scope: 'space',
      spaceTypes: ['bedroom', 'living_room'],
      items: [
        {
          id: '55555555-5555-4555-8555-555555555555',
          sectionId: '44444444-4444-4444-8444-444444444444',
          key: 'room_condition',
          type: 'select',
          label: 'Room condition',
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
          id: '66666666-6666-4666-8666-666666666666',
          sectionId: '44444444-4444-4444-8444-444444444444',
          key: 'damage_note',
          type: 'textarea',
          label: 'Damage note',
          required: false,
          sortOrder: 1,
          options: [],
          visibleWhen: {
            all: [
              {
                fieldKey: 'condition',
                operator: 'equals',
                value: 'damaged',
              },
              {
                fieldKey: 'room_condition',
                operator: 'equals',
                value: 'damaged',
              },
            ],
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
};

describe('Inspection Schema Builder model', () => {
  it('forks a canonical version without leaking persistence IDs into the create request', () => {
    const draft = inspectionSchemaDraftFromVersion(schema);
    const request = inspectionSchemaDraftRequest(draft);

    expect(request).toEqual({
      schemaCode: 'MOVE-IN',
      inspectionType: 'move_in',
      title: 'Move-in inspection',
      requiredSignatureRoles: ['tenant', 'landlord'],
      sections: [
        {
          key: 'general',
          title: 'General',
          description: 'Overall condition',
          sortOrder: 0,
          scope: 'unit',
          spaceTypes: [],
          items: [
            {
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
          key: 'rooms',
          title: 'Rooms',
          sortOrder: 1,
          scope: 'space',
          spaceTypes: ['bedroom', 'living_room'],
          items: expect.any(Array),
        },
      ],
    });
    expect(validateInspectionSchemaBuilderDraft(draft)).toEqual([]);
  });

  it('propagates field-key rename into all visual conditions', () => {
    const draft = inspectionSchemaDraftFromVersion(schema);
    const source = draft.sections[1]!.items[0]!;
    const renamed = renameInspectionSchemaItemKey(
      draft,
      source.id,
      'space_condition',
    );
    const dependent = renamed.sections[1]!.items[1]!;

    expect(dependent.visibleWhen).toEqual({
      all: [
        {
          fieldKey: 'condition',
          operator: 'equals',
          value: 'damaged',
        },
        {
          fieldKey: 'space_condition',
          operator: 'equals',
          value: 'damaged',
        },
      ],
    });
    expect(dependent.requiredWhen).toEqual({
      fieldKey: 'space_condition',
      operator: 'equals',
      value: 'damaged',
    });
    expect(validateInspectionSchemaBuilderDraft(renamed)).toEqual([]);
  });

  it('duplicates one Space section with globally unique field keys and remaps internal conditions', () => {
    const draft = inspectionSchemaDraftFromVersion(schema);
    const source = draft.sections[1]!;
    const duplicated = duplicateInspectionSchemaSection(draft, source.id);
    const copy = duplicated.sections[2]!;

    expect(copy.key).not.toBe(source.key);
    expect(copy.items[0]!.key).not.toBe(source.items[0]!.key);
    expect(copy.items[1]!.key).not.toBe(source.items[1]!.key);

    const copiedCondition = copy.items[1]!.visibleWhen;
    expect(copiedCondition).toEqual({
      all: [
        {
          fieldKey: 'condition',
          operator: 'equals',
          value: 'damaged',
        },
        {
          fieldKey: copy.items[0]!.key,
          operator: 'equals',
          value: 'damaged',
        },
      ],
    });
    expect(validateInspectionSchemaBuilderDraft(duplicated)).toEqual([]);
  });

  it('filters condition sources by Unit/Space context before the condition builder can choose them', () => {
    const draft = inspectionSchemaDraftFromVersion(schema);
    const unitSection = draft.sections[0]!;
    const roomSection = draft.sections[1]!;
    const unitSources = conditionSourcesForItem(
      draft,
      unitSection.id,
      unitSection.items[0]!.id,
    );
    const roomSources = conditionSourcesForItem(
      draft,
      roomSection.id,
      roomSection.items[1]!.id,
    );

    expect(unitSources.map((field) => field.key)).toEqual([]);
    expect(roomSources.map((field) => field.key)).toEqual([
      'condition',
      'room_condition',
    ]);
  });

  it('blocks structurally invalid operational drafts before POST', () => {
    const draft = inspectionSchemaDraftFromVersion(schema);
    const invalid = {
      ...draft,
      sections: [
        {
          ...draft.sections[0]!,
          spaceTypes: ['bedroom'] as const,
        },
        {
          ...draft.sections[1]!,
          spaceTypes: [] as const,
          items: [
            {
              ...draft.sections[1]!.items[0]!,
              key: 'condition',
            },
          ],
        },
      ],
    };

    const messages = validateInspectionSchemaBuilderDraft(invalid).map(
      (issue) => issue.message,
    );
    expect(messages).toContain('Unit sections cannot target Space types.');
    expect(messages).toContain('Space sections need at least one Space type.');
    expect(messages).toContain('Item keys must be globally unique.');
  });

  it('recovers only an exact new canonical draft after ambiguous create', () => {
    const request = inspectionSchemaDraftRequest(
      inspectionSchemaDraftFromVersion(schema),
    );
    const matching: InspectionSchemaVersionResponse = {
      ...schema,
      id: '77777777-7777-4777-8777-777777777777',
      versionNumber: 4,
      status: 'draft',
    };
    expect(
      inspectionSchemaVersionMatchesRequest(matching, request),
    ).toBe(true);
    expect(
      inspectionSchemaVersionMatchesRequest(
        { ...matching, title: 'Different schema' },
        request,
      ),
    ).toBe(false);
    expect(
      inspectionSchemaVersionMatchesRequest(
        { ...matching, status: 'published' },
        request,
      ),
    ).toBe(false);
  });
});
