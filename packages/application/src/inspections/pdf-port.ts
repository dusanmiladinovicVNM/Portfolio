import type { InspectionFinalSnapshot } from '@portfolio/domain';

export interface PdfPort {
  renderInspectionReport(snapshot: InspectionFinalSnapshot): Promise<Uint8Array>;
}
