import {
  unitDocumentListResponseSchema,
  type UnitDocumentReferenceResponse,
} from '@portfolio/contracts';
import { useEffect, useState } from 'react';
import { unitDocumentsPath } from '../api/paths.js';
import type { PortfolioApi } from '../api/portfolio-api.js';
import { DocumentBinaryActions } from '../documents/DocumentBinaryActions.js';
import { formatDetailKey } from '../presentation/format.js';

interface UnitDocumentsProps {
  readonly api: PortfolioApi;
  readonly unitId: string;
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function LinkScope({
  api,
  reference,
}: {
  readonly api: PortfolioApi;
  readonly reference: UnitDocumentReferenceResponse;
}) {
  if (reference.linkedVersion === null) {
    return (
      <div className="document-version-box">
        <span>Document-level link</span>
        <strong>Follows the Document across versions</strong>
        <small>
          Latest registered version: {reference.document.latestVersionNumber}
        </small>
      </div>
    );
  }

  return (
    <div className="document-version-box">
      <span>Exact linked version</span>
      <strong>
        v{reference.linkedVersion.versionNumber} ·{' '}
        {reference.linkedVersion.fileName}
      </strong>
      <small>
        {reference.linkedVersion.mimeType} ·{' '}
        {formatBytes(reference.linkedVersion.byteSize)} ·{' '}
        {reference.linkedVersion.status}
      </small>
      <DocumentBinaryActions
        api={api}
        fileName={reference.linkedVersion.fileName}
        versionId={reference.linkedVersion.id}
      />
    </div>
  );
}

export function UnitDocuments({ api, unitId }: UnitDocumentsProps) {
  const [items, setItems] =
    useState<readonly UnitDocumentReferenceResponse[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setItems(null);
    setError(null);

    void api
      .get(unitDocumentsPath(unitId), unitDocumentListResponseSchema, {
        signal: controller.signal,
      })
      .then((response) => setItems(response.items))
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(
          cause instanceof Error
            ? cause.message
            : 'Unit documents could not be loaded.',
        );
      });

    return () => controller.abort();
  }, [api, unitId]);

  return (
    <section className="panel page-panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Document dossier</p>
          <h2>Documents linked to this Unit</h2>
        </div>
        <span className="section-note">
          One row per authoritative DocumentLink
        </span>
      </div>

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {!error && items === null ? (
        <p className="muted" aria-live="polite">
          Loading Unit documents…
        </p>
      ) : null}
      {items?.length === 0 ? (
        <p className="muted">No Documents are linked directly to this Unit.</p>
      ) : null}

      {items && items.length > 0 ? (
        <div className="document-grid">
          {items.map((reference) => (
            <article className="document-card" key={reference.link.id}>
              <div className="document-heading">
                <div>
                  <span className="eyebrow">{reference.document.code}</span>
                  <h3>{reference.document.title}</h3>
                </div>
                <span className="status-chip">
                  {reference.document.status}
                </span>
              </div>

              <dl className="detail-list">
                <div>
                  <dt>Category</dt>
                  <dd>{formatDetailKey(reference.document.category)}</dd>
                </div>
                <div>
                  <dt>Relation</dt>
                  <dd>{formatDetailKey(reference.link.relation)}</dd>
                </div>
                <div>
                  <dt>Document revision</dt>
                  <dd>{reference.document.revision}</dd>
                </div>
              </dl>

              <LinkScope api={api} reference={reference} />
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
