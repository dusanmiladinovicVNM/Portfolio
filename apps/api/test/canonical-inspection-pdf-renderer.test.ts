import { describe, expect, it } from 'vitest';
import type { PdfPort } from '@portfolio/application';
import { CanonicalInspectionPdfRenderer } from '../src/index.js';

type InspectionFinalSnapshot = Parameters<
  PdfPort['renderInspectionFinalReport']
>[0];

describe('CanonicalInspectionPdfRenderer', () => {
  it('emits a valid PDF envelope and preserves non-ASCII snapshot data as visible escapes', async () => {
    const snapshot = {
      id: '11111111-1111-4111-8111-111111111111',
      inspectionId: '22222222-2222-4222-8222-222222222222',
      snapshotVersion: 1,
      inspectionVersion: 7,
      contentRevision: 9,
      createdByUserId: '33333333-3333-4333-8333-333333333333',
      createdAt: '2026-09-23T12:00:00.000Z',
      payload: {
        note: 'Dušan čuva ključ',
      },
    } as unknown as InspectionFinalSnapshot;

    const rendered = await new CanonicalInspectionPdfRenderer()
      .renderInspectionFinalReport(snapshot);
    const source = new TextDecoder().decode(rendered.content);

    expect(rendered.fileName).toBe(
      'inspection-22222222-2222-4222-8222-222222222222-final.pdf',
    );
    expect(source.startsWith('%PDF-1.4\n')).toBe(true);
    expect(source.endsWith('%%EOF\n')).toBe(true);
    expect(source).toContain('PORTFOLIO INSPECTION FINAL REPORT');
    expect(source).toContain('Du\\\\u0161an');
    expect(source).toContain('\\\\u010duva klju\\\\u010d');
  });
});
