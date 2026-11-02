import { describe, expect, it } from 'vitest';
import { assertSupportedInspectionSignatureMimeType } from '../src/inspections/inspection-signature-format.js';

describe('Inspection final-PDF-compatible signature MIME policy', () => {
  it.each(['image/png', 'image/jpeg', ' IMAGE/PNG '])(
    'allows supported graphical signatures (%s)',
    (mimeType) => {
      expect(() => assertSupportedInspectionSignatureMimeType(mimeType))
        .not.toThrow();
    },
  );

  it.each(['image/webp', 'application/pdf', 'image/svg+xml', 'text/plain', ''])(
    'rejects unsupported signature media before attachment (%s)',
    (mimeType) => {
      expect(() => assertSupportedInspectionSignatureMimeType(mimeType))
        .toThrowError(
          expect.objectContaining({
            code: 'INSPECTION_SIGNATURE_FORMAT_UNSUPPORTED',
          }),
        );
    },
  );
});
