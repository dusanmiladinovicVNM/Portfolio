import { useState } from 'react';
import { documentVersionContentPath } from '../api/paths.js';
import type { PortfolioApi } from '../api/portfolio-api.js';

interface DocumentBinaryActionsProps {
  readonly api: PortfolioApi;
  readonly versionId: string;
  readonly fileName: string;
  readonly mimeType: string;
}

const INLINE_SAFE_MIME_TYPES = new Set([
  'application/pdf',
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

export function canOpenDocumentMimeType(mimeType: string): boolean {
  return INLINE_SAFE_MIME_TYPES.has(mimeType.trim().toLowerCase());
}

type BinaryAction = 'open' | 'download' | null;

function revokeLater(url: string): void {
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function DocumentBinaryActions({
  api,
  versionId,
  fileName,
  mimeType,
}: DocumentBinaryActionsProps) {
  const [active, setActive] = useState<BinaryAction>(null);
  const [error, setError] = useState<string | null>(null);

  async function getBlob(): Promise<Blob> {
    return api.getBinary(documentVersionContentPath(versionId));
  }

  async function openDocument() {
    if (active !== null) return;
    setActive('open');
    setError(null);

    try {
      const blob = await getBlob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      revokeLater(url);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Document could not be opened.',
      );
    } finally {
      setActive(null);
    }
  }

  async function downloadDocument() {
    if (active !== null) return;
    setActive('download');
    setError(null);

    try {
      const blob = await getBlob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = fileName;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      revokeLater(url);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Document could not be downloaded.',
      );
    } finally {
      setActive(null);
    }
  }

  const canOpen = canOpenDocumentMimeType(mimeType);

  return (
    <div className="document-binary-actions">
      <div className="document-action-buttons">
        {canOpen ? (
          <button
            className="button-secondary document-action-button"
            disabled={active !== null}
            onClick={openDocument}
            type="button"
          >
            {active === 'open' ? 'Opening…' : 'Open'}
          </button>
        ) : null}
        <button
          className="button-secondary document-action-button"
          disabled={active !== null}
          onClick={downloadDocument}
          type="button"
        >
          {active === 'download' ? 'Downloading…' : 'Download'}
        </button>
      </div>
      {error ? (
        <p className="form-error document-action-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
