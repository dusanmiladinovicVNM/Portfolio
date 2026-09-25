import type { PdfPort, PdfRenderResult } from '@portfolio/application';
import { buildInspectionReportViewModel } from './inspection-report-view-model.js';

type InspectionFinalSnapshot = Parameters<
  PdfPort['renderInspectionFinalReport']
>[0];

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN = 42;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const FOOTER_Y = 34;

const TEXT = '0.12 0.14 0.12';
const MUTED = '0.38 0.40 0.37';
const DARK = '0.12 0.16 0.12';
const ACCENT = '0.88 0.91 0.86';
const PANEL = '0.97 0.97 0.95';
const BORDER = '0.82 0.82 0.78';
const WHITE = '1 1 1';

type FontName = 'F1' | 'F2';

interface PdfPage {
  readonly commands: string[];
}

function ascii(value: string): string {
  const replaced = value
    .replaceAll('Đ', 'D')
    .replaceAll('đ', 'd')
    .replaceAll('Ł', 'L')
    .replaceAll('ł', 'l')
    .replaceAll('–', '-')
    .replaceAll('—', '-')
    .replaceAll('−', '-')
    .replaceAll('→', '->')
    .replaceAll('←', '<-')
    .replaceAll('“', '"')
    .replaceAll('”', '"')
    .replaceAll('„', '"')
    .replaceAll('’', "'")
    .replaceAll('‘', "'")
    .replaceAll('•', '*')
    .replaceAll(' ', ' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '');

  let result = '';
  for (const char of replaced) {
    const code = char.charCodeAt(0);
    if (char === '\n' || (code >= 0x20 && code <= 0x7e)) {
      result += char;
    } else {
      result += '?';
    }
  }
  return result;
}

function formatSwissDate(value: string | null): string {
  if (!value) return '—';
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  if (!match) return value;
  return `${match[3]}.${match[2]}.${match[1]}`;
}

function formatSwissDateTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Zurich',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(parsed);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((entry) => entry.type === type)?.value ?? '';
  return `${part('day')}.${part('month')}.${part('year')} ${part('hour')}:${part('minute')}`;
}

function safeFileSegment(value: string): string {
  const normalized = ascii(value)
    .trim()
    .replace(/[^A-Za-z0-9._-]+/gu, '-')
    .replace(/^-+|-+$/gu, '');
  return normalized || 'final';
}

function pdfString(value: string): string {
  return ascii(value)
    .replaceAll('\\', '\\\\')
    .replaceAll('(', '\\(')
    .replaceAll(')', '\\)');
}

function textWidth(value: string, size: number, bold: boolean): number {
  let units = 0;
  for (const char of ascii(value)) {
    if (char === ' ') units += 0.28;
    else if ('ilI.,:;!|'.includes(char)) units += 0.28;
    else if ('MW@%'.includes(char)) units += 0.82;
    else if (/[A-Z0-9]/u.test(char)) units += 0.62;
    else units += bold ? 0.56 : 0.52;
  }
  return units * size;
}

function splitLongWord(
  word: string,
  maxWidth: number,
  size: number,
  bold: boolean,
): string[] {
  const parts: string[] = [];
  let current = '';
  for (const char of word) {
    const candidate = current + char;
    if (current && textWidth(candidate, size, bold) > maxWidth) {
      parts.push(current);
      current = char;
    } else {
      current = candidate;
    }
  }
  if (current) parts.push(current);
  return parts;
}

function wrapText(
  value: string,
  maxWidth: number,
  size: number,
  bold = false,
): string[] {
  const result: string[] = [];
  for (const paragraph of ascii(value).split(/\n/u)) {
    if (!paragraph.trim()) {
      result.push('');
      continue;
    }

    const words = paragraph.trim().split(/\s+/u);
    let current = '';
    for (const rawWord of words) {
      const pieces =
        textWidth(rawWord, size, bold) <= maxWidth
          ? [rawWord]
          : splitLongWord(rawWord, maxWidth, size, bold);
      for (const word of pieces) {
        const candidate = current ? `${current} ${word}` : word;
        if (current && textWidth(candidate, size, bold) > maxWidth) {
          result.push(current);
          current = word;
        } else {
          current = candidate;
        }
      }
    }
    if (current) result.push(current);
  }
  return result;
}

function drawText(
  page: PdfPage,
  value: string,
  x: number,
  y: number,
  size: number,
  font: FontName = 'F1',
  color = TEXT,
): void {
  page.commands.push(
    'BT',
    `${color} rg`,
    `/${font} ${size} Tf`,
    `${x} ${y} Td`,
    `(${pdfString(value)}) Tj`,
    'ET',
  );
}

function fillRect(
  page: PdfPage,
  x: number,
  y: number,
  width: number,
  height: number,
  color: string,
): void {
  page.commands.push(`${color} rg`, `${x} ${y} ${width} ${height} re f`);
}

function strokeRect(
  page: PdfPage,
  x: number,
  y: number,
  width: number,
  height: number,
  color = BORDER,
): void {
  page.commands.push(
    `${color} RG`,
    '0.6 w',
    `${x} ${y} ${width} ${height} re S`,
  );
}

function rule(
  page: PdfPage,
  x1: number,
  y: number,
  x2: number,
  color = BORDER,
): void {
  page.commands.push(`${color} RG`, '0.5 w', `${x1} ${y} m ${x2} ${y} l S`);
}

function verticalRule(
  page: PdfPage,
  x: number,
  y1: number,
  y2: number,
  color = BORDER,
): void {
  page.commands.push(`${color} RG`, '0.5 w', `${x} ${y1} m ${x} ${y2} l S`);
}

class ReportLayout {
  readonly pages: PdfPage[] = [];
  private page!: PdfPage;
  private y = 0;
  private readonly inspectionCode: string;

  constructor(inspectionCode: string) {
    this.inspectionCode = inspectionCode;
    this.newPage(false);
  }

  private newPage(continuation: boolean): void {
    this.page = { commands: [] };
    this.pages.push(this.page);
    if (continuation) {
      drawText(this.page, 'PORTFOLIO', MARGIN, 810, 8, 'F2', MUTED);
      drawText(this.page, 'INSPECTION REPORT', MARGIN + 66, 810, 8, 'F1', MUTED);
      rule(this.page, MARGIN, 799, PAGE_WIDTH - MARGIN);
      this.y = 780;
    } else {
      this.y = 800;
    }
  }

  ensure(height: number): void {
    if (this.y - height < 62) this.newPage(true);
  }

  gap(height: number): void {
    this.y -= height;
  }

  paragraph(
    value: string,
    options: {
      readonly size?: number;
      readonly bold?: boolean;
      readonly color?: string;
      readonly x?: number;
      readonly width?: number;
      readonly lineHeight?: number;
    } = {},
  ): void {
    const size = options.size ?? 9;
    const bold = options.bold ?? false;
    const color = options.color ?? TEXT;
    const x = options.x ?? MARGIN;
    const width = options.width ?? CONTENT_WIDTH;
    const lineHeight = options.lineHeight ?? size + 3;
    const lines = wrapText(value, width, size, bold);
    for (const line of lines) {
      this.ensure(lineHeight);
      drawText(this.page, line, x, this.y, size, bold ? 'F2' : 'F1', color);
      this.y -= lineHeight;
    }
  }

  private ensureLine(height: number): boolean {
    const before = this.pages.length;
    this.ensure(height);
    return this.pages.length !== before;
  }

  private continuedLabel(value: string): string {
    return `${value} (continued)`;
  }

  sectionTitle(title: string, subtitle: string | null = null): void {
    const titleLines = wrapText(title, CONTENT_WIDTH - 24, 12, true);
    const subtitleLines = subtitle
      ? wrapText(subtitle, CONTENT_WIDTH - 24, 8, false)
      : [];

    const drawTitleLine = (line: string, continued: boolean): void => {
      fillRect(this.page, MARGIN, this.y - 16, CONTENT_WIDTH, 24, ACCENT);
      drawText(
        this.page,
        continued ? this.continuedLabel(line) : line,
        MARGIN + 12,
        this.y - 8,
        12,
        'F2',
        DARK,
      );
      this.y -= 28;
    };

    if (titleLines.length === 0) titleLines.push(title);
    titleLines.forEach((line, index) => {
      const pageChanged = this.ensureLine(24);
      drawTitleLine(line, pageChanged && index > 0);
    });

    for (const line of subtitleLines) {
      const pageChanged = this.ensureLine(12);
      if (pageChanged) {
        this.ensure(24);
        drawTitleLine(title, true);
      }
      drawText(this.page, line, MARGIN + 12, this.y, 8, 'F1', MUTED);
      this.y -= 12;
    }
    this.y -= 4;
  }

  item(label: string, answer: string, comment: string | null): void {
    const labelLines = wrapText(label, CONTENT_WIDTH - 16, 8, true);
    const answerLines = wrapText(
      answer || 'Not recorded',
      CONTENT_WIDTH - 16,
      10,
      true,
    );
    const commentLines = comment
      ? wrapText(`Comment: ${comment}`, CONTENT_WIDTH - 16, 8, false)
      : [];

    const drawContinuation = (): void => {
      this.ensure(18);
      drawText(
        this.page,
        this.continuedLabel(label),
        MARGIN + 4,
        this.y,
        8,
        'F2',
        MUTED,
      );
      this.y -= 14;
    };

    for (const line of labelLines) {
      this.ensureLine(14);
      drawText(this.page, line, MARGIN + 4, this.y, 8, 'F2', MUTED);
      this.y -= 14;
    }

    for (const line of answerLines) {
      const pageChanged = this.ensureLine(13);
      if (pageChanged) drawContinuation();
      drawText(this.page, line, MARGIN + 4, this.y, 10, 'F2', TEXT);
      this.y -= 13;
    }

    for (const line of commentLines) {
      const pageChanged = this.ensureLine(10);
      if (pageChanged) drawContinuation();
      drawText(this.page, line, MARGIN + 4, this.y, 8, 'F1', MUTED);
      this.y -= 10;
    }

    this.ensureLine(12);
    this.y -= 4;
    rule(
      this.page,
      MARGIN + 4,
      this.y,
      PAGE_WIDTH - MARGIN - 4,
      '0.90 0.90 0.87',
    );
    this.y -= 8;
  }

  card(
    heading: string,
    bodyLines: readonly string[],
    accent: string | null = null,
  ): void {
    const headingLines = wrapText(heading, CONTENT_WIDTH - 28, 10, true);
    const wrapped = bodyLines.flatMap((line) =>
      wrapText(line, CONTENT_WIDTH - 28, 8.5),
    );

    const drawHeading = (continued: boolean): void => {
      const line = continued ? this.continuedLabel(heading) : heading;
      const lines = wrapText(line, CONTENT_WIDTH - 28, 10, true);
      for (const [index, headingLine] of lines.entries()) {
        this.ensureLine(22);
        fillRect(this.page, MARGIN, this.y - 14, CONTENT_WIDTH, 22, PANEL);
        strokeRect(this.page, MARGIN, this.y - 14, CONTENT_WIDTH, 22);
        if (accent) {
          fillRect(this.page, MARGIN, this.y - 14, 4, 22, accent);
        }
        drawText(
          this.page,
          headingLine,
          MARGIN + 14,
          this.y - 6,
          10,
          'F2',
          TEXT,
        );
        this.y -= index === lines.length - 1 ? 26 : 22;
      }
    };

    // Keep the first heading with at least one body line where possible.
    this.ensure(headingLines.length * 22 + (wrapped.length > 0 ? 13 : 0));
    drawHeading(false);

    for (const line of wrapped) {
      const pageChanged = this.ensureLine(13);
      if (pageChanged) drawHeading(true);
      fillRect(this.page, MARGIN, this.y - 9, CONTENT_WIDTH, 13, PANEL);
      if (accent) {
        fillRect(this.page, MARGIN, this.y - 9, 4, 13, accent);
      }
      drawText(this.page, line, MARGIN + 14, this.y, 8.5, 'F1', MUTED);
      this.y -= 13;
    }

    this.ensureLine(8);
    this.y -= 8;
  }

  renderCover(view: ReturnType<typeof buildInspectionReportViewModel>): void {
    fillRect(this.page, 0, 750, PAGE_WIDTH, 92, DARK);
    drawText(this.page, 'PORTFOLIO', MARGIN, 814, 9, 'F2', WHITE);
    drawText(this.page, view.title.toUpperCase(), MARGIN, 780, 23, 'F2', WHITE);
    fillRect(this.page, PAGE_WIDTH - MARGIN - 64, 776, 64, 24, '0.30 0.40 0.30');
    drawText(this.page, view.status, PAGE_WIDTH - MARGIN - 48, 784, 10, 'F2', WHITE);
    this.y = 726;

    const panelHeight = 92;
    fillRect(this.page, MARGIN, this.y - panelHeight, CONTENT_WIDTH, panelHeight, PANEL);
    strokeRect(this.page, MARGIN, this.y - panelHeight, CONTENT_WIDTH, panelHeight);
    const mid = MARGIN + CONTENT_WIDTH / 2;
    verticalRule(
      this.page,
      mid,
      this.y - panelHeight + 12,
      this.y - 12,
      BORDER,
    );

    const columnWidth = CONTENT_WIDTH / 2 - 30;

    drawText(this.page, 'PROPERTY', MARGIN + 14, this.y - 18, 7.5, 'F2', MUTED);
    const propertyNameLines = wrapText(view.propertyName, columnWidth, 11, true);
    let propertyY = this.y - 35;
    for (const line of propertyNameLines.slice(0, 2)) {
      drawText(this.page, line, MARGIN + 14, propertyY, 11, 'F2', TEXT);
      propertyY -= 12;
    }
    if (view.propertyCode) {
      drawText(this.page, view.propertyCode, MARGIN + 14, this.y - 61, 8, 'F1', MUTED);
    }
    if (view.propertyAddress) {
      const addressLines = wrapText(view.propertyAddress, columnWidth, 8);
      let addressY = this.y - 75;
      for (const line of addressLines.slice(0, 2)) {
        drawText(this.page, line, MARGIN + 14, addressY, 8, 'F1', MUTED);
        addressY -= 9;
      }
    }

    drawText(this.page, 'UNIT', mid + 14, this.y - 18, 7.5, 'F2', MUTED);
    const unitTitleLines = wrapText(view.unitTitle, columnWidth, 11, true);
    let unitTitleY = this.y - 35;
    for (const line of unitTitleLines.slice(0, 2)) {
      drawText(this.page, line, mid + 14, unitTitleY, 11, 'F2', TEXT);
      unitTitleY -= 12;
    }
    if (view.unitCode) {
      drawText(this.page, view.unitCode, mid + 14, this.y - 61, 8, 'F1', MUTED);
    }
    const unitLines = wrapText(view.unitDetails, columnWidth, 8);
    let unitY = this.y - 75;
    for (const line of unitLines.slice(0, 2)) {
      drawText(this.page, line, mid + 14, unitY, 8, 'F1', MUTED);
      unitY -= 9;
    }
    this.y -= panelHeight + 18;

    const gap = 8;
    const tileWidth = (CONTENT_WIDTH - gap * 3) / 4;
    const tiles = [
      ['TYPE', view.inspectionType],
      ['FINDINGS', String(view.findingsCount)],
      ['EVIDENCE', String(view.evidenceCount)],
      ['SIGNATURES', String(view.signaturesCount)],
    ] as const;
    for (let index = 0; index < tiles.length; index += 1) {
      const x = MARGIN + index * (tileWidth + gap);
      fillRect(this.page, x, this.y - 54, tileWidth, 54, '0.94 0.95 0.92');
      strokeRect(this.page, x, this.y - 54, tileWidth, 54);
      drawText(this.page, tiles[index]![0], x + 10, this.y - 16, 7, 'F2', MUTED);
      const value = wrapText(tiles[index]![1], tileWidth - 20, 11, true)[0] ?? '';
      drawText(this.page, value, x + 10, this.y - 37, 11, 'F2', TEXT);
    }
    this.y -= 72;

    this.paragraph(view.schemaTitle, {
      size: 13,
      bold: true,
      lineHeight: 16,
    });
    this.gap(2);
    this.paragraph(
      `${view.inspectionCode} - Finalized ${formatSwissDateTime(view.finalizedAt)}`,
      { size: 8.5, color: MUTED },
    );
    if (view.scheduledFor) {
      this.paragraph(`Scheduled for ${formatSwissDate(view.scheduledFor)}`, {
        size: 8,
        color: MUTED,
      });
    }
    this.gap(8);
  }

  addFooter(pageNumber: number, pageCount: number, view: ReturnType<typeof buildInspectionReportViewModel>): void {
    rule(this.pageFor(pageNumber - 1), MARGIN, FOOTER_Y + 18, PAGE_WIDTH - MARGIN);
    const page = this.pageFor(pageNumber - 1);
    drawText(page, view.inspectionCode, MARGIN, FOOTER_Y, 7, 'F1', MUTED);
    drawText(
      page,
      `Immutable final snapshot v${view.snapshotVersion} - content revision ${view.contentRevision}`,
      178,
      FOOTER_Y,
      7,
      'F1',
      MUTED,
    );
    drawText(
      page,
      `Page ${pageNumber} of ${pageCount}`,
      PAGE_WIDTH - MARGIN - 58,
      FOOTER_Y,
      7,
      'F1',
      MUTED,
    );
  }

  private pageFor(index: number): PdfPage {
    const page = this.pages[index];
    if (!page) throw new Error('PDF page index out of range.');
    return page;
  }

  finish(view: ReturnType<typeof buildInspectionReportViewModel>): readonly PdfPage[] {
    const total = this.pages.length;
    for (let index = 0; index < total; index += 1) {
      const current = this.page;
      this.page = this.pageFor(index);
      this.addFooter(index + 1, total, view);
      this.page = current;
    }
    return this.pages;
  }
}

function buildPdf(pages: readonly PdfPage[]): Uint8Array {
  const objects = new Map<number, string>();
  const pageObjectNumbers: number[] = [];

  objects.set(1, '<< /Type /Catalog /Pages 2 0 R >>');
  objects.set(
    3,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
  );
  objects.set(
    4,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
  );

  let nextObject = 5;
  for (const page of pages) {
    const pageObject = nextObject++;
    const contentObject = nextObject++;
    pageObjectNumbers.push(pageObject);
    const stream = page.commands.join('\n');
    const byteLength = new TextEncoder().encode(stream).byteLength;

    objects.set(
      contentObject,
      `<< /Length ${byteLength} >>\nstream\n${stream}\nendstream`,
    );
    objects.set(
      pageObject,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObject} 0 R >>`,
    );
  }

  objects.set(
    2,
    `<< /Type /Pages /Count ${pageObjectNumbers.length} /Kids [${pageObjectNumbers
      .map((number) => `${number} 0 R`)
      .join(' ')}] >>`,
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
    const view = buildInspectionReportViewModel(snapshot);
    const layout = new ReportLayout(view.inspectionCode);

    layout.renderCover(view);

    layout.sectionTitle(
      'Property & Unit identity',
      'Full frozen identity captured in the immutable final snapshot.',
    );
    layout.card('Property', [
      view.propertyName,
      ...(view.propertyCode ? [`Code: ${view.propertyCode}`] : []),
      ...(view.propertyAddress ? [`Address: ${view.propertyAddress}`] : []),
    ]);
    layout.card('Unit', [
      view.unitTitle,
      ...(view.unitCode ? [`Code: ${view.unitCode}`] : []),
      view.unitDetails,
    ]);

    layout.sectionTitle('Inspection responses');
    if (view.sections.length === 0) {
      layout.paragraph('No recorded inspection responses.', { color: MUTED });
      layout.gap(8);
    } else {
      for (const section of view.sections) {
        layout.sectionTitle(section.title, section.description);
        for (const item of section.items) {
          layout.item(item.label, item.answer, item.comment);
        }
      }
    }

    layout.sectionTitle('Findings');
    if (view.findings.length === 0) {
      layout.paragraph('No findings were recorded.', { color: MUTED });
      layout.gap(8);
    } else {
      for (const finding of view.findings) {
        const context = [finding.sectionTitle, finding.itemLabel]
          .filter((value): value is string => value !== null)
          .join(' - ');
        layout.card(
          `${finding.severity.toUpperCase()} - ${finding.title}`,
          [
            context,
            ...(finding.description ? [finding.description] : []),
          ],
          finding.severity === 'Critical' || finding.severity === 'Major'
            ? '0.65 0.24 0.20'
            : '0.55 0.55 0.48',
        );
      }
    }

    layout.sectionTitle('Evidence');
    if (view.evidence.length === 0) {
      layout.paragraph('No photo or attachment evidence was recorded.', { color: MUTED });
      layout.gap(8);
    } else {
      for (const evidence of view.evidence) {
        const context = [evidence.sectionTitle, evidence.itemLabel]
          .filter((value): value is string => value !== null)
          .join(' - ');
        layout.card(
          `${evidence.kind} - ${evidence.fileName}`,
          [
            ...(context ? [context] : []),
            ...(evidence.caption ? [evidence.caption] : []),
          ],
        );
      }
    }

    layout.sectionTitle('Signatures');
    if (view.signatures.length === 0) {
      layout.paragraph('No active signatures are present in the final snapshot.', {
        color: MUTED,
      });
    } else {
      for (const signature of view.signatures) {
        layout.card(signature.role, [
          signature.signerName,
          `Signed ${formatSwissDateTime(signature.signedAt)}`,
          `Evidence: ${signature.documentFileName}`,
        ]);
      }
    }
    if (view.invalidatedSignaturesCount > 0 || view.unlockCount > 0) {
      layout.paragraph(
        `Audit note: ${view.invalidatedSignaturesCount} invalidated signature(s), ${view.unlockCount} unlock event(s) retained in canonical history.`,
        { size: 8, color: MUTED },
      );
      layout.gap(8);
    }

    layout.sectionTitle('Final report integrity');
    layout.card('Immutable final snapshot', [
      `Report code: ${view.inspectionCode}`,
      `Snapshot version: ${view.snapshotVersion}`,
      `Lifecycle version: ${view.inspectionVersion}`,
      `Content revision: ${view.contentRevision}`,
      `Snapshot created: ${formatSwissDateTime(view.createdAt)}`,
    ]);

    const content = buildPdf(layout.finish(view));
    return {
      fileName: `inspection-${safeFileSegment(view.inspectionCode)}-final.pdf`,
      content,
    };
  }
}
