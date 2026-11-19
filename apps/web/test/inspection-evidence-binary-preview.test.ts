import { describe, expect, it } from 'vitest';
import {
  canPreviewInspectionEvidenceMime,
  inspectionEvidenceDownloadFileName,
} from '../src/dossier/InspectionEvidenceBinaryPreview.js';

describe('on-demand Inspection Evidence binary presentation policy', () => {
  it('previews only known-safe raster image types, never SVG or executable HTML', () => {
    for (const type of ['image/jpeg', 'image/png', 'image/webp', 'image/gif']) {
      expect(canPreviewInspectionEvidenceMime(type)).toBe(true);
    }
    for (const type of [
      'image/svg+xml', 'text/html', 'text/xml', 'application/javascript',
      'application/pdf', 'application/octet-stream', '',
    ]) {
      expect(canPreviewInspectionEvidenceMime(type)).toBe(false);
    }
    expect(canPreviewInspectionEvidenceMime(' IMAGE/JPEG ')).toBe(true);
  });

  it('never uses slashes or control characters from the caption as a download path', () => {
    expect(
      inspectionEvidenceDownloadFileName('../unsafe\\path\nA', 'image/png'),
    ).toBe('unsafe-path-A.png');
    expect(inspectionEvidenceDownloadFileName(null, 'application/pdf'))
      .toBe('Inspektionsnachweis.pdf');
    expect(inspectionEvidenceDownloadFileName('Fotobeleg.jpg', 'image/jpeg'))
      .toBe('Fotobeleg.jpg');
    expect(inspectionEvidenceDownloadFileName('<script>', 'text/html'))
      .toBe('script.bin');
  });
});
