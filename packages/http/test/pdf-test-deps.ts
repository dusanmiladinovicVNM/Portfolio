import type { PdfPort } from '@portfolio/application';

export const unusedPdfPort: PdfPort = {
  async renderInspectionFinalReport() {
    throw new Error('PDF rendering is not expected in this HTTP test.');
  },
};
