import {
  attachInspectionEvidenceRequestSchema,
  createDocumentRequestSchema,
  createInspectionFindingRequestSchema,
  documentListResponseSchema,
  documentResponseSchema,
  documentVersionListResponseSchema,
  documentVersionResponseSchema,
  inspectionBundleResponseSchema,
  inspectionEvidenceResponseSchema,
  inspectionFindingResponseSchema,
  type DocumentResponse,
  type DocumentVersionResponse,
  type InspectionBundleResponse,
  type InspectionEvidenceResponse,
  type InspectionFindingResponse,
} from '@portfolio/contracts';
import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  documentVersionsPath,
  documentVersionUploadPath,
  documentsPath,
  inspectionBinaryUploadPath,
  inspectionEvidencePath,
  inspectionFindingsPath,
  inspectionPath,
} from '../api/paths.js';
import {
  isAmbiguousWriteFailure,
  type PortfolioApi,
} from '../api/portfolio-api.js';
import {
  contractErrorMessage,
  requiredString,
} from '../admin/form-utils.js';
import { DocumentBinaryActions } from '../documents/DocumentBinaryActions.js';
import {
  assertDocumentVersionListOwner,
  assertUploadedDocumentVersion,
} from '../documents/signed-document-owner.js';
import { formatDetailKey } from '../presentation/format.js';
import {
  assertAttachedInspectionEvidence,
  assertCreatedEvidenceDocument,
  assertCreatedInspectionFinding,
  assertInspectionBundleOwner,
  findRecoveredEvidenceDocument,
  findRecoveredInspectionEvidence,
  findRecoveredUploadedDocumentVersion,
  type InspectionEvidenceRegistration,
  type InspectionFindingRegistration,
} from './inspection-content-owner.js';
import type { InspectionWriteGate } from './inspection-write-gate.js';

interface InspectionFindingsEvidenceProps {
  readonly api: PortfolioApi;
  readonly bundle: InspectionBundleResponse;
  readonly selectedSectionId: string;
  readonly blockedByDirtySection: boolean;
  readonly writeGate: InspectionWriteGate;
  readonly onCanonicalBundle: (
    targetInspectionId: string,
    canonical: InspectionBundleResponse,
  ) => void;
}

type PendingAction = 'finding' | 'scoped-upload' | 'document' | 'upload' | 'attach' | null;
type EvidenceScope = 'inspection' | 'section' | 'item';

interface StableUpload {
  readonly key: string;
  readonly fingerprint: string;
}

const MAX_EVIDENCE_UPLOAD_BYTES = 16 * 1024 * 1024;

function fileFingerprint(file: File): string {
  return [file.name, file.type || 'application/octet-stream', file.size].join('|');
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function errorMessage(cause: unknown, fallback: string): string {
  return cause instanceof Error ? cause.message : fallback;
}

function newestVersion(
  versions: readonly DocumentVersionResponse[],
): DocumentVersionResponse | null {
  return [...versions].sort(
    (left, right) => right.versionNumber - left.versionNumber,
  )[0] ?? null;
}

export function InspectionFindingsEvidence({
  api,
  bundle,
  selectedSectionId,
  blockedByDirtySection,
  writeGate,
  onCanonicalBundle,
}: InspectionFindingsEvidenceProps) {
  const mountedRef = useRef(true);
  const scopedUploadRef = useRef<StableUpload | null>(null);
  const [documents, setDocuments] =
    useState<readonly DocumentResponse[] | null>(null);
  const [documentsError, setDocumentsError] = useState<string | null>(null);
  const [selectedDocumentId, setSelectedDocumentId] =
    useState<string | null>(null);
  const [versions, setVersions] =
    useState<readonly DocumentVersionResponse[] | null>(null);
  const [versionsError, setVersionsError] = useState<string | null>(null);
  const [selectedVersionId, setSelectedVersionId] =
    useState<string | null>(null);
  const [catalogRevision, setCatalogRevision] = useState(0);
  const [versionRevision, setVersionRevision] = useState(0);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [evidenceScope, setEvidenceScope] =
    useState<EvidenceScope>('section');

  const inspection = bundle.inspection;
  const selectedSection = bundle.schema.sections.find(
    (section) => section.id === selectedSectionId,
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setDocumentsError(null);

    void api
      .get(documentsPath(), documentListResponseSchema, {
        signal: controller.signal,
      })
      .then((response) => {
        if (controller.signal.aborted) return;
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
          errorMessage(cause, 'Document catalog could not be loaded.'),
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
        if (controller.signal.aborted) return;
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
          errorMessage(cause, 'Document versions could not be loaded.'),
        );
      });

    return () => controller.abort();
  }, [api, selectedDocumentId, versionRevision]);

  const selectedDocument = useMemo(
    () =>
      documents?.find((document) => document.id === selectedDocumentId) ?? null,
    [documents, selectedDocumentId],
  );
  const selectedVersion = useMemo(
    () => versions?.find((version) => version.id === selectedVersionId) ?? null,
    [selectedVersionId, versions],
  );

  if (!selectedSection) {
    return (
      <div className="inspection-content-workspace" role="alert">
        <p className="form-error">
          Selected Inspection section does not belong to the canonical schema.
        </p>
      </div>
    );
  }
  const activeSection = selectedSection;

  const contentWritable = inspection.status === 'in_progress';
  const blocked =
    writeGate.pending || blockedByDirtySection || !contentWritable;
  const sectionFindings = bundle.findings.filter(
    (finding) => finding.sectionId === activeSection.id,
  );

  function rejectContentWriteBlocked(): boolean {
    if (blockedByDirtySection) {
      setError(
        'Save or discard the current section before recording Findings or Evidence.',
      );
      return true;
    }
    if (!contentWritable) {
      setError('Start the Inspection before recording Findings or Evidence.');
      return true;
    }
    return false;
  }

  function begin(action: Exclude<PendingAction, null>): boolean {
    if (rejectContentWriteBlocked() || !writeGate.tryStart()) return false;
    setPendingAction(action);
    setError(null);
    setSuccess(null);
    return true;
  }

  function finish(): void {
    writeGate.finish();
    if (mountedRef.current) setPendingAction(null);
  }

  async function readCanonical(): Promise<InspectionBundleResponse> {
    const canonical = await api.get(
      inspectionPath(inspection.id),
      inspectionBundleResponseSchema,
    );
    assertInspectionBundleOwner(inspection.id, inspection.unitId, canonical);
    return canonical;
  }

  function applyCanonical(canonical: InspectionBundleResponse): void {
    if (!mountedRef.current) return;
    onCanonicalBundle(inspection.id, canonical);
  }

  async function createFinding(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (rejectContentWriteBlocked()) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const rawItemId = requiredString(form, 'itemId');
    const parsed = createInspectionFindingRequestSchema.safeParse({
      sectionId: activeSection.id,
      itemId: rawItemId || null,
      severity: requiredString(form, 'severity'),
      title: requiredString(form, 'title'),
      description: requiredString(form, 'description') || null,
    });
    if (!parsed.success) {
      setError(contractErrorMessage());
      return;
    }
    if (!begin('finding')) return;

    const expected: InspectionFindingRegistration = {
      inspectionId: inspection.id,
      sectionId: activeSection.id,
      itemId: parsed.data.itemId ?? null,
      severity: parsed.data.severity,
      title: parsed.data.title,
      description: parsed.data.description ?? null,
    };
    let writeAcknowledged = false;
    let writeAmbiguous = false;
    try {
      let created: InspectionFindingResponse;
      try {
        created = await api.post(
          inspectionFindingsPath(inspection.id),
          parsed.data,
          inspectionFindingResponseSchema,
        );
        writeAcknowledged = true;
      } catch (cause) {
        if (!isAmbiguousWriteFailure(cause)) throw cause;
        writeAmbiguous = true;
        const canonical = await readCanonical();
        applyCanonical(canonical);
        throw new Error(
          'Finding acknowledgement was lost. Canonical Inspection state was reloaded, but Findings have no idempotency key that can prove which concurrent writer created a matching row. Do not retry until the Finding list has been checked.',
        );
      }

      assertCreatedInspectionFinding(expected, created);
      const canonical = await readCanonical();
      const persisted = canonical.findings.find(
        (finding) => finding.id === created.id,
      );
      if (!persisted) {
        throw new Error(
          'Finding response was not present in the canonical Inspection reread.',
        );
      }
      assertCreatedInspectionFinding(expected, persisted);
      applyCanonical(canonical);
      if (mountedRef.current) {
        formElement.reset();
        setSuccess('Finding recorded and canonical Inspection state reloaded.');
      }
    } catch (cause) {
      if (mountedRef.current) {
        setError(
          writeAcknowledged
            ? `Finding write was acknowledged by the server, but follow-up verification failed: ${errorMessage(cause, 'canonical verification failed')}. Do not retry until the canonical Finding list has been checked.`
            : writeAmbiguous
              ? `Finding outcome is unconfirmed: ${errorMessage(cause, 'canonical reread also failed')}. Findings have no idempotency key; do not retry until canonical Inspection state has been checked.`
              : errorMessage(cause, 'Finding could not be recorded.'),
        );
      }
    } finally {
      finish();
    }
  }

  async function uploadScopedEvidence(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (rejectContentWriteBlocked()) return;

    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const fileValue = form.get('file');
    const purpose = requiredString(form, 'purpose');
    if (
      !(fileValue instanceof File) ||
      fileValue.size === 0 ||
      (purpose !== 'photo' && purpose !== 'attachment')
    ) {
      setError('Choose a non-empty evidence file and a valid evidence kind.');
      return;
    }
    if (fileValue.size > MAX_EVIDENCE_UPLOAD_BYTES) {
      setError(
        'Inspection evidence files are limited to the 16 MiB online production ceiling.',
      );
      return;
    }
    if (!begin('scoped-upload')) return;

    const fingerprint = fileFingerprint(fileValue);
    const existing = scopedUploadRef.current;
    const stable =
      existing?.fingerprint === fingerprint
        ? existing
        : { key: crypto.randomUUID(), fingerprint };
    scopedUploadRef.current = stable;
    const path = inspectionBinaryUploadPath(
      inspection.id,
      purpose,
      stable.key,
      fileValue.name,
    );

    try {
      let uploaded: DocumentVersionResponse;
      try {
        uploaded = await api.postBinary(
          path,
          fileValue,
          documentVersionResponseSchema,
        );
      } catch (cause) {
        if (!isAmbiguousWriteFailure(cause)) {
          scopedUploadRef.current = null;
          throw cause;
        }
        uploaded = await api.postBinary(
          path,
          fileValue,
          documentVersionResponseSchema,
        );
      }

      const expectedMimeType = (
        fileValue.type || 'application/octet-stream'
      ).toLowerCase();
      if (
        uploaded.id !== stable.key ||
        uploaded.versionNumber !== 1 ||
        uploaded.fileName !== fileValue.name.trim() ||
        uploaded.mimeType !== expectedMimeType ||
        uploaded.byteSize !== fileValue.size
      ) {
        throw new Error(
          'Inspection-scoped upload returned a different binary identity.',
        );
      }

      scopedUploadRef.current = null;
      if (mountedRef.current) {
        formElement.reset();
        setSelectedDocumentId(uploaded.documentId);
        setSelectedVersionId(uploaded.id);
        setCatalogRevision((revision) => revision + 1);
        setVersionRevision((revision) => revision + 1);
        setSuccess(
          'Inspection-scoped evidence binary stored. Attach this exact version below.',
        );
      }
    } catch (cause) {
      if (mountedRef.current) {
        const ambiguous = isAmbiguousWriteFailure(cause);
        if (!ambiguous) scopedUploadRef.current = null;
        setError(
          ambiguous
            ? `Evidence upload outcome is still ambiguous: ${errorMessage(cause, 'request failed')}. Re-select the same file and retry; the stable upload key will be reused.`
            : errorMessage(cause, 'Inspection-scoped evidence upload failed.'),
        );
      }
    } finally {
      finish();
    }
  }

  async function createEvidenceDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (rejectContentWriteBlocked()) return;
    if (documents === null) {
      setError(
        'Wait for the canonical Document catalog before creating Evidence.',
      );
      return;
    }
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const parsed = createDocumentRequestSchema.safeParse({
      code: requiredString(form, 'code'),
      title: requiredString(form, 'title'),
      category: requiredString(form, 'category'),
    });
    if (!parsed.success) {
      setError(contractErrorMessage());
      return;
    }
    if (!begin('document')) return;

    const preExistingIds = new Set(
      (documents ?? []).map((document) => document.id),
    );

    let writeAcknowledged = false;
    try {
      let created: DocumentResponse;
      let recoveredCreate = false;
      try {
        created = await api.post(
          documentsPath(),
          parsed.data,
          documentResponseSchema,
        );
        writeAcknowledged = true;
      } catch (cause) {
        if (!isAmbiguousWriteFailure(cause)) throw cause;
        const canonical = await api.get(
          documentsPath(),
          documentListResponseSchema,
        );
        const recovered = findRecoveredEvidenceDocument(
          canonical.items,
          preExistingIds,
          parsed.data,
        );
        if (mountedRef.current) setDocuments(canonical.items);
        if (!recovered) {
          throw new Error(
            'Evidence Document creation is ambiguous and canonical state does not prove exactly one matching new Document. Do not retry until the catalog has been checked.',
          );
        }
        created = recovered;
        recoveredCreate = true;
      }

      assertCreatedEvidenceDocument(parsed.data, created);
      if (mountedRef.current) {
        formElement.reset();
        setSelectedDocumentId(created.id);
        setSelectedVersionId(null);
        setCatalogRevision((revision) => revision + 1);
        setSuccess(
          recoveredCreate
            ? 'Evidence Document was committed and recovered from the canonical catalog.'
            : `Evidence Document ${created.code} created. Upload the exact binary version next.`,
        );
      }
    } catch (cause) {
      if (mountedRef.current) {
        setCatalogRevision((revision) => revision + 1);
        setError(
          writeAcknowledged
            ? `Evidence Document creation was acknowledged by the server, but response verification failed: ${errorMessage(cause, 'verification failed')}. Reload the canonical Document catalog before retrying.`
            : errorMessage(cause, 'Evidence Document could not be created.'),
        );
      }
    } finally {
      finish();
    }
  }

  async function uploadEvidenceVersion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (rejectContentWriteBlocked()) return;
    if (!selectedDocument || versions === null) return;

    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const fileValue = form.get('file');
    if (!(fileValue instanceof File) || fileValue.size === 0) {
      setError('Choose a non-empty evidence file to upload.');
      return;
    }
    if (fileValue.size > MAX_EVIDENCE_UPLOAD_BYTES) {
      setError(
        'Inspection evidence files are currently limited to 16 MiB until bounded streaming upload is implemented.',
      );
      return;
    }
    if (!begin('upload')) return;

    const documentAtStart = selectedDocument;
    const expectedBinary = {
      fileName: fileValue.name.trim(),
      mimeType: (fileValue.type || 'application/octet-stream')
        .trim()
        .toLowerCase(),
      byteSize: fileValue.size,
    };
    const preExistingIds = new Set(versions.map((version) => version.id));

    let writeAcknowledged = false;
    try {
      let uploaded: DocumentVersionResponse;
      let recoveredUpload = false;
      try {
        uploaded = await api.postBinary(
          documentVersionUploadPath(
            documentAtStart.id,
            expectedBinary.fileName,
            documentAtStart.revision,
          ),
          fileValue,
          documentVersionResponseSchema,
        );
        writeAcknowledged = true;
      } catch (cause) {
        if (!isAmbiguousWriteFailure(cause)) throw cause;
        const canonical = await api.get(
          documentVersionsPath(documentAtStart.id),
          documentVersionListResponseSchema,
        );
        assertDocumentVersionListOwner(documentAtStart.id, canonical.items);
        const recovered = findRecoveredUploadedDocumentVersion(
          canonical.items,
          preExistingIds,
          documentAtStart,
          expectedBinary,
        );
        if (mountedRef.current) setVersions(canonical.items);
        if (!recovered) {
          throw new Error(
            'Evidence upload is ambiguous and canonical Document state does not prove exactly one matching new version. Do not upload again until the versions have been checked.',
          );
        }
        uploaded = recovered;
        recoveredUpload = true;
      }

      assertUploadedDocumentVersion(
        documentAtStart,
        expectedBinary,
        uploaded,
      );
      if (mountedRef.current) {
        formElement.reset();
        setSelectedVersionId(uploaded.id);
        setCatalogRevision((revision) => revision + 1);
        setVersionRevision((revision) => revision + 1);
        setSuccess(
          recoveredUpload
            ? 'Evidence binary was committed and recovered from canonical Document versions.'
            : `Version v${uploaded.versionNumber} stored. Attach this exact immutable binary to the Inspection; normal evidence does not require DocumentVersion finalization.`,
        );
      }
    } catch (cause) {
      if (mountedRef.current) {
        setCatalogRevision((revision) => revision + 1);
        setVersionRevision((revision) => revision + 1);
        setError(
          writeAcknowledged
            ? `Evidence upload was acknowledged by the server, but response verification failed: ${errorMessage(cause, 'verification failed')}. Do not upload again until canonical Document versions have been checked.`
            : errorMessage(
                cause,
                'Evidence upload could not be confirmed. Canonical Document versions are being reloaded.',
              ),
        );
      }
    } finally {
      finish();
    }
  }

  async function attachEvidence(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (rejectContentWriteBlocked()) return;
    if (!selectedVersion) return;

    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const rawScope = requiredString(form, 'scope');
    if (!['inspection', 'section', 'item'].includes(rawScope)) {
      setError(contractErrorMessage());
      return;
    }
    const scope = rawScope as EvidenceScope;
    const rawItemId = requiredString(form, 'itemId');

    if (
      scope === 'item' &&
      !activeSection.items.some((item) => item.id === rawItemId)
    ) {
      setError('Choose an item from the active Inspection section.');
      return;
    }

    const registration = {
      documentVersionId: selectedVersion.id,
      kind: requiredString(form, 'kind'),
      ...(scope === 'inspection'
        ? {}
        : { sectionId: activeSection.id }),
      ...(scope === 'item' ? { itemId: rawItemId } : {}),
      caption: requiredString(form, 'caption') || null,
    };
    const parsed = attachInspectionEvidenceRequestSchema.safeParse(registration);
    if (!parsed.success) {
      setError(contractErrorMessage());
      return;
    }
    if (!begin('attach')) return;

    const expected: InspectionEvidenceRegistration = {
      inspectionId: inspection.id,
      sectionId:
        parsed.data.sectionId === undefined ? null : parsed.data.sectionId,
      itemId: parsed.data.itemId === undefined ? null : parsed.data.itemId,
      documentVersionId: parsed.data.documentVersionId,
      kind: parsed.data.kind,
      caption: parsed.data.caption ?? null,
    };
    const preExistingIds = new Set(
      bundle.evidence.map((evidence) => evidence.id),
    );

    let writeAcknowledged = false;
    let writeAmbiguous = false;
    try {
      let attached: InspectionEvidenceResponse;
      try {
        attached = await api.post(
          inspectionEvidencePath(inspection.id),
          parsed.data,
          inspectionEvidenceResponseSchema,
        );
        writeAcknowledged = true;
      } catch (cause) {
        if (!isAmbiguousWriteFailure(cause)) throw cause;
        writeAmbiguous = true;
        const canonical = await readCanonical();
        const recovered = findRecoveredInspectionEvidence(
          canonical,
          preExistingIds,
          expected,
        );
        if (!recovered) {
          applyCanonical(canonical);
          throw new Error(
            'Evidence-link outcome is ambiguous and canonical state does not prove exactly one matching new relation. The stored binary was preserved; do not upload it again.',
          );
        }
        applyCanonical(canonical);
        if (mountedRef.current) {
          formElement.reset();
          setEvidenceScope('section');
          setSuccess(
            'Evidence relation was committed and recovered. The existing DocumentVersion was reused; no binary was uploaded again.',
          );
        }
        return;
      }

      assertAttachedInspectionEvidence(expected, attached);
      const canonical = await readCanonical();
      const persisted = canonical.evidence.find(
        (evidence) => evidence.id === attached.id,
      );
      if (!persisted) {
        throw new Error(
          'Evidence response was not present in the canonical Inspection reread.',
        );
      }
      assertAttachedInspectionEvidence(expected, persisted);
      applyCanonical(canonical);
      if (mountedRef.current) {
        formElement.reset();
        setEvidenceScope('section');
        setSuccess(
          'Exact DocumentVersion attached and canonical Inspection state reloaded.',
        );
      }
    } catch (cause) {
      if (mountedRef.current) {
        setError(
          writeAcknowledged
            ? `Evidence relation was acknowledged by the server, but follow-up verification failed: ${errorMessage(cause, 'canonical verification failed')}. Do not upload the binary again; reload canonical Inspection state before retrying the relation.`
            : writeAmbiguous
              ? `Evidence-link outcome is unconfirmed: ${errorMessage(cause, 'canonical reread also failed')}. The binary remains stored; do not upload it again. Check canonical Inspection state before retrying the relation.`
              : errorMessage(cause, 'Evidence could not be attached.'),
        );
      }
    } finally {
      finish();
    }
  }

  return (
    <div className="inspection-content-workspace">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Canonical field evidence</p>
          <h3>Findings + evidence</h3>
        </div>
        <span className="section-note">
          Exact Inspection owner · exact DocumentVersion
        </span>
      </div>

      {!contentWritable ? (
        <p className="setup-hint" role="status">
          Start the Inspection before recording Findings or Evidence.
        </p>
      ) : null}
      {blockedByDirtySection ? (
        <p className="setup-hint" role="status">
          Save or discard the current section before recording Findings or
          Evidence.
        </p>
      ) : null}
      {error ? (
        <p className="setup-form-error" role="alert">{error}</p>
      ) : null}
      {success ? (
        <p className="setup-form-success" aria-live="polite">{success}</p>
      ) : null}

      <div className="inspection-content-grid">
        <div className="inspection-content-card">
          <div className="tenancy-form-heading">
            <strong>Current section Findings</strong>
            <span>{activeSection.title}</span>
          </div>
          {sectionFindings.length === 0 ? (
            <p className="muted">No Findings recorded in this section.</p>
          ) : (
            <ul className="inspection-content-list">
              {sectionFindings.map((finding) => (
                <li key={finding.id}>
                  <strong>
                    {formatDetailKey(finding.severity)} · {finding.title}
                  </strong>
                  {finding.description ? <span>{finding.description}</span> : null}
                  <small>
                    {finding.itemId
                      ? `Item ${finding.itemId}`
                      : 'Section-level Finding'}
                  </small>
                </li>
              ))}
            </ul>
          )}
        </div>

        <form
          className="inspection-content-card setup-form"
          data-inspection-content-form="finding"
          onSubmit={createFinding}
        >
          <div className="tenancy-form-heading">
            <strong>Record Finding</strong>
            <span>Section owner is fixed by the current route</span>
          </div>
          <label>
            Item
            <select disabled={blocked} defaultValue="" name="itemId">
              <option value="">Whole section</option>
              {activeSection.items.map((item) => (
                <option key={item.id} value={item.id}>{item.label}</option>
              ))}
            </select>
          </label>
          <label>
            Severity
            <select disabled={blocked} defaultValue="minor" name="severity">
              <option value="info">Info</option>
              <option value="minor">Minor</option>
              <option value="major">Major</option>
              <option value="critical">Critical</option>
            </select>
          </label>
          <label>
            Title
            <input disabled={blocked} name="title" required />
          </label>
          <label>
            Description
            <textarea disabled={blocked} name="description" rows={3} />
          </label>
          <button className="button-primary" disabled={blocked} type="submit">
            {pendingAction === 'finding' ? 'Recording…' : 'Record Finding'}
          </button>
        </form>

        <div className="inspection-content-card">
          <div className="tenancy-form-heading">
            <strong>Attached Evidence</strong>
            <span>{bundle.evidence.length} canonical relation(s)</span>
          </div>
          {bundle.evidence.length === 0 ? (
            <p className="muted">No Evidence attached to this Inspection.</p>
          ) : (
            <ul className="inspection-content-list">
              {bundle.evidence.map((evidence) => (
                <li key={evidence.id}>
                  <strong>{formatDetailKey(evidence.kind)}</strong>
                  {evidence.caption ? <span>{evidence.caption}</span> : null}
                  <small>
                    {evidence.itemId
                      ? bundle.schema.sections
                          .flatMap((section) => section.items)
                          .find((item) => item.id === evidence.itemId)?.label ??
                        'Inspection item'
                      : evidence.sectionId
                        ? bundle.schema.sections.find(
                            (section) => section.id === evidence.sectionId,
                          )?.title ?? 'Inspection section'
                        : 'Inspection-level Evidence'}
                  </small>
                  <small>Exact evidence version attached</small>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="inspection-content-card inspection-evidence-workflow">
          <div className="tenancy-form-heading">
            <strong>Evidence binary workflow</strong>
            <span>
              Field upload or reuse Document → attach exact version
            </span>
          </div>
          <p className="muted">
            Storage provider IDs never become Inspection identity. Field inspectors
            use the Inspection-scoped upload; admin/manager may also reuse the wider
            Document catalog. A stored version remains selectable after a failed link.
          </p>

          <div className="inspection-evidence-steps">
            <form
              className="inspection-evidence-step setup-form"
              data-inspection-content-form="evidence-scoped-upload"
              onSubmit={uploadScopedEvidence}
            >
              <div className="tenancy-form-heading">
                <strong>Field · Upload Inspection evidence</strong>
                <span>Scoped to this Inspection · no global Document write</span>
              </div>
              <label>
                Kind
                <select disabled={blocked} defaultValue="photo" name="purpose">
                  <option value="photo">Photo</option>
                  <option value="attachment">Attachment</option>
                </select>
              </label>
              <label>
                Evidence file
                <input disabled={blocked} name="file" required type="file" />
              </label>
              <p className="setup-hint">
                Uses a stable upload key and exact DocumentVersion identity.
              </p>
              <button className="button-primary" disabled={blocked} type="submit">
                {pendingAction === 'scoped-upload'
                  ? 'Uploading…'
                  : 'Upload Inspection evidence'}
              </button>
            </form>

            <form
              className="inspection-evidence-step setup-form"
              data-inspection-content-form="evidence-document"
              onSubmit={createEvidenceDocument}
            >
              <div className="tenancy-form-heading">
                <strong>1 · Create Document</strong>
                <span>Skip when reusing an existing Document</span>
              </div>
              <label>
                Document code
                <input disabled={blocked} name="code" required />
              </label>
              <label>
                Title
                <input disabled={blocked} name="title" required />
              </label>
              <label>
                Category
                <select disabled={blocked} defaultValue="photo" name="category">
                  <option value="photo">Photo</option>
                  <option value="inspection">Inspection document</option>
                </select>
              </label>
              <button
                className="button-primary"
                disabled={blocked || documents === null}
                type="submit"
              >
                {pendingAction === 'document' ? 'Creating…' : 'Create Document'}
              </button>
            </form>

            <div className="inspection-evidence-step setup-form">
              <div className="tenancy-form-heading">
                <strong>2 · Select Document</strong>
                <span>Canonical recovery entry point</span>
              </div>
              {documentsError ? (
                <p className="form-error" role="alert">{documentsError}</p>
              ) : null}
              {!documentsError && documents === null ? (
                <p className="muted" aria-live="polite">Loading Documents…</p>
              ) : null}
              {documents ? (
                <label>
                  Document
                  <select
                    aria-label="Inspection evidence Document"
                    disabled={writeGate.pending}
                    onChange={(event) => {
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
                        {document.code} · {document.title} · {document.category}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              {selectedDocument ? (
                <small className="muted">
                  revision {selectedDocument.revision} · latest version{' '}
                  {selectedDocument.latestVersionNumber}
                </small>
              ) : null}
            </div>

            <form
              className="inspection-evidence-step setup-form"
              data-inspection-content-form="evidence-upload"
              onSubmit={uploadEvidenceVersion}
            >
              <div className="tenancy-form-heading">
                <strong>3 · Upload exact version</strong>
                <span>Document revision CAS + canonical recovery</span>
              </div>
              <label>
                Evidence file
                <input
                  disabled={
                    blocked ||
                    selectedDocument === null ||
                    selectedDocument.status !== 'active' ||
                    versions === null
                  }
                  name="file"
                  required
                  type="file"
                />
              </label>
              <p className="setup-hint">
                Online production ceiling: 16 MiB. The server enforces the same bounded upload limit.
              </p>
              <button
                className="button-primary"
                disabled={
                  blocked ||
                  selectedDocument === null ||
                  selectedDocument.status !== 'active' ||
                  versions === null
                }
                type="submit"
              >
                {pendingAction === 'upload' ? 'Uploading…' : 'Upload version'}
              </button>
            </form>

            <div className="inspection-evidence-step setup-form">
              <div className="tenancy-form-heading">
                <strong>4 · Select exact version</strong>
                <span>Normal Inspection evidence may use stored or final</span>
              </div>
              {versionsError ? (
                <p className="form-error" role="alert">{versionsError}</p>
              ) : null}
              {selectedDocumentId && !versionsError && versions === null ? (
                <p className="muted" aria-live="polite">Loading versions…</p>
              ) : null}
              {versions ? (
                <label>
                  Version
                  <select
                    aria-label="Inspection evidence Document version"
                    disabled={writeGate.pending}
                    onChange={(event) => {
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
                    {' · '}{selectedVersion.status}
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

            <form
              className="inspection-evidence-step setup-form"
              data-inspection-content-form="evidence-attach"
              onSubmit={attachEvidence}
            >
              <div className="tenancy-form-heading">
                <strong>5 · Attach to Inspection</strong>
                <span>Business relation only; no second binary upload</span>
              </div>
              <label>
                Kind
                <select disabled={blocked} defaultValue="photo" name="kind">
                  <option value="photo">Photo</option>
                  <option value="attachment">Attachment</option>
                </select>
              </label>
              <label>
                Scope
                <select
                  disabled={blocked}
                  name="scope"
                  onChange={(event) =>
                    setEvidenceScope(event.currentTarget.value as EvidenceScope)
                  }
                  value={evidenceScope}
                >
                  <option value="inspection">Whole Inspection</option>
                  <option value="section">Current section</option>
                  <option value="item">Current section item</option>
                </select>
              </label>
              {evidenceScope === 'item' ? (
                <label>
                  Item
                  <select disabled={blocked} defaultValue="" name="itemId" required>
                    <option value="">Select item…</option>
                    {activeSection.items.map((item) => (
                      <option key={item.id} value={item.id}>{item.label}</option>
                    ))}
                  </select>
                </label>
              ) : (
                <input name="itemId" type="hidden" value="" />
              )}
              <label>
                Caption
                <textarea disabled={blocked} name="caption" rows={2} />
              </label>
              <button
                className="button-primary"
                disabled={blocked || selectedVersion === null}
                type="submit"
              >
                {pendingAction === 'attach'
                  ? 'Attaching…'
                  : 'Attach exact version'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
