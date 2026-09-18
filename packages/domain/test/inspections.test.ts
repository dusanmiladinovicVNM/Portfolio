import { describe, expect, it } from 'vitest';
import {
  asDocumentVersionId,
  asInspectionFinalSnapshotId,
  asInspectionFindingId,
  asInspectionId,
  asInspectionResponseId,
  asInspectionSchemaItemId,
  asInspectionSchemaSectionId,
  asInspectionSchemaVersionId,
  asInspectionSignatureId,
  asInspectionUnlockId,
  asTenancyId,
  asUnitId,
  asUserId,
  cancelInspection,
  createInspection,
  createInspectionFinalSnapshot,
  createInspectionFinding,
  createInspectionResponse,
  createInspectionSchemaVersion,
  createInspectionSignature,
  createInspectionUnlockRecord,
  finalizeInspection,
  findMissingRequiredInspectionItems,
  lockInspection,
  publishInspectionSchemaVersion,
  startInspection,
  unlockInspection,
} from '../src/index.js';

const schema = createInspectionSchemaVersion({
  id: asInspectionSchemaVersionId('71000000-0000-4000-8000-000000000001'),
  schemaCode: 'MOVE-IN',
  versionNumber: 1,
  inspectionType: 'move_in',
  title: 'Move-in inspection',
  requiredSignatureRoles: ['landlord', 'tenant'],
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

  it('requires the schema signature policy before creating a final snapshot', () => {
    const started = startInspection(inspection, '2026-09-18T20:00:00.000Z');
    const locked = lockInspection(started, '2026-09-18T21:00:00.000Z');
    const landlord = createInspectionSignature(locked, {
      id: asInspectionSignatureId('73000000-0000-4000-8000-000000000001'),
      inspectionId: locked.id,
      signerRole: 'landlord',
      signerPartyId: null,
      signerName: 'Landlord Representative',
      signatureDocumentVersionId: asDocumentVersionId(
        '73000000-0000-4000-8000-000000000002',
      ),
      signedByUserId: locked.assignedToUserId,
      signedAt: '2026-09-18T21:05:00.000Z',
    });

    expect(() =>
      createInspectionFinalSnapshot(
        locked,
        finalizeInspection(locked, '2026-09-18T21:10:00.000Z'),
        schema,
        [],
        [],
        [],
        [landlord],
        {
          id: asInspectionFinalSnapshotId(
            '73000000-0000-4000-8000-000000000003',
          ),
          createdByUserId: inspection.createdByUserId,
          createdAt: '2026-09-18T21:10:00.000Z',
        },
      ),
    ).toThrowError(/tenant/);

    const tenant = createInspectionSignature(locked, {
      id: asInspectionSignatureId('73000000-0000-4000-8000-000000000004'),
      inspectionId: locked.id,
      signerRole: 'tenant',
      signerPartyId: null,
      signerName: 'Tenant',
      signatureDocumentVersionId: asDocumentVersionId(
        '73000000-0000-4000-8000-000000000005',
      ),
      signedByUserId: locked.assignedToUserId,
      signedAt: '2026-09-18T21:06:00.000Z',
    });

    const finalizedHeader = finalizeInspection(
      locked,
      '2026-09-18T21:10:00.000Z',
    );
    const snapshot = createInspectionFinalSnapshot(
      locked,
      finalizedHeader,
      schema,
      [],
      [],
      [],
      [landlord, tenant],
      {
        id: asInspectionFinalSnapshotId(
          '73000000-0000-4000-8000-000000000006',
        ),
        createdByUserId: inspection.createdByUserId,
        createdAt: '2026-09-18T21:10:00.000Z',
      },
    );
    expect(snapshot.payload.signatures.map((item) => item.signerRole)).toEqual([
      'landlord',
      'tenant',
    ]);

    expect(snapshot.payload.inspection).toMatchObject({
      status: 'finalized',
      finalizedAt: '2026-09-18T21:10:00.000Z',
      version: locked.version + 1,
    });
  });

  it('models controlled unlock as a new revision boundary', () => {
    const started = startInspection(inspection, '2026-09-18T20:00:00.000Z');
    const locked = lockInspection(started, '2026-09-18T21:00:00.000Z');
    const unlocked = unlockInspection(locked);
    expect(unlocked).toMatchObject({
      status: 'in_progress',
      lockedAt: null,
      version: locked.version + 1,
      contentRevision: locked.contentRevision + 1,
    });

    const record = createInspectionUnlockRecord(locked, unlocked, {
      id: asInspectionUnlockId('73000000-0000-4000-8000-000000000007'),
      unlockedByUserId: inspection.createdByUserId,
      unlockedAt: '2026-09-18T21:15:00.000Z',
      reason: 'Correct a handover answer',
    });
    expect(record).toMatchObject({
      previousVersion: locked.version,
      newVersion: unlocked.version,
      reason: 'Correct a handover answer',
    });
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
