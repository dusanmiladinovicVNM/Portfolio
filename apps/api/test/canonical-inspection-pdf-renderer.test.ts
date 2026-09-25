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
    expect(source).toContain('Birmensdorferstrasse 123 - Demo');
    expect(source).toContain('(Portfolio) Tj');
    expect(source).toContain('Property & Unit identity');
    expect(source).toContain('Birmensdorferstrasse 123, 8003 Zurich, CH');
    expect(source).toContain('Code: ZH-BIR-123');
    expect(source).toContain('Unit 3.01');
    expect(source).toContain('Code: ZH-BIR123-301');
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
    expect(source).toContain('(Unit) Tj');
    expect(source).toContain('Unit ID 55555555-5555-4555-8555-555555555555');
  });

  it('paginates arbitrarily long canonical content without clipping it below the content floor', async () => {
    const snapshot = snapshotFixture() as unknown as {
      payload: {
        reportContext: {
          property: {
            name: string;
            street: string;
            houseNumber: string;
            postalCode: string;
            city: string;
            countryCode: string;
          };
          unit: { unitNumber: string };
        };
        schema: {
          sections: Array<{
            description: string | null;
          }>;
        };
        responses: Array<{
          value: string;
          comment: string | null;
        }>;
        findings: Array<{
          description: string | null;
        }>;
        evidence: Array<{
          evidence: { caption: string | null };
        }>;
      };
    } & InspectionFinalSnapshot;

    snapshot.payload.reportContext.property.name =
      `PROPERTY_START ${'property identity '.repeat(60)} PROPERTY_MIDDLE ${'property continuation '.repeat(60)} PROPERTY_END`;
    snapshot.payload.reportContext.property.street =
      `ADDRESS_START ${'very long street identity '.repeat(45)} ADDRESS_MIDDLE`;
    snapshot.payload.reportContext.property.houseNumber =
      '123-ADDRESS-HOUSE';
    snapshot.payload.reportContext.property.postalCode =
      '8003-ADDRESS-POSTAL';
    snapshot.payload.reportContext.property.city =
      `${'address city continuation '.repeat(45)} ADDRESS_END`;
    snapshot.payload.reportContext.property.countryCode = 'CH';
    snapshot.payload.reportContext.unit.unitNumber =
      `UNIT_START ${'unit identity '.repeat(70)} UNIT_MIDDLE ${'unit continuation '.repeat(70)} UNIT_END`;

    snapshot.payload.schema.sections[0]!.description =
      `SCHEMA_START ${'schema detail '.repeat(700)} SCHEMA_MIDDLE ${'schema continuation '.repeat(700)} SCHEMA_END`;

    snapshot.payload.responses[0]!.value =
      `ANSWER_START ${'answer detail '.repeat(900)} ANSWER_MIDDLE ${'answer continuation '.repeat(900)} ANSWER_END`;
    snapshot.payload.responses[0]!.comment =
      `COMMENT_START ${'comment detail '.repeat(900)} COMMENT_MIDDLE ${'comment continuation '.repeat(900)} COMMENT_END`;

    snapshot.payload.findings[0]!.description =
      `FINDING_START ${'finding detail '.repeat(900)} FINDING_MIDDLE ${'finding continuation '.repeat(900)} FINDING_END`;

    snapshot.payload.evidence[0]!.evidence.caption =
      `EVIDENCE_START ${'evidence detail '.repeat(900)} EVIDENCE_MIDDLE ${'evidence continuation '.repeat(900)} EVIDENCE_END`;

    const rendered = await new CanonicalInspectionPdfRenderer()
      .renderInspectionFinalReport(snapshot);
    const source = new TextDecoder().decode(rendered.content);

    for (const sentinel of [
      'PROPERTY_START',
      'PROPERTY_MIDDLE',
      'PROPERTY_END',
      'ADDRESS_START',
      'ADDRESS_MIDDLE',
      'ADDRESS_END',
      'UNIT_START',
      'UNIT_MIDDLE',
      'UNIT_END',
      'SCHEMA_START',
      'SCHEMA_MIDDLE',
      'SCHEMA_END',
      'ANSWER_START',
      'ANSWER_MIDDLE',
      'ANSWER_END',
      'COMMENT_START',
      'COMMENT_MIDDLE',
      'COMMENT_END',
      'FINDING_START',
      'FINDING_MIDDLE',
      'FINDING_END',
      'EVIDENCE_START',
      'EVIDENCE_MIDDLE',
      'EVIDENCE_END',
      'Immutable final snapshot',
    ]) {
      expect(source).toContain(sentinel);
    }

    const pageCountMatch = /\/Count (\d+)/u.exec(source);
    expect(pageCountMatch).not.toBeNull();
    const pageCount = Number(pageCountMatch![1]);
    expect(pageCount).toBeGreaterThan(4);

    const footerMatches = source.match(/\(Page \d+ of \d+\) Tj/gu) ?? [];
    expect(footerMatches).toHaveLength(pageCount);
    expect(source).toContain(`Page 1 of ${pageCount}`);
    expect(source).toContain(`Page ${pageCount} of ${pageCount}`);

    const textYCoordinates = [...source.matchAll(
      /(?:^|\n)-?\d+(?:\.\d+)? (-?\d+(?:\.\d+)?) Td(?:\n|$)/gu,
    )].map((match) => Number(match[1]));

    expect(textYCoordinates.length).toBeGreaterThan(0);
    for (const y of textYCoordinates) {
      expect(y === 34 || y >= 62).toBe(true);
    }

    expect(source).not.toContain('(Property & Unit identity (continued)) Tj');
  });
});
