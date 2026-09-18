import { describe, expect, it } from 'vitest';
import {
  asInspectionFindingId,
  asInspectionId,
  asInspectionResponseId,
  asInspectionSchemaItemId,
  asInspectionSchemaSectionId,
  asInspectionSchemaVersionId,
  asTenancyId,
  asUnitId,
  asUserId,
  cancelInspection,
  createInspection,
  createInspectionFinding,
  createInspectionResponse,
  createInspectionSchemaVersion,
  findMissingRequiredInspectionItems,
  lockInspection,
  publishInspectionSchemaVersion,
  startInspection,
} from '../src/index.js';

const schema = createInspectionSchemaVersion({
  id: asInspectionSchemaVersionId('71000000-0000-4000-8000-000000000001'),
  schemaCode: 'MOVE-IN',
  versionNumber: 1,
  inspectionType: 'move_in',
  title: 'Move-in inspection',
  sections: [
    {
      id: asInspectionSchemaSectionId('71000000-0000-4000-8000-000000000002'),
      key: 'general',
      title: 'General',
      sortOrder: 0,
      items: [
        {
          id: asInspectionSchemaItemId('71000000-0000-4000-8000-000000000003'),
          key: 'condition',
          type: 'select',
          label: 'Condition',
          required: true,
          sortOrder: 0,
          options: [
            { value: 'good', label: 'Good' },
            { value: 'damaged', label: 'Damaged' },
          ],
        },
        {
          id: asInspectionSchemaItemId('71000000-0000-4000-8000-000000000004'),
          key: 'damage_note',
          type: 'textarea',
          label: 'Damage note',
          sortOrder: 1,
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
      ],
    },
  ],
});

const inspection = createInspection({
  id: asInspectionId('72000000-0000-4000-8000-000000000001'),
  code: 'INS-1',
  inspectionType: 'move_in',
  unitId: asUnitId('72000000-0000-4000-8000-000000000002'),
  tenancyId: asTenancyId('72000000-0000-4000-8000-000000000003'),
  schemaVersionId: schema.id,
  assignedToUserId: asUserId('72000000-0000-4000-8000-000000000004'),
  createdByUserId: asUserId('72000000-0000-4000-8000-000000000005'),
});

describe('Inspection schema and lifecycle', () => {
  it('publishes an immutable schema-shaped version without changing its identity', () => {
    const published = publishInspectionSchemaVersion(schema);
    expect(published.status).toBe('published');
    expect(published.id).toBe(schema.id);
    expect(() => publishInspectionSchemaVersion(published)).toThrowError(
      /Only a draft schema version/,
    );
  });

  it('requires draft → in_progress before lock', () => {
    expect(() =>
      lockInspection(inspection, '2026-09-18T20:00:00.000Z'),
    ).toThrowError(/Only an in-progress inspection/);
  });

  it('keeps lifecycle and content mutability separate', () => {
    const started = startInspection(inspection, '2026-09-18T20:00:00.000Z');
    expect(started).toMatchObject({ status: 'in_progress', version: 2 });

    const locked = lockInspection(started, '2026-09-18T21:00:00.000Z');
    expect(locked).toMatchObject({ status: 'locked', version: 3 });

    expect(() =>
      createInspectionFinding(locked, {
        id: asInspectionFindingId('72000000-0000-4000-8000-000000000006'),
        inspectionId: locked.id,
        sectionId: schema.sections[0]!.id,
        severity: 'minor',
        title: 'Scratch',
        createdByUserId: inspection.createdByUserId,
        createdAt: '2026-09-18T21:01:00.000Z',
      }),
    ).toThrowError(/no longer editable/);
  });

  it('validates response type against the versioned item definition', () => {
    const item = schema.sections[0]!.items[0]!;
    expect(() =>
      createInspectionResponse({
        id: asInspectionResponseId('72000000-0000-4000-8000-000000000007'),
        inspectionId: inspection.id,
        item,
        value: true,
        updatedByUserId: inspection.createdByUserId,
        updatedAt: '2026-09-18T20:00:00.000Z',
      }),
    ).toThrowError(/configured option/);
  });

  it('evaluates conditional required fields from typed responses', () => {
    const condition = createInspectionResponse({
      id: asInspectionResponseId('72000000-0000-4000-8000-000000000008'),
      inspectionId: inspection.id,
      item: schema.sections[0]!.items[0]!,
      value: 'damaged',
      updatedByUserId: inspection.createdByUserId,
      updatedAt: '2026-09-18T20:00:00.000Z',
    });

    expect(findMissingRequiredInspectionItems(schema, [condition])).toEqual([
      {
        sectionId: schema.sections[0]!.id,
        itemId: schema.sections[0]!.items[1]!.id,
        itemKey: 'damage_note',
        label: 'Damage note',
      },
    ]);
  });

  it('keeps cancelled inspection terminal for the backbone workflow', () => {
    const cancelled = cancelInspection(
      inspection,
      '2026-09-18T20:00:00.000Z',
    );
    expect(cancelled.status).toBe('cancelled');
    expect(() =>
      startInspection(cancelled, '2026-09-18T20:01:00.000Z'),
    ).toThrowError(/Only a draft inspection/);
  });
});
