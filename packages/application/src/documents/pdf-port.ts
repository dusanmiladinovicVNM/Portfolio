import type { InspectionFinalSnapshot } from '@portfolio/domain';

export interface PdfRenderResult {
  readonly fileName: string;
  readonly content: Uint8Array;
}

export interface PdfPort {
  renderInspectionFinalReport(
    snapshot: InspectionFinalSnapshot,
  ): Promise<PdfRenderResult>;
}
