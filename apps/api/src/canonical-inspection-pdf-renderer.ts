import type { PdfPort, PdfRenderResult } from '@portfolio/application';

type InspectionFinalSnapshot = Parameters<
  PdfPort['renderInspectionFinalReport']
>[0];

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN_X = 36;
const START_Y = 806;
const FONT_SIZE = 8;
const LEADING = 10;
const MAX_COLUMNS = 88;
const MAX_LINES_PER_PAGE = 72;

function asciiPreserving(value: string): string {
  let result = '';
  for (const char of value) {
    const codePoint = char.codePointAt(0)!;
    if (codePoint >= 0x20 && codePoint <= 0x7e) {
      result += char;
    } else if (char === '\n' || char === '\r' || char === '\t') {
      result += char;
    } else if (codePoint <= 0xffff) {
      result += `\\u${codePoint.toString(16).padStart(4, '0')}`;
    } else {
      result += `\\u{${codePoint.toString(16)}}`;
    }
  }
  return result;
}

function pdfString(value: string): string {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll('(', '\\(')
    .replaceAll(')', '\\)');
}

function wrappedLines(value: string): string[] {
  const result: string[] = [];
  for (const rawLine of value.split(/\r?\n/u)) {
    if (rawLine.length === 0) {
      result.push('');
      continue;
    }
    for (let offset = 0; offset < rawLine.length; offset += MAX_COLUMNS) {
      result.push(rawLine.slice(offset, offset + MAX_COLUMNS));
    }
  }
  return result;
}

function canonicalReportLines(snapshot: InspectionFinalSnapshot): string[] {
  const payload = asciiPreserving(JSON.stringify(snapshot, null, 2));
  return [
    'PORTFOLIO INSPECTION FINAL REPORT',
    '',
    `Inspection ID: ${snapshot.inspectionId}`,
    `Snapshot ID: ${snapshot.id}`,
    `Snapshot version: ${snapshot.snapshotVersion}`,
    `Inspection version: ${snapshot.inspectionVersion}`,
    `Content revision: ${snapshot.contentRevision}`,
    `Created at: ${snapshot.createdAt}`,
    `Created by user: ${snapshot.createdByUserId}`,
    '',
    'Canonical final snapshot:',
    ...wrappedLines(payload),
  ];
}

function pageContent(lines: readonly string[]): string {
  return [
    'BT',
    `/F1 ${FONT_SIZE} Tf`,
    `${MARGIN_X} ${START_Y} Td`,
    `${LEADING} TL`,
    ...lines.flatMap((line, index) =>
      index === 0
        ? [`(${pdfString(line)}) Tj`]
        : ['T*', `(${pdfString(line)}) Tj`],
    ),
    'ET',
  ].join('\n');
}

function buildPdf(pages: readonly (readonly string[])[]): Uint8Array {
  const objects = new Map<number, string>();
  const pageObjectNumbers: number[] = [];

  objects.set(1, '<< /Type /Catalog /Pages 2 0 R >>');
  objects.set(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>');

  let nextObject = 4;
  for (const lines of pages) {
    const pageObject = nextObject++;
    const contentObject = nextObject++;
    pageObjectNumbers.push(pageObject);

    const stream = pageContent(lines);
    objects.set(
      contentObject,
      `<< /Length ${new TextEncoder().encode(stream).byteLength} >>\nstream\n${stream}\nendstream`,
    );
    objects.set(
      pageObject,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObject} 0 R >>`,
    );
  }

  objects.set(
    2,
    `<< /Type /Pages /Count ${pageObjectNumbers.length} /Kids [${pageObjectNumbers.map((n) => `${n} 0 R`).join(' ')}] >>`,
  );

  const maxObject = nextObject - 1;
  let pdf = '%PDF-1.4\n%Portfolio\n';
  const offsets = new Array<number>(maxObject + 1).fill(0);

  for (let objectNumber = 1; objectNumber <= maxObject; objectNumber += 1) {
    const body = objects.get(objectNumber);
    if (!body) throw new Error(`Missing PDF object ${objectNumber}.`);
    offsets[objectNumber] = new TextEncoder().encode(pdf).byteLength;
    pdf += `${objectNumber} 0 obj\n${body}\nendobj\n`;
  }

  const xrefOffset = new TextEncoder().encode(pdf).byteLength;
  pdf += `xref\n0 ${maxObject + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let objectNumber = 1; objectNumber <= maxObject; objectNumber += 1) {
    pdf += `${String(offsets[objectNumber]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${maxObject + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return new TextEncoder().encode(pdf);
}

export class CanonicalInspectionPdfRenderer implements PdfPort {
  async renderInspectionFinalReport(
    snapshot: InspectionFinalSnapshot,
  ): Promise<PdfRenderResult> {
    const lines = canonicalReportLines(snapshot);
    const pages: string[][] = [];
    for (let offset = 0; offset < lines.length; offset += MAX_LINES_PER_PAGE) {
      pages.push(lines.slice(offset, offset + MAX_LINES_PER_PAGE));
    }

    const content = buildPdf(pages.length > 0 ? pages : [['']]);
    return {
      fileName: `inspection-${snapshot.inspectionId}-final.pdf`,
      content,
    };
  }
}
