import {
  createDocumentRequestSchema,
  documentLinkRequestSchema,
  documentLinkResponseSchema,
  documentListResponseSchema,
  documentResponseSchema,
  documentVersionListResponseSchema,
  documentVersionResponseSchema,
  type DocumentResponse,
  type DocumentVersionResponse,
} from '@portfolio/contracts';
import { type FormEvent, useEffect, useMemo, useState } from 'react';
import {
  documentLinksPath,
  documentsPath,
  documentVersionFinalizePath,
  documentVersionsPath,
  documentVersionUploadPath,
} from '../api/paths.js';
import {
  PortfolioApiError,
  type PortfolioApi,
} from '../api/portfolio-api.js';
import {
  contractErrorMessage,
  requiredString,
} from '../admin/form-utils.js';
import { useCreateSubmissionGuard } from '../admin/use-create-submission-guard.js';
import { DocumentBinaryActions } from './DocumentBinaryActions.js';
import {
  assertCreatedDocument,
  assertDocumentVersionListOwner,
  assertFinalizedDocumentVersion,
  assertSignedOriginalLink,
  assertUploadedDocumentVersion,
} from './signed-document-owner.js';

export type SignedDocumentTarget =
  | {
      readonly targetType: 'lease_agreement';
      readonly targetId: string;
      readonly code: string;
    }
  | {
      readonly targetType: 'lease_amendment';
      readonly targetId: string;
      readonly code: string;
    };

interface SignedDocumentAdministrationProps {
  readonly api: PortfolioApi;
  readonly target: SignedDocumentTarget;
  readonly onCanonicalWrite: () => void;
}

type PendingAction = 'create' | 'upload' | 'finalize' | 'link' | null;

const MAX_SIGNED_DOCUMENT_UPLOAD_BYTES = 16 * 1024 * 1024;

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function newestVersion(
  versions: readonly DocumentVersionResponse[],
): DocumentVersionResponse | null {
  return [...versions].sort(
    (left, right) => right.versionNumber - left.versionNumber,
  )[0] ?? null;
}

function actionError(cause: unknown, fallback: string): string {
  if (
    cause instanceof PortfolioApiError &&
    cause.code === 'DOCUMENT_VERSION_CONFLICT'
  ) {
    return 'This Document changed on the server. Canonical Document state was reloaded.';
  }
  if (
    cause instanceof PortfolioApiError &&
    cause.code === 'DOCUMENT_SIGNED_ORIGINAL_ALREADY_EXISTS'
  ) {
    return 'This legal record already has a signed original. Canonical links were reloaded.';
  }
  return cause instanceof Error ? cause.message : fallback;
}

export function SignedDocumentAdministration({
  api,
  target,
  onCanonicalWrite,
}: SignedDocumentAdministrationProps) {
  const guard = useCreateSubmissionGuard();
  const [documents, setDocuments] =
    useState<readonly DocumentResponse[] | null>(null);
  const [documentsError, setDocumentsError] = useState<string | null>(null);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(
    null,
  );
  const [versions, setVersions] =
    useState<readonly DocumentVersionResponse[] | null>(null);
  const [versionsError, setVersionsError] = useState<string | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(
    null,
  );
  const [catalogRevision, setCatalogRevision] = useState(0);
  const [versionRevision, setVersionRevision] = useState(0);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const selectedDocument = useMemo(
    () =>
      documents?.find((document) => document.id === selectedDocumentId) ?? null,
    [documents, selectedDocumentId],
  );
  const selectedVersion = useMemo(
    () => versions?.find((version) => version.id === selectedVersionId) ?? null,
    [selectedVersionId, versions],
  );

  useEffect(() => {
    const controller = new AbortController();
    setDocumentsError(null);

    void api
      .get(documentsPath(), documentListResponseSchema, {
        signal: controller.signal,
      })
      .then((response) => {
        setDocuments(response.items);
        setSelectedDocumentId((current) =>
          current && response.items.some((item) => item.id === current)
            ? current
            : null,
        );
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setDocumentsError(
          cause instanceof Error
            ? cause.message
            : 'Document catalog could not be loaded.',
        );
      });

    return () => controller.abort();
  }, [api, catalogRevision]);

  useEffect(() => {
    setVersions(null);
    setVersionsError(null);

    if (!selectedDocumentId) {
      setSelectedVersionId(null);
      return;
    }

    const controller = new AbortController();
    void api
      .get(
        documentVersionsPath(selectedDocumentId),
        documentVersionListResponseSchema,
        { signal: controller.signal },
      )
      .then((response) => {
        assertDocumentVersionListOwner(selectedDocumentId, response.items);
        setVersions(response.items);
        setSelectedVersionId((current) => {
          if (current && response.items.some((item) => item.id === current)) {
            return current;
          }
          return newestVersion(response.items)?.id ?? null;
        });
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setVersionsError(
          cause instanceof Error
            ? cause.message
            : 'Document versions could not be loaded.',
        );
      });

    return () => controller.abort();
  }, [api, selectedDocumentId, versionRevision]);

  function begin(action: Exclude<PendingAction, null>): boolean {
    if (!guard.tryStart()) return false;
    setPendingAction(action);
    setError(null);
    setSuccess(null);
    return true;
  }

  function finish(): void {
    guard.finish();
    if (guard.isMounted()) setPendingAction(null);
  }

  function reloadDocument(documentId?: string): void {
    if (!guard.isMounted()) return;
    if (documentId) setSelectedDocumentId(documentId);
    setCatalogRevision((revision) => revision + 1);
    setVersionRevision((revision) => revision + 1);
  }

  async function createDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!begin('create')) return;

    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const parsed = createDocumentRequestSchema.safeParse({
      code: requiredString(form, 'code'),
      title: requiredString(form, 'title'),
      category: 'legal',
    });

    if (!parsed.success) {
      finish();
      setError(contractErrorMessage());
      return;
    }

    try {
      const created = await api.post(
        documentsPath(),
        parsed.data,
        documentResponseSchema,
      );
      assertCreatedDocument(parsed.data, created);
      if (guard.isMounted()) {
        formElement.reset();
        setSelectedDocumentId(created.id);
        setSelectedVersionId(null);
        setSuccess(
          `Document ${created.code} created. Upload or recover its exact signed version below.`,
        );
        setCatalogRevision((revision) => revision + 1);
      }
    } catch (cause) {
      if (guard.isMounted()) {
        setCatalogRevision((revision) => revision + 1);
        setError(
          actionError(
            cause,
            'Document creation outcome could not be confirmed. The canonical Document catalog was reloaded.',
          ),
        );
      }
    } finally {
      finish();
    }
  }

  async function uploadVersion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedDocument || !begin('upload')) return;

    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const fileValue = form.get('file');
    if (!(fileValue instanceof File) || fileValue.size === 0) {
      finish();
      setError('Choose a non-empty file to upload.');
      return;
    }
    if (fileValue.size > MAX_SIGNED_DOCUMENT_UPLOAD_BYTES) {
      finish();
      setError(
        'Signed Document files are currently limited to 16 MiB so every accepted version remains readable through the existing Portfolio binary-delivery path.',
      );
      return;
    }

    const documentAtStart = selectedDocument;

    try {
      const uploaded = await api.postBinary(
        documentVersionUploadPath(
          documentAtStart.id,
          fileValue.name,
          documentAtStart.revision,
        ),
        fileValue,
        documentVersionResponseSchema,
      );
      assertUploadedDocumentVersion(
        documentAtStart,
        {
          fileName: fileValue.name.trim(),
          mimeType: (fileValue.type || 'application/octet-stream')
            .trim()
            .toLowerCase(),
          byteSize: fileValue.size,
        },
        uploaded,
      );
      if (guard.isMounted()) {
        formElement.reset();
        setSelectedVersionId(uploaded.id);
        setSuccess(
          `Version v${uploaded.versionNumber} stored. Finalize this exact binary before linking it as a signed original.`,
        );
        reloadDocument(documentAtStart.id);
      }
    } catch (cause) {
      if (guard.isMounted()) {
        reloadDocument(documentAtStart.id);
        setError(
          actionError(
            cause,
            'Document upload outcome could not be confirmed. Canonical Document and Version state was reloaded.',
          ),
        );
      }
    } finally {
      finish();
    }
  }

  async function finalizeVersion() {
    if (!selectedDocument || !selectedVersion || !begin('finalize')) return;

    const documentId = selectedDocument.id;
    const versionId = selectedVersion.id;

    try {
      const finalized = await api.post(
        documentVersionFinalizePath(versionId),
        {},
        documentVersionResponseSchema,
      );
      assertFinalizedDocumentVersion(documentId, versionId, finalized);
      if (guard.isMounted()) {
        setSelectedVersionId(finalized.id);
        setSuccess(
          `Version v${finalized.versionNumber} is final and immutable. It can now be linked as the signed original.`,
        );
        setVersionRevision((revision) => revision + 1);
      }
    } catch (cause) {
      if (guard.isMounted()) {
        setVersionRevision((revision) => revision + 1);
        setError(
          actionError(
            cause,
            'Document finalization outcome could not be confirmed. Canonical Version state was reloaded.',
          ),
        );
      }
    } finally {
      finish();
    }
  }

  async function linkSignedOriginal() {
    if (!selectedDocument || !selectedVersion || !begin('link')) return;

    const documentId = selectedDocument.id;
    const versionId = selectedVersion.id;
    const parsed = documentLinkRequestSchema.safeParse({
      documentVersionId: versionId,
      relation: 'signed_original',
      targetType: target.targetType,
      targetId: target.targetId,
    });

    if (!parsed.success) {
      finish();
      setError(contractErrorMessage());
      return;
    }

    try {
      const link = await api.post(
        documentLinksPath(documentId),
        parsed.data,
        documentLinkResponseSchema,
      );
      assertSignedOriginalLink(
        documentId,
        versionId,
        target.targetType,
        target.targetId,
        link,
      );
      if (guard.isMounted()) {
        setSuccess(
          `Signed original linked to ${target.code}. The legal dossier is being reloaded from canonical server state.`,
        );
        onCanonicalWrite();
      }
    } catch (cause) {
      if (guard.isMounted()) {
        onCanonicalWrite();
        setError(
          actionError(
            cause,
            'Signed-original link outcome could not be confirmed. Canonical legal-document links were reloaded.',
          ),
        );
      }
    } finally {
      finish();
    }
  }

  const pending = pendingAction !== null;

  return (
    <div className="signed-document-admin">
      <div className="legal-documents-heading">
        <div>
          <p className="eyebrow">Signed original administration</p>
          <h3>Attach immutable evidence</h3>
        </div>
        <span className="section-note">
          Create/recover Document → upload → finalize → exact-version link
        </span>
      </div>

      <p className="muted">
        The workflow is recoverable from canonical Document and Version records.
        A failed final link never requires re-uploading a successfully stored or
        finalized binary.
      </p>

      {error ? (
        <p className="setup-form-error" role="alert">
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="setup-form-success" aria-live="polite">
          {success}
        </p>
      ) : null}

      <div className="signed-document-workflow-grid">
        <form
          className="setup-form signed-document-step"
          data-signed-document-form="create"
          onSubmit={createDocument}
        >
          <div className="tenancy-form-heading">
            <strong>1 · Create legal Document</strong>
            <span>Skip this when recovering an existing Document</span>
          </div>
          <label>
            Document code
            <input disabled={pending} name="code" required />
          </label>
          <label>
            Title
            <input disabled={pending} name="title" required />
          </label>
          <button className="button-primary" disabled={pending} type="submit">
            {pendingAction === 'create' ? 'Creating…' : 'Create Document'}
          </button>
        </form>

        <div className="setup-form signed-document-step">
          <div className="tenancy-form-heading">
            <strong>2 · Select canonical Document</strong>
            <span>Recovery entry point after reload or failed link</span>
          </div>
          {documentsError ? (
            <p className="form-error" role="alert">
              {documentsError}
            </p>
          ) : null}
          {!documentsError && documents === null ? (
            <p className="muted" aria-live="polite">
              Loading Document catalog…
            </p>
          ) : null}
          {documents ? (
            <label>
              Document
              <select
                aria-label="Signed original Document"
                disabled={pending}
                onChange={(event) => {
                  if (guard.isInFlight()) return;
                  setSelectedDocumentId(event.currentTarget.value || null);
                  setSelectedVersionId(null);
                  setError(null);
                  setSuccess(null);
                }}
                value={selectedDocumentId ?? ''}
              >
                <option value="">Select Document…</option>
                {documents.map((document) => (
                  <option key={document.id} value={document.id}>
                    {document.code} · {document.title} · {document.status}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {selectedDocument ? (
            <dl className="detail-list compact-detail-list">
              <div>
                <dt>Status</dt>
                <dd>{selectedDocument.status}</dd>
              </div>
              <div>
                <dt>Revision</dt>
                <dd>{selectedDocument.revision}</dd>
              </div>
              <div>
                <dt>Latest version</dt>
                <dd>{selectedDocument.latestVersionNumber}</dd>
              </div>
            </dl>
          ) : null}
        </div>

        <form
          className="setup-form signed-document-step"
          data-signed-document-form="upload"
          onSubmit={uploadVersion}
        >
          <div className="tenancy-form-heading">
            <strong>3 · Upload new version</strong>
            <span>Document revision CAS protects concurrent uploads</span>
          </div>
          <label>
            Signed file
            <input
              disabled={
                pending ||
                selectedDocument === null ||
                selectedDocument.status !== 'active'
              }
              name="file"
              required
              type="file"
            />
          </label>
          <p className="setup-hint">
            Current online MVP limit: 16 MiB per Document version.
          </p>
          {selectedDocument?.status === 'archived' ? (
            <p className="setup-hint">
              Archived Documents cannot receive another version. Select one of
              their existing final versions below.
            </p>
          ) : null}
          <button
            className="button-primary"
            disabled={
              pending ||
              selectedDocument === null ||
              selectedDocument.status !== 'active'
            }
            type="submit"
          >
            {pendingAction === 'upload' ? 'Uploading…' : 'Upload version'}
          </button>
        </form>

        <div className="setup-form signed-document-step">
          <div className="tenancy-form-heading">
            <strong>4 · Select exact version</strong>
            <span>Signed original always points to one immutable version</span>
          </div>
          {versionsError ? (
            <p className="form-error" role="alert">
              {versionsError}
            </p>
          ) : null}
          {selectedDocumentId && !versionsError && versions === null ? (
            <p className="muted" aria-live="polite">
              Loading Document versions…
            </p>
          ) : null}
          {versions ? (
            <label>
              Version
              <select
                aria-label="Signed original Document version"
                disabled={pending}
                onChange={(event) => {
                  if (guard.isInFlight()) return;
                  setSelectedVersionId(event.currentTarget.value || null);
                  setError(null);
                  setSuccess(null);
                }}
                value={selectedVersionId ?? ''}
              >
                <option value="">Select version…</option>
                {versions.map((version) => (
                  <option key={version.id} value={version.id}>
                    v{version.versionNumber} · {version.fileName} · {version.status}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {selectedVersion ? (
            <div className="document-version-box">
              <span>Exact version</span>
              <strong>
                v{selectedVersion.versionNumber} · {selectedVersion.fileName}
              </strong>
              <small>
                {selectedVersion.mimeType} · {formatBytes(selectedVersion.byteSize)}
                {' · '}
                {selectedVersion.status}
              </small>
              <DocumentBinaryActions
                api={api}
                fileName={selectedVersion.fileName}
                mimeType={selectedVersion.mimeType}
                versionId={selectedVersion.id}
              />
            </div>
          ) : null}
        </div>

        <div className="setup-form signed-document-step signed-document-terminal-step">
          <div className="tenancy-form-heading">
            <strong>5 · Finalize and link</strong>
            <span>Finalization is irreversible; link is exact-version evidence</span>
          </div>

          <div className="setup-form-actions signed-document-actions">
            <button
              className="button-secondary"
              disabled={
                pending ||
                selectedDocument === null ||
                selectedVersion === null ||
                selectedVersion.status !== 'stored'
              }
              onClick={() => void finalizeVersion()}
              type="button"
            >
              {pendingAction === 'finalize' ? 'Finalizing…' : 'Finalize version'}
            </button>
            <button
              className="button-primary"
              disabled={
                pending ||
                selectedDocument === null ||
                selectedVersion === null ||
                selectedVersion.status !== 'final'
              }
              onClick={() => void linkSignedOriginal()}
              type="button"
            >
              {pendingAction === 'link'
                ? 'Linking…'
                : `Link signed original to ${target.code}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
