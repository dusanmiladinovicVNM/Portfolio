import { describe, expect, it } from 'vitest';
import type { PdfPort } from '@portfolio/application';
import { CanonicalInspectionPdfRenderer } from '../src/index.js';

type InspectionFinalSnapshot = Parameters<
  PdfPort['renderInspectionFinalReport']
>[0];

function snapshotFixture(): InspectionFinalSnapshot {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    inspectionId: '22222222-2222-4222-8222-222222222222',
    snapshotVersion: 1,
    inspectionVersion: 7,
    contentRevision: 9,
    createdByUserId: '33333333-3333-4333-8333-333333333333',
    createdAt: '2026-09-25T09:00:00.000Z',
    payload: {
      reportContext: {
        property: {
          id: '44444444-4444-4444-8444-444444444444',
          code: 'ZH-BIR-123',
          name: 'Birmensdorferstrasse 123 — Demo Portfolio',
          street: 'Birmensdorferstrasse',
          houseNumber: '123',
          postalCode: '8003',
          city: 'Zürich',
          countryCode: 'CH',
        },
        unit: {
          id: '55555555-5555-4555-8555-555555555555',
          code: 'ZH-BIR123-301',
          unitNumber: '3.01',
          unitType: 'office',
          floor: '3. OG',
          areaM2: 95,
          rooms: null,
        },
      },
      inspection: {
        id: '22222222-2222-4222-8222-222222222222',
        code: 'INSP-ZH-301-001',
        inspectionType: 'periodic',
        unitId: '55555555-5555-4555-8555-555555555555',
        tenancyId: null,
        schemaVersionId: '66666666-6666-4666-8666-666666666666',
        assignedToUserId: '33333333-3333-4333-8333-333333333333',
        createdByUserId: '33333333-3333-4333-8333-333333333333',
        scheduledFor: '2026-09-25',
        status: 'finalized',
        startedAt: '2026-09-25T08:00:00.000Z',
        lockedAt: '2026-09-25T08:30:00.000Z',
        finalizedAt: '2026-09-25T09:00:00.000Z',
        cancelledAt: null,
        version: 8,
        contentRevision: 9,
      },
      schema: {
        id: '66666666-6666-4666-8666-666666666666',
        schemaCode: 'PERIODIC-ZH',
        versionNumber: 1,
        inspectionType: 'periodic',
        title: 'Periodic Unit Inspection',
        status: 'published',
        requiredSignatureRoles: ['agent'],
        sections: [
          {
            id: '77777777-7777-4777-8777-777777777777',
            key: 'general',
            title: 'General condition',
            description: 'Overall state of the inspected unit.',
            sortOrder: 0,
            items: [
              {
                id: '88888888-8888-4888-8888-888888888888',
                sectionId: '77777777-7777-4777-8777-777777777777',
                key: 'condition',
                type: 'text',
                label: 'Condition',
                required: true,
                sortOrder: 0,
                options: [],
                visibleWhen: null,
                requiredWhen: null,
              },
            ],
          },
        ],
      },
      responses: [
        {
          id: '99999999-9999-4999-8999-999999999999',
          inspectionId: '22222222-2222-4222-8222-222222222222',
          sectionId: '77777777-7777-4777-8777-777777777777',
          itemId: '88888888-8888-4888-8888-888888888888',
          value: 'Good',
          comment: 'No material defects observed.',
          updatedByUserId: '33333333-3333-4333-8333-333333333333',
          updatedAt: '2026-09-25T08:20:00.000Z',
        },
      ],
      findings: [
        {
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          inspectionId: '22222222-2222-4222-8222-222222222222',
          sectionId: '77777777-7777-4777-8777-777777777777',
          itemId: '88888888-8888-4888-8888-888888888888',
          severity: 'minor',
          title: 'Small paint mark',
          description: 'Cosmetic only.',
          createdByUserId: '33333333-3333-4333-8333-333333333333',
          createdAt: '2026-09-25T08:22:00.000Z',
        },
      ],
      evidence: [
        {
          evidence: {
            id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
            inspectionId: '22222222-2222-4222-8222-222222222222',
            sectionId: '77777777-7777-4777-8777-777777777777',
            itemId: '88888888-8888-4888-8888-888888888888',
            documentVersionId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
            kind: 'photo',
            caption: 'Wall near entrance',
            createdByUserId: '33333333-3333-4333-8333-333333333333',
            createdAt: '2026-09-25T08:23:00.000Z',
          },
          documentVersion: {
            fileName: 'entrance-wall.jpg',
          },
        },
      ],
      signatures: [
        {
          signature: {
            id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
            inspectionId: '22222222-2222-4222-8222-222222222222',
            signerRole: 'agent',
            signerPartyId: null,
            signerName: 'Dušan Miladinović',
            signatureDocumentVersionId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
            signedByUserId: '33333333-3333-4333-8333-333333333333',
            signedAt: '2026-09-25T08:45:00.000Z',
            invalidatedAt: null,
            invalidationReason: null,
          },
          documentVersion: {
            fileName: 'agent-signature.txt',
          },
        },
      ],
      unlockHistory: [],
    },
  } as unknown as InspectionFinalSnapshot;
}

describe('CanonicalInspectionPdfRenderer', () => {
  it('renders a business-facing final report instead of dumping canonical JSON', async () => {
    const snapshot = snapshotFixture();
    const rendered = await new CanonicalInspectionPdfRenderer()
      .renderInspectionFinalReport(snapshot);
    const source = new TextDecoder().decode(rendered.content);

    expect(rendered.fileName).toBe(
      'inspection-22222222-2222-4222-8222-222222222222-final.pdf',
    );
    expect(source.startsWith('%PDF-1.4\n')).toBe(true);
    expect(source.endsWith('%%EOF\n')).toBe(true);

    expect(source).toContain('INSPECTION REPORT');
    expect(source).toContain('Birmensdorferstrasse 123 - Demo Portfolio');
    expect(source).toContain('Birmensdorferstrasse 123, 8003 Zurich, CH');
    expect(source).toContain('Unit 3.01');
    expect(source).toContain('Periodic Unit Inspection');
    expect(source).toContain('Condition');
    expect(source).toContain('Good');
    expect(source).toContain('No material defects observed.');
    expect(source).toContain('MINOR - Small paint mark');
    expect(source).toContain('entrance-wall.jpg');
    expect(source).toContain('Dusan Miladinovic');
    expect(source).toContain('Immutable final snapshot');
    expect(source).toContain('Page 1 of');

    expect(source).not.toContain('Canonical final snapshot');
    expect(source).not.toContain('\\\\u0161');
    expect(source).not.toContain('"payload"');
  });

  it('keeps old snapshots renderable when presentation context is absent', async () => {
    const snapshot = snapshotFixture() as unknown as {
      payload: { reportContext?: unknown };
    } & InspectionFinalSnapshot;
    delete snapshot.payload.reportContext;

    const rendered = await new CanonicalInspectionPdfRenderer()
      .renderInspectionFinalReport(snapshot);
    const source = new TextDecoder().decode(rendered.content);

    expect(source).toContain('Property context unavailable');
    expect(source).toContain('Unit 55555555-5555-4555-8555-555555555555');
  });
});
