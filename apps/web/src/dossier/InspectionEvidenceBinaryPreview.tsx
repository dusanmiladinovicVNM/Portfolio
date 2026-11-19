import { useEffect, useRef, useState } from 'react';

interface InspectionEvidenceBinaryPreviewProps {
  /** Single request created only by explicit operator action in the parent. */
  readonly request: Promise<Blob>;
  readonly caption: string | null;
  readonly onClose: () => void;
  readonly onRetry: () => void;
}

/**
 * Only image MIME types can enter the DOM as an inline preview.
 * Never construct a backend URL from storage metadata or render untrusted
 * SVG/HTML as an image document.
 */
export function canPreviewInspectionEvidenceMime(mimeType: string): boolean {
  return ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(
    mimeType.trim().toLowerCase(),
  );
}

export function inspectionEvidenceDownloadFileName(
  caption: string | null,
  mimeType: string,
): string {
  const safeBase = (caption ?? 'Inspektionsnachweis')
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}._-]+/gu, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 75) || 'Inspektionsnachweis';
  const extension =
    mimeType === 'image/jpeg' ? '.jpg'
    : mimeType === 'image/png' ? '.png'
    : mimeType === 'image/webp' ? '.webp'
    : mimeType === 'image/gif' ? '.gif'
    : mimeType === 'application/pdf' ? '.pdf'
    : '.bin';
  return safeBase.replace(/\.(jpe?g|png|webp|gif|pdf|bin)$/i, '') + extension;
}

/**
 * One on-demand, authenticated binary GET for the operator-selected exact
 * DocumentVersion. No global document reads, background thumbnails, signed
 * storage links or blob URL persistence.
 */
export function InspectionEvidenceBinaryPreview({
  request,
  caption,
  onClose,
  onRetry,
}: InspectionEvidenceBinaryPreviewProps) {
  const [blob, setBlob] = useState<Blob | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  useEffect(() => {
    let current = true;
    let url: string | null = null;
    setBlob(null);
    setImageUrl(null);
    setError(null);

    // StrictMode may replay this effect, but both subscriptions observe the
    // same promise: never send another authorized GET from an effect.
    void request
      .then((result) => {
        if (!current) return;
        setBlob(result);
        if (canPreviewInspectionEvidenceMime(result.type)) {
          url = URL.createObjectURL(result);
          setImageUrl(url);
        }
      })
      .catch((cause: unknown) => {
        if (!current) return;
        setError(
          cause instanceof Error
            ? cause.message
            : 'Die Dokumentversion konnte nicht geladen werden.',
        );
      });

    return () => {
      current = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [request]);

  function downloadLoadedBinary() {
    if (!blob) return;
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = inspectionEvidenceDownloadFileName(caption, blob.type.trim().toLowerCase());
    document.body.append(anchor);
    try {
      anchor.click();
    } finally {
      anchor.remove();
      // The browser may still be handing off the download after click.
      window.setTimeout(() => URL.revokeObjectURL(href), 60_000);
    }
  }

  return (
    <section
      aria-label="Nachweis anzeigen"
      className="inspection-evidence-binary-preview"
      data-inspection-evidence-binary-preview
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="inspection-evidence-binary-preview-heading">
        <div>
          <strong>{caption || 'Inspektionsnachweis'}</strong>
          <small>Autorisierter Zugriff auf die exakt verknüpfte Dokumentversion</small>
        </div>
        <button
          className="button-secondary"
          data-inspection-evidence-preview-close
          onClick={onClose}
          ref={closeButtonRef}
          type="button"
        >
          Schliessen
        </button>
      </div>
      {error ? (
        <div className="inspection-evidence-preview-retry">
          <p className="form-error" role="alert" data-inspection-evidence-preview-error>
            {error}
          </p>
          <button
            className="button-secondary"
            data-inspection-evidence-preview-retry
            onClick={onRetry}
            type="button"
          >
            Erneut versuchen
          </button>
        </div>
      ) : blob === null ? (
        <p role="status">Nachweis wird sicher geladen…</p>
      ) : imageUrl ? (
        <img
          alt={caption || 'Foto aus der Inspektion'}
          className="inspection-evidence-binary-image"
          data-inspection-evidence-preview-image
          src={imageUrl}
        />
      ) : (
        <p className="muted" data-inspection-evidence-preview-nonimage>
          Für diesen Dateityp gibt es keine Bildvorschau. Die autorisierte
          Dokumentversion kann heruntergeladen werden.
        </p>
      )}
      {blob ? (
        <button
          className="button-secondary"
          data-inspection-evidence-preview-download
          onClick={downloadLoadedBinary}
          type="button"
        >
          Dokumentversion herunterladen
        </button>
      ) : null}
    </section>
  );
}
