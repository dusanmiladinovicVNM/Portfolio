import { describe, expect, it } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { deflateSync } from 'node:zlib';
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
            scope: 'unit',
            spaceTypes: [],
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
      sectionInstances: [{
        id: '77777777-7777-4777-8777-777777777778',
        inspectionId: '22222222-2222-4222-8222-222222222222',
        sectionId: '77777777-7777-4777-8777-777777777777',
        scope: 'unit',
        spaceId: null,
        spaceCode: null,
        spaceName: null,
        spaceType: null,
        spaceSortOrder: null,
      }],
      responses: [
        {
          id: '99999999-9999-4999-8999-999999999999',
          inspectionId: '22222222-2222-4222-8222-222222222222',
          sectionInstanceId: '77777777-7777-4777-8777-777777777778',
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
          sectionInstanceId: '77777777-7777-4777-8777-777777777778',
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
            sectionInstanceId: '77777777-7777-4777-8777-777777777778',
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
            id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
            fileName: 'agent-signature.png',
            mimeType: 'image/png',
          },
        },
      ],
      unlockHistory: [],
    },
  } as unknown as InspectionFinalSnapshot;
}

const TINY_SIGNATURE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAGElEQVR4nAXBAQEAAAjDIG7/zhOGKleBB0bvBv1lsDJ5AAAAAElFTkSuQmCC',
  'base64',
);

function artworkFor(snapshot: InspectionFinalSnapshot) {
  return snapshot.payload.signatures
    .filter(({ signature }) => signature.invalidatedAt === null)
    .map(({ signature }) => ({
      documentVersionId: signature.signatureDocumentVersionId,
      mimeType: 'image/png',
      content: TINY_SIGNATURE_PNG,
    }));
}

function makePngChunk(kind: string, bytes: Uint8Array): Buffer {
  const tag = Buffer.from(kind, 'ascii');
  const payload = Buffer.concat([tag, Buffer.from(bytes)]);
  // Chunk bytes = length(4) + type/payload + CRC(4).
  const out = Buffer.alloc(payload.length + 8);
  out.writeUInt32BE(bytes.length, 0);
  payload.copy(out, 4);
  let crc = 0xffffffff;
  for (const byte of payload) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ ((crc & 1) !== 0 ? 0xedb88320 : 0);
    }
  }
  out.writeUInt32BE((crc ^ 0xffffffff) >>> 0, out.length - 4);
  return out;
}

/** A genuine 900x300 transparent RGBA PNG with clearly visible dark strokes. */
function visualSignatureFixture(): Uint8Array {
  const width = 900;
  const height = 300;
  const pixels = Buffer.alloc((width * 4 + 1) * height);
  const segments: [number, number, number, number][] = [
    [65, 210, 155, 82], [155, 82, 205, 211], [205, 211, 270, 111],
    [270, 111, 323, 211], [323, 211, 405, 83], [405, 83, 470, 211],
    [470, 211, 553, 99], [553, 99, 617, 204], [617, 204, 715, 85],
    [715, 85, 809, 200], [809, 200, 853, 135],
  ];
  for (const [x1, y1, x2, y2] of segments) {
    const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
    for (let step = 0; step <= steps; step += 1) {
      const t = step / steps;
      const cx = Math.round(x1 + (x2 - x1) * t);
      const cy = Math.round(y1 + (y2 - y1) * t);
      for (let dy = -4; dy <= 4; dy += 1) {
        for (let dx = -4; dx <= 4; dx += 1) {
          if (dx * dx + dy * dy > 16) continue;
          const x = cx + dx, y = cy + dy;
          if (x < 0 || x >= width || y < 0 || y >= height) continue;
          pixels[y * (width * 4 + 1) + 1 + x * 4 + 3] = 255;
        }
      }
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // eight-bit samples
  header[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    makePngChunk('IHDR', header),
    makePngChunk('IDAT', deflateSync(pixels)),
    makePngChunk('IEND', new Uint8Array()),
  ]);
}

describe('CanonicalInspectionPdfRenderer', () => {
  it('renders a business-facing final report instead of dumping canonical JSON', async () => {
    const snapshot = snapshotFixture();
    const rendered = await new CanonicalInspectionPdfRenderer()
      .renderInspectionFinalReport(snapshot, artworkFor(snapshot));
    const source = new TextDecoder().decode(rendered.content);

    expect(rendered.fileName).toBe(
      'inspection-INSP-ZH-301-001-final.pdf',
    );
    expect(source.startsWith('%PDF-1.4\n')).toBe(true);
    expect(source.endsWith('%%EOF\n')).toBe(true);

    expect(source).toContain('INSPECTION REPORT');
    expect(source).toContain('Birmensdorferstrasse 123 \\227 Demo');
    expect(source).toContain('(Portfolio) Tj');
    expect(source).toContain('Property & Unit identity');
    expect(source).toContain('Birmensdorferstrasse 123, 8003 Z\\374rich, CH');
    expect(source).toContain('Code: ZH-BIR-123');
    expect(source).toContain('Unit 3.01');
    expect(source).toContain('Code: ZH-BIR123-301');
    expect(source).toContain('Periodic Unit Inspection');
    expect(source).toContain('Condition');
    expect(source).toContain('Good');
    expect(source).toContain('No material defects observed.');
    expect(source).toContain('MINOR - Small paint mark');
    expect(source).toContain('entrance-wall.jpg');
    expect(source).toContain('Du\\232an Miladinovic');
    // The artwork must be a real image XObject, not a filename-only legend.
    expect(source).toContain('/Subtype /Image');
    expect(source).toContain('/Filter [/ASCIIHexDecode /FlateDecode]');
    expect(source).toContain('/Sig1 Do');
    expect(source).toContain('/XObject << /Sig1 ');
    expect(source).toContain('Immutable final snapshot');
    expect(source).toContain('Finalized 25.09.2026 11:00');
    expect(source).toContain('Scheduled for 25.09.2026');
    expect(source).toContain('Signed 25.09.2026 10:45');
    expect(source).toContain('Snapshot created: 25.09.2026 11:00');
    expect(source).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/iu,
    );
    expect(source).toContain('Page 1 of');

    expect(source).not.toContain('Canonical final snapshot');
    expect(source).not.toContain('\\\\u0161');
    expect(source).not.toContain('"payload"');
  });

  it('uses frozen schema option labels for select and multiselect without changing stored answers', async () => {
    const snapshot = snapshotFixture();
    const payload = snapshot.payload as unknown as {
      schema: {
        sections: Array<{
          items: Array<{
            id: string;
            key: string;
            label: string;
            type: string;
            sortOrder: number;
            options: Array<{ value: string; label: string }>;
            visibleWhen: unknown;
            requiredWhen: unknown;
          }>;
        }>;
      };
      responses: Array<{ id: string; itemId: string; value: string | string[] }>;
    };
    const condition = payload.schema.sections[0]!.items[0]!;
    condition.type = 'select';
    condition.options = [
      { value: 'good', label: 'Good condition' },
      { value: 'minor_defect', label: 'Minor defects' },
    ];
    const original = payload.responses[0]!;
    original.value = 'minor_defect';

    const multi = {
      ...condition,
      id: '88888888-8888-4888-8888-888888888889',
      key: 'affected_areas',
      type: 'multi_select',
      label: 'Affected areas',
      sortOrder: 1,
      options: [
        { value: 'ceiling', label: 'Ceiling' },
        { value: 'wall', label: 'Walls' },
      ],
    };
    const conditional = {
      ...condition,
      id: '88888888-8888-4888-8888-888888888890',
      key: 'description',
      type: 'textarea',
      label: 'Description of defects',
      sortOrder: 2,
      options: [],
      visibleWhen: {
        fieldKey: 'condition', operator: 'in', value: ['minor_defect'],
      },
      requiredWhen: {
        fieldKey: 'condition', operator: 'in', value: ['minor_defect'],
      },
    };
    const legacy = {
      ...condition,
      id: '88888888-8888-4888-8888-888888888891',
      key: 'legacy_condition',
      type: 'select',
      label: 'Archived rating',
      sortOrder: 3,
      options: [],
    };
    payload.schema.sections[0]!.items.push(multi, conditional, legacy);
    payload.responses.push(
      { ...original, id: '99999999-9999-4999-8999-999999999990',
        itemId: multi.id, value: ['ceiling', 'wall', 'legacy_extra'] },
      { ...original, id: '99999999-9999-4999-8999-999999999991',
        itemId: conditional.id, value: 'Damage near window' },
      { ...original, id: '99999999-9999-4999-8999-999999999992',
        itemId: legacy.id, value: 'unknown_historical_code' },
    );

    const source = new TextDecoder().decode(
      (await new CanonicalInspectionPdfRenderer()
        .renderInspectionFinalReport(snapshot, artworkFor(snapshot))).content,
    );
    expect(source).toContain('(Minor defects) Tj');
    expect(source).toContain('(Ceiling, Walls, legacy_extra) Tj');
    expect(source).toContain('(Damage near window) Tj');
    expect(source).toContain('(unknown_historical_code) Tj');
    expect(source).not.toContain('(minor_defect) Tj');
    // The canonical frozen answer values remain unchanged in memory/storage.
    expect(original.value).toBe('minor_defect');
  });

  it('encodes Swiss diacritics and Unicode separators as WinAnsi instead of question marks', async () => {
    const snapshot = snapshotFixture();
    const payload = snapshot.payload as unknown as {
      reportContext: { property: { name: string; city: string } };
      responses: Array<{ value: string; comment: string | null }>;
    };
    payload.reportContext.property.name = 'Über Zürich · Straße — Büro';
    payload.reportContext.property.city = 'Zürich';
    payload.responses[0]!.value = 'Größe: 25 m² · Prüfung';
    payload.responses[0]!.comment = 'Türöffnung – Zürich';
    const source = new TextDecoder().decode(
      (await new CanonicalInspectionPdfRenderer()
        .renderInspectionFinalReport(snapshot, artworkFor(snapshot))).content,
    );
    // PDF font declares WinAnsi; all non-ASCII bytes use octal literal escapes.
    expect(source).toContain('/Encoding /WinAnsiEncoding');
    expect(source).toContain('(\334ber Z\374rich \267 Stra\337e \227 B\374ro) Tj');
    expect(source).toContain('(Gr\366\337e: 25 m\262 \267 Pr\374fung) Tj');
    expect(source).toContain('(Comment: T\374r\366ffnung \226 Z\374rich) Tj');
    expect(source).not.toContain('Z?rich');
    expect(source).not.toContain('Room condition ?');
  });

  it('renders repeated schema sections by frozen Space instance without merging their answers', async () => {
    const snapshot = snapshotFixture();
    const mutablePayload = snapshot.payload as unknown as {
      schema: {
        sections: Array<{
          id: string;
          scope: 'unit' | 'space';
          spaceTypes: string[];
        }>;
      };
      sectionInstances: Array<{
        id: string;
        inspectionId: string;
        sectionId: string;
        scope: 'space';
        spaceId: string;
        spaceCode: string;
        spaceName: string;
        spaceType: 'bedroom';
        spaceSortOrder: number;
      }>;
      responses: Array<Record<string, unknown>>;
      findings: unknown[];
      evidence: unknown[];
    };

    const section = mutablePayload.schema.sections[0]!;
    section.scope = 'space';
    section.spaceTypes = ['bedroom'];
    const first = {
      id: '12111111-1111-4111-8111-111111111111',
      inspectionId: snapshot.inspectionId,
      sectionId: section.id,
      scope: 'space' as const,
      spaceId: '13111111-1111-4111-8111-111111111111',
      spaceCode: 'BED-1',
      spaceName: 'Bedroom 1',
      spaceType: 'bedroom' as const,
      spaceSortOrder: 1,
    };
    const second = {
      ...first,
      id: '12111111-1111-4111-8111-111111111112',
      spaceId: '13111111-1111-4111-8111-111111111112',
      spaceCode: 'BED-2',
      spaceName: 'Bedroom 2',
      spaceSortOrder: 2,
    };
    mutablePayload.sectionInstances = [first, second];
    const base = mutablePayload.responses[0]!;
    mutablePayload.responses = [
      { ...base, sectionInstanceId: first.id, value: 'Good' },
      {
        ...base,
        id: '99999999-9999-4999-8999-999999999998',
        sectionInstanceId: second.id,
        value: 'Damaged',
      },
    ];
    mutablePayload.findings = [];
    mutablePayload.evidence = [];

    const rendered = await new CanonicalInspectionPdfRenderer()
      .renderInspectionFinalReport(snapshot, artworkFor(snapshot));
    const source = new TextDecoder().decode(rendered.content);

    expect(source).toContain('Bedroom 1');
    expect(source).toContain('Bedroom 2');
    expect(source).toContain('Good');
    expect(source).toContain('Damaged');
    expect(source).toContain('BED-1');
    expect(source).toContain('BED-2');
  });

  it('keeps repeated room heading and first response together across PDF pages', async () => {
    const snapshot = snapshotFixture();
    const payload = snapshot.payload as unknown as {
      schema: { sections: Array<{ scope: string; spaceTypes: string[] }> };
      sectionInstances: Array<Record<string, unknown>>;
      responses: Array<Record<string, unknown>>;
      findings: unknown[];
      evidence: unknown[];
    };
    payload.schema.sections[0]!.scope = 'space';
    payload.schema.sections[0]!.spaceTypes = ['bedroom'];
    const template = payload.sectionInstances[0]!;
    const original = payload.responses[0]!;
    payload.sectionInstances = Array.from({ length: 20 }, (_, index) => ({
      ...template,
      id: 'instance-' + index,
      scope: 'space',
      spaceId: 'space-' + index,
      spaceCode: 'ROOM-' + index,
      spaceName: 'ROOM_' + index + '_TITLE',
      spaceType: 'bedroom',
      spaceSortOrder: index,
    }));
    payload.responses = payload.sectionInstances.map((instance, index) => ({
      ...original,
      id: 'answer-' + index,
      sectionInstanceId: instance.id,
      value: 'ANSWER_ROOM_' + index,
    }));
    payload.findings = [];
    payload.evidence = [];

    const source = new TextDecoder().decode(
      (await new CanonicalInspectionPdfRenderer()
        .renderInspectionFinalReport(snapshot, artworkFor(snapshot))).content,
    );
    const streams = [...source.matchAll(
      /<< \/Length \d+ >>\nstream\n([\s\S]*?)\nendstream/gu,
    )].map((match) => match[1]!);
    expect(streams.length).toBeGreaterThan(2);
    for (let index = 0; index < 20; index += 1) {
      const title = '(ROOM_' + index + '_TITLE) Tj';
      const answer = '(ANSWER_ROOM_' + index + ') Tj';
      expect(streams.some((stream) =>
        stream.includes(title) && stream.includes(answer),
      )).toBe(true);
    }
  });

  it('renders room-owned Kitchen Findings and Bathroom Evidence into the final PDF artifact', async () => {
    const snapshot = snapshotFixture();
    const mutablePayload = snapshot.payload as unknown as {
      schema: {
        sections: Array<{
          id: string;
          key: string;
          title: string;
          description: string | null;
          sortOrder: number;
          scope: 'unit' | 'space';
          spaceTypes: string[];
          items: Array<{
            id: string;
            sectionId: string;
            key: string;
            type: string;
            label: string;
            required: boolean;
            sortOrder: number;
            options: unknown[];
            visibleWhen: unknown;
            requiredWhen: unknown;
          }>;
        }>;
      };
      sectionInstances: Array<{
        id: string;
        inspectionId: string;
        sectionId: string;
        scope: 'unit' | 'space';
        spaceId: string | null;
        spaceCode: string | null;
        spaceName: string | null;
        spaceType: string | null;
        spaceSortOrder: number | null;
      }>;
      findings: Array<{
        id: string;
        inspectionId: string;
        sectionInstanceId: string;
        sectionId: string;
        itemId: string | null;
        severity: string;
        title: string;
        description: string | null;
        createdByUserId: string;
        createdAt: string;
      }>;
      evidence: Array<{
        evidence: {
          id: string;
          inspectionId: string;
          sectionInstanceId: string | null;
          sectionId: string | null;
          itemId: string | null;
          documentVersionId: string;
          kind: string;
          caption: string | null;
          createdByUserId: string;
          createdAt: string;
        };
        documentVersion: { fileName: string };
      }>;
    };

    const templateSection = mutablePayload.schema.sections[0]!;
    const templateItem = templateSection.items[0]!;
    const roomSectionId = '14111111-1111-4111-8111-111111111111';
    const roomItemId = '15111111-1111-4111-8111-111111111111';
    const kitchenInstanceId = '16111111-1111-4111-8111-111111111111';
    const bathroomInstanceId = '16111111-1111-4111-8111-111111111112';

    mutablePayload.schema.sections.push({
      ...templateSection,
      id: roomSectionId,
      key: 'room',
      title: 'Room condition',
      description: 'Room-scoped inspection content.',
      sortOrder: 1,
      scope: 'space',
      spaceTypes: ['kitchen', 'bathroom'],
      items: [{
        ...templateItem,
        id: roomItemId,
        sectionId: roomSectionId,
        key: 'room_note',
        label: 'Room note',
        required: false,
      }],
    });

    mutablePayload.sectionInstances.push(
      {
        id: kitchenInstanceId,
        inspectionId: snapshot.inspectionId,
        sectionId: roomSectionId,
        scope: 'space',
        spaceId: '17111111-1111-4111-8111-111111111111',
        spaceCode: 'KIT-01',
        spaceName: 'Kitchen',
        spaceType: 'kitchen',
        spaceSortOrder: 4,
      },
      {
        id: bathroomInstanceId,
        inspectionId: snapshot.inspectionId,
        sectionId: roomSectionId,
        scope: 'space',
        spaceId: '17111111-1111-4111-8111-111111111112',
        spaceCode: 'BATH-01',
        spaceName: 'Bathroom',
        spaceType: 'bathroom',
        spaceSortOrder: 5,
      },
    );

    const templateFinding = mutablePayload.findings[0]!;
    mutablePayload.findings.push({
      ...templateFinding,
      id: '18111111-1111-4111-8111-111111111111',
      sectionInstanceId: kitchenInstanceId,
      sectionId: roomSectionId,
      itemId: roomItemId,
      severity: 'major',
      title: 'Kitchen ventilation staining',
      description: 'Visible staining above the cooking area.',
    });

    const templateEvidence = mutablePayload.evidence[0]!;
    mutablePayload.evidence.push({
      evidence: {
        ...templateEvidence.evidence,
        id: '19111111-1111-4111-8111-111111111111',
        sectionInstanceId: bathroomInstanceId,
        sectionId: roomSectionId,
        itemId: null,
        documentVersionId: '20111111-1111-4111-8111-111111111111',
        kind: 'photo',
        caption: 'Bathroom moisture evidence',
      },
      documentVersion: {
        fileName: 'bathroom-moisture.jpg',
      },
    });

    const rendered = await new CanonicalInspectionPdfRenderer()
      .renderInspectionFinalReport(snapshot, artworkFor(snapshot));
    const source = new TextDecoder().decode(rendered.content);

    expect(source).toContain('MAJOR - Kitchen ventilation staining');
    expect(source).toContain('Kitchen - Room note');
    expect(source).toContain('Visible staining above the cooking area.');

    expect(source).toContain('Photo - bathroom-moisture.jpg');
    expect(source).toContain('(Bathroom) Tj');
    expect(source).toContain('Bathroom moisture evidence');

    expect(source).toContain('Immutable final snapshot');
    expect(source).toContain('%%EOF');
  });

  it('keeps old snapshots renderable when presentation context is absent', async () => {
    const snapshot = snapshotFixture() as unknown as {
      payload: { reportContext?: unknown };
    } & InspectionFinalSnapshot;
    delete snapshot.payload.reportContext;
    delete (snapshot.payload as { sectionInstances?: unknown }).sectionInstances;

    const rendered = await new CanonicalInspectionPdfRenderer()
      .renderInspectionFinalReport(snapshot, artworkFor(snapshot));
    const source = new TextDecoder().decode(rendered.content);

    expect(source).toContain('Property context unavailable');
    expect(source).toContain('(Unit) Tj');
    expect(source).toContain('Unit context unavailable');
    expect(source).not.toContain('55555555-5555-4555-8555-555555555555');
    expect(source).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/iu,
    );
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
          title: string;
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

    snapshot.payload.schema.title =
      `SCHEMA_TITLE_START ${'schema title detail '.repeat(120)} SCHEMA_TITLE_MIDDLE ${'schema title continuation '.repeat(120)} SCHEMA_TITLE_END`;

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
      .renderInspectionFinalReport(snapshot, artworkFor(snapshot));
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
      'SCHEMA_TITLE_START',
      'SCHEMA_TITLE_MIDDLE',
      'SCHEMA_TITLE_END',
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
  it('fails closed if frozen signature artwork is missing', async () => {
    const snapshot = snapshotFixture();
    await expect(
      new CanonicalInspectionPdfRenderer().renderInspectionFinalReport(snapshot, []),
    ).rejects.toThrow(/artwork identities are incomplete/);
  });

  it.each(['image/webp', 'application/pdf'])(
    'rejects unsupported %s artwork rather than silently omitting it',
    async (mimeType) => {
      const snapshot = snapshotFixture();
      (snapshot.payload.signatures[0]!.documentVersion as { mimeType: string }).mimeType = mimeType;
      await expect(
        new CanonicalInspectionPdfRenderer().renderInspectionFinalReport(
          snapshot,
          artworkFor(snapshot).map((a) => ({ ...a, mimeType })),
        ),
      ).rejects.toThrow();
    },
  );

  it('ignores invalidated signatures without requiring their artwork', async () => {
    const snapshot = snapshotFixture();
    (snapshot.payload.signatures[0]!.signature as { invalidatedAt: string | null })
      .invalidatedAt = '2026-09-25T09:01:00.000Z';
    const pdf = new TextDecoder().decode(
      (await new CanonicalInspectionPdfRenderer()
        .renderInspectionFinalReport(snapshot, [])).content,
    );
    expect(pdf).toContain('No active signatures are present');
    expect(pdf).not.toContain('/Subtype /Image');
    expect(pdf).toContain('1 invalidated signature');
  });

  it('renders two signer relations that reuse one immutable DocumentVersion', async () => {
    const snapshot = snapshotFixture();
    const original = snapshot.payload.signatures[0]!;
    const second = {
      ...original,
      signature: {
        ...original.signature,
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        signerRole: 'witness' as const,
        signerName: 'Second Witness',
      },
    };
    (snapshot.payload.signatures as unknown as typeof second[]).push(second);
    const source = new TextDecoder().decode(
      (await new CanonicalInspectionPdfRenderer().renderInspectionFinalReport(
        snapshot,
        [artworkFor(snapshot)[0]!],
      )).content,
    );
    expect(source.split('/Subtype /Image')).toHaveLength(3);
    expect(source).toContain('Second Witness');
    expect(source).toContain('/Sig1 Do');
    expect(source).toContain('/Sig2 Do');
  });

  it('renders two distinct active signature images without sharing image identity', async () => {
    const snapshot = snapshotFixture();
    const original = snapshot.payload.signatures[0]!;
    const duplicate = {
      ...original,
      signature: {
        ...original.signature,
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        signatureDocumentVersionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        signerName: 'Second Test Agent',
      },
      documentVersion: {
        ...original.documentVersion,
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      },
    };
    (snapshot.payload.signatures as unknown as typeof duplicate[]).push(duplicate);
    const content = (await new CanonicalInspectionPdfRenderer().renderInspectionFinalReport(
      snapshot,
      artworkFor(snapshot),
    )).content;
    const pdf = new TextDecoder().decode(content);
    expect(pdf.match(/\/Subtype \/Image/gu)).toHaveLength(2);
    expect(pdf).toContain('/Sig1 Do');
    expect(pdf).toContain('/Sig2 Do');
  });

  it('creates an inspectable final PDF with real 900x300 drawn signature artwork', async () => {
    const snapshot = snapshotFixture();
    const pdf = (await new CanonicalInspectionPdfRenderer().renderInspectionFinalReport(
      snapshot,
      [{
        documentVersionId: snapshot.payload.signatures[0]!.signature.signatureDocumentVersionId,
        mimeType: 'image/png',
        content: visualSignatureFixture(),
      }],
    )).content;
    const source = new TextDecoder().decode(pdf);
    expect(source).toContain('/Subtype /Image /Width 900 /Height 300');
    expect(source).toContain('/Sig1 Do');
    expect(source).toContain('Du\\232an Miladinovic');
    const proofPath = process.env.INSPECTION_SIGNATURE_VISUAL_PROOF_PATH;
    if (proofPath) {
      await mkdir(dirname(proofPath), { recursive: true });
      await writeFile(proofPath, pdf);
    }
  });


});
