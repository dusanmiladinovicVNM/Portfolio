import { DomainError } from '@portfolio/domain';

export const SUPPORTED_INSPECTION_SIGNATURE_MIME_TYPES = [
  'image/png',
  'image/jpeg',
] as const;

/**
 * A registered signature must be renderable in the immutable Inspection PDF.
 * Other media types remain valid Document evidence, but are not graphical
 * signature artwork. Enforce before upload/registration, not at final report.
 */
export function assertSupportedInspectionSignatureMimeType(
  mimeType: string,
): void {
  if (!(SUPPORTED_INSPECTION_SIGNATURE_MIME_TYPES as readonly string[])
    .includes(mimeType.trim().toLowerCase())) {
    throw new DomainError(
      'INSPECTION_SIGNATURE_FORMAT_UNSUPPORTED',
      'Inspection signature artwork must be PNG or JPEG. ' +
        'Attach WebP/PDF as supporting evidence rather than a signature.',
    );
  }
}
