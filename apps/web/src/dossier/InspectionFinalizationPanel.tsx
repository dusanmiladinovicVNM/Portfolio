import {
  addInspectionSignatureRequestSchema,
  documentVersionResponseSchema,
  finalizeInspectionResponseSchema,
  inspectionBundleResponseSchema,
  inspectionResponseSchema,
  inspectionSignatureResponseSchema,
  partyListResponseSchema,
  unlockInspectionRequestSchema,
  type DocumentVersionResponse,
  type InspectionBundleResponse,
  type InspectionSignatureResponse,
  type PartyResponse,
} from '@portfolio/contracts';
import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  inspectionBinaryUploadPath,
  inspectionFinalizePath,
  inspectionFinalReportPath,
  inspectionLockPath,
  inspectionPath,
  inspectionSignaturesPath,
  inspectionUnlockPath,
  partiesPath,
} from '../api/paths.js';
import {
  isAmbiguousWriteFailure,
  type PortfolioApi,
  PortfolioApiError,
} from '../api/portfolio-api.js';
import {
  contractErrorMessage,
  requiredString,
} from '../admin/form-utils.js';
import { DocumentBinaryActions } from '../documents/DocumentBinaryActions.js';
import {
  formatDetailKey,
  formatSwissDateTime,
} from '../presentation/format.js';
import { assertInspectionBundleOwner } from './inspection-content-owner.js';
import {
  assertInspectionFinalizeTransition,
  assertInspectionLockTransition,
  assertInspectionSignature,
  assertInspectionUnlockTransition,
  findRecoveredInspectionSignature,
  missingRequiredSignatureRoles,
  type InspectionSignatureRegistration,
} from './inspection-finalization-owner.js';
import type { InspectionWriteGate } from './inspection-write-gate.js';

interface InspectionFinalizationPanelProps {
  readonly api: PortfolioApi;
  readonly bundle: InspectionBundleResponse;
  readonly blockedByDirtySection: boolean;
  readonly writeGate: InspectionWriteGate;
  readonly onCanonicalBundle: (
    targetInspectionId: string,
    canonical: InspectionBundleResponse,
  ) => void;
}

type PendingAction =
  | 'lock'
  | 'signature-upload'
  | 'signature'
  | 'unlock'
  | 'finalize'
  | 'report'
  | null;

interface StableUpload {
  readonly key: string;
  readonly fingerprint: string;
}

const MAX_BINARY_BYTES = 16 * 1024 * 1024;

function errorMessage(cause: unknown, fallback: string): string {
  return cause instanceof Error ? cause.message : fallback;
}

function fileFingerprint(file: File): string {
  return [file.name, file.type || 'application/octet-stream', file.size].join('|');
}

function activeSignatures(
  signatures: readonly InspectionSignatureResponse[],
): readonly InspectionSignatureResponse[] {
  return signatures.filter((signature) => signature.invalidatedAt === null);
}

function assertFinalSignatureVersion(
  expectedId: string,
  file: File,
  version: DocumentVersionResponse,
): void {
  const mimeType = (file.type || 'application/octet-stream').toLowerCase();
  if (
    version.id !== expectedId ||
    version.versionNumber !== 1 ||
    version.fileName !== file.name.trim() ||
    version.mimeType !== mimeType ||
    version.byteSize !== file.size ||
    version.status !== 'final' ||
    version.finalizedAt === null
  ) {
    throw new Error(
      'Inspection signature upload did not return the expected final DocumentVersion.',
    );
  }
}

function assertFinalReportVersion(version: DocumentVersionResponse): void {
  if (
    version.status !== 'final' ||
    version.finalizedAt === null ||
    version.mimeType !== 'application/pdf'
  ) {
    throw new Error('Final report must be one final PDF DocumentVersion.');
  }
}

export function InspectionFinalizationPanel({
  api,
  bundle,
  blockedByDirtySection,
  writeGate,
  onCanonicalBundle,
}: InspectionFinalizationPanelProps) {
  const mountedRef = useRef(true);
  const signatureUploadRef = useRef<StableUpload | null>(null);
  const [parties, setParties] = useState<readonly PartyResponse[] | null>(null);
  const [partiesError, setPartiesError] = useState<string | null>(null);
  const [signatureVersion, setSignatureVersion] =
    useState<DocumentVersionResponse | null>(null);
  const [reportVersion, setReportVersion] =
    useState<DocumentVersionResponse | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const inspection = bundle.inspection;
  const missingRoles = missingRequiredSignatureRoles(bundle);
  const active = useMemo(
    () => activeSignatures(bundle.signatures),
    [bundle.signatures],
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (inspection.status !== 'locked') return;
    const controller = new AbortController();
    setPartiesError(null);
    void api
      .get(partiesPath(), partyListResponseSchema, { signal: controller.signal })
      .then((response) => {
        if (controller.signal.aborted) return;
        setParties(response.items.filter((party) => party.status === 'active'));
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setPartiesError(
          errorMessage(cause, 'Signer Party directory could not be loaded.'),
        );
      });
    return () => controller.abort();
  }, [api, inspection.status]);

  useEffect(() => {
    if (inspection.status !== 'locked') {
      setSignatureVersion(null);
      signatureUploadRef.current = null;
    }
    if (inspection.status !== 'finalized') {
      setReportVersion(null);
    }
  }, [inspection.status]);

  function begin(
    action: Exclude<PendingAction, null>,
    options: { allowDirty?: boolean } = {},
  ): boolean {
    if (!options.allowDirty && blockedByDirtySection) {
      setError(
        'Save or discard the current section before changing Inspection lifecycle.',
      );
      return false;
    }
    if (!writeGate.tryStart()) return false;
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

  async function lockInspection() {
    if (inspection.status !== 'in_progress' || !begin('lock')) return;
    const before = inspection;
    let acknowledged = false;
    let ambiguous = false;

    try {
      try {
        const locked = await api.post(
          inspectionLockPath(before.id),
          { expectedVersion: before.version },
          inspectionResponseSchema,
        );
        acknowledged = true;
        assertInspectionLockTransition(before, locked);
      } catch (cause) {
        if (!isAmbiguousWriteFailure(cause)) throw cause;
        ambiguous = true;
        const canonical = await readCanonical();
        assertInspectionLockTransition(before, canonical.inspection);
        applyCanonical(canonical);
        if (mountedRef.current) {
          setSuccess('Inspection lock was recovered from canonical state.');
        }
        return;
      }

      const canonical = await readCanonical();
      assertInspectionLockTransition(before, canonical.inspection);
      applyCanonical(canonical);
      if (mountedRef.current) {
        setSuccess('Inspection locked. Content is frozen for signature capture.');
      }
    } catch (cause) {
      if (mountedRef.current) {
        setError(
          acknowledged
            ? `Inspection lock was acknowledged, but canonical verification failed: ${errorMessage(cause, 'verification failed')}. Reload before retrying.`
            : ambiguous
              ? `Inspection lock outcome is unconfirmed: ${errorMessage(cause, 'canonical reread failed')}. Do not retry until canonical Inspection state has been checked.`
              : errorMessage(cause, 'Inspection could not be locked.'),
        );
      }
    } finally {
      finish();
    }
  }

  async function uploadSignatureBinary(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inspection.status !== 'locked') return;
    const formElement = event.currentTarget;
    const fileValue = new FormData(formElement).get('file');
    if (!(fileValue instanceof File) || fileValue.size === 0) {
      setError('Choose a non-empty signature file.');
      return;
    }
    if (fileValue.size > MAX_BINARY_BYTES) {
      setError('Signature files are currently limited to 16 MiB.');
      return;
    }
    if (!begin('signature-upload', { allowDirty: true })) return;

    const fingerprint = fileFingerprint(fileValue);
    const existingUpload = signatureUploadRef.current;
    const stable =
      existingUpload?.fingerprint === fingerprint
        ? existingUpload
        : { key: crypto.randomUUID(), fingerprint };
    signatureUploadRef.current = stable;
    const path = inspectionBinaryUploadPath(
      inspection.id,
      'signature',
      stable.key,
      fileValue.name,
    );

    try {
      let version: DocumentVersionResponse;
      try {
        version = await api.postBinary(
          path,
          fileValue,
          documentVersionResponseSchema,
        );
      } catch (cause) {
        if (!isAmbiguousWriteFailure(cause)) {
          signatureUploadRef.current = null;
          throw cause;
        }
        version = await api.postBinary(
          path,
          fileValue,
          documentVersionResponseSchema,
        );
      }

      assertFinalSignatureVersion(stable.key, fileValue, version);
      signatureUploadRef.current = null;
      if (mountedRef.current) {
        setSignatureVersion(version);
        formElement.reset();
        setSuccess(
          'Signature binary stored as one final Inspection-scoped DocumentVersion.',
        );
      }
    } catch (cause) {
      if (mountedRef.current) {
        const ambiguous = isAmbiguousWriteFailure(cause);
        if (!ambiguous) signatureUploadRef.current = null;
        setError(
          ambiguous
            ? `Signature upload outcome is still ambiguous: ${errorMessage(cause, 'request failed')}. Re-select the same file and retry; the stable upload key will be reused.`
            : errorMessage(cause, 'Signature binary could not be uploaded.'),
        );
      }
    } finally {
      finish();
    }
  }

  async function captureSignature(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inspection.status !== 'locked' || !signatureVersion) return;

    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const role = requiredString(form, 'signerRole');
    const partyId = requiredString(form, 'signerPartyId') || null;
    const signerName = requiredString(form, 'signerName');
    if ((role === 'landlord' || role === 'tenant') && partyId === null) {
      setError('Landlord and tenant signatures require an exact Party.');
      return;
    }

    const parsed = addInspectionSignatureRequestSchema.safeParse({
      signerRole: role,
      signerPartyId: partyId,
      signerName,
      signatureDocumentVersionId: signatureVersion.id,
    });
    if (!parsed.success) {
      setError(contractErrorMessage());
      return;
    }
    if (!begin('signature', { allowDirty: true })) return;

    const expected: InspectionSignatureRegistration = {
      inspectionId: inspection.id,
      signerRole: parsed.data.signerRole,
      signerPartyId: parsed.data.signerPartyId ?? null,
      signerName: parsed.data.signerName,
      signatureDocumentVersionId: parsed.data.signatureDocumentVersionId,
    };
    const preExistingIds = new Set(bundle.signatures.map((item) => item.id));
    let acknowledged = false;
    let ambiguous = false;

    try {
      let created: InspectionSignatureResponse;
      try {
        created = await api.post(
          inspectionSignaturesPath(inspection.id),
          parsed.data,
          inspectionSignatureResponseSchema,
        );
        acknowledged = true;
      } catch (cause) {
        if (!isAmbiguousWriteFailure(cause)) throw cause;
        ambiguous = true;
        const canonical = await readCanonical();
        const recovered = findRecoveredInspectionSignature(
          canonical,
          preExistingIds,
          expected,
        );
        applyCanonical(canonical);
        if (!recovered) {
          throw new Error(
            'Signature acknowledgement was lost and canonical state does not prove the exact new signature. Do not upload another binary; reload before retrying the relation.',
          );
        }
        if (mountedRef.current) {
          setSignatureVersion(null);
          formElement.reset();
          setSuccess('Signature relation recovered from canonical Inspection state.');
        }
        return;
      }

      assertInspectionSignature(expected, created);
      const canonical = await readCanonical();
      const persisted = canonical.signatures.find((item) => item.id === created.id);
      if (!persisted) {
        throw new Error('Signature response is missing from canonical Inspection state.');
      }
      assertInspectionSignature(expected, persisted);
      applyCanonical(canonical);
      if (mountedRef.current) {
        setSignatureVersion(null);
        formElement.reset();
        setSuccess('Signature captured against the exact final DocumentVersion.');
      }
    } catch (cause) {
      if (mountedRef.current) {
        setError(
          acknowledged
            ? `Signature was acknowledged, but canonical verification failed: ${errorMessage(cause, 'verification failed')}. Do not upload another binary; reload first.`
            : ambiguous
              ? `Signature outcome is unconfirmed: ${errorMessage(cause, 'canonical reread failed')}. Keep the existing signature binary and check canonical Inspection state before retrying the relation.`
              : errorMessage(cause, 'Signature could not be captured.'),
        );
      }
    } finally {
      finish();
    }
  }

  async function unlockInspection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inspection.status !== 'locked') return;
    const formElement = event.currentTarget;
    const parsed = unlockInspectionRequestSchema.safeParse({
      expectedVersion: inspection.version,
      reason: requiredString(new FormData(formElement), 'reason'),
    });
    if (!parsed.success) {
      setError(contractErrorMessage());
      return;
    }
    if (!begin('unlock', { allowDirty: true })) return;

    const before = inspection;
    let acknowledged = false;
    let ambiguous = false;
    try {
      try {
        const unlocked = await api.post(
          inspectionUnlockPath(before.id),
          parsed.data,
          inspectionResponseSchema,
        );
        acknowledged = true;
        assertInspectionUnlockTransition(before, unlocked);
      } catch (cause) {
        if (!isAmbiguousWriteFailure(cause)) throw cause;
        ambiguous = true;
      }

      const canonical = await readCanonical();
      assertInspectionUnlockTransition(before, canonical.inspection);
      if (canonical.signatures.some((signature) => signature.invalidatedAt === null)) {
        throw new Error('Unlock did not invalidate every active signature.');
      }
      applyCanonical(canonical);
      if (mountedRef.current) {
        formElement.reset();
        setSuccess(
          acknowledged
            ? 'Inspection unlocked; prior signatures were invalidated.'
            : 'Inspection unlock was recovered; prior signatures were invalidated.',
        );
      }
    } catch (cause) {
      if (mountedRef.current) {
        setError(
          acknowledged
            ? `Unlock was acknowledged, but canonical verification failed: ${errorMessage(cause, 'verification failed')}. Reload before retrying.`
            : ambiguous
              ? `Unlock outcome is unconfirmed: ${errorMessage(cause, 'canonical reread failed')}. Do not retry until canonical Inspection state and signature invalidation have been checked.`
              : errorMessage(cause, 'Inspection could not be unlocked.'),
        );
      }
    } finally {
      finish();
    }
  }

  async function finalizeInspection() {
    if (
      inspection.status !== 'locked' ||
      missingRoles.length > 0 ||
      !begin('finalize', { allowDirty: true })
    ) {
      return;
    }

    const before = inspection;
    let acknowledged = false;
    let ambiguous = false;
    try {
      try {
        const finalized = await api.post(
          inspectionFinalizePath(before.id),
          { expectedVersion: before.version },
          finalizeInspectionResponseSchema,
        );
        acknowledged = true;
        if (
          finalized.inspection.id !== before.id ||
          finalized.snapshot.inspectionId !== before.id ||
          finalized.snapshot.inspectionVersion !== before.version ||
          finalized.snapshot.contentRevision !== before.contentRevision
        ) {
          throw new Error(
            'Finalization response does not identify the locked source revision.',
          );
        }
      } catch (cause) {
        if (!isAmbiguousWriteFailure(cause)) throw cause;
        ambiguous = true;
      }

      const canonical = await readCanonical();
      assertInspectionFinalizeTransition(before, canonical);
      applyCanonical(canonical);
      if (mountedRef.current) {
        setSuccess(
          acknowledged
            ? 'Inspection finalized with one immutable canonical snapshot.'
            : 'Finalization was recovered from the immutable canonical snapshot.',
        );
      }
    } catch (cause) {
      if (mountedRef.current) {
        setError(
          acknowledged
            ? `Finalization was acknowledged, but canonical verification failed: ${errorMessage(cause, 'verification failed')}. Do not retry until canonical state has been checked.`
            : ambiguous
              ? `Finalization outcome is unconfirmed: ${errorMessage(cause, 'canonical reread failed')}. Do not retry until the immutable final snapshot has been checked.`
              : errorMessage(cause, 'Inspection could not be finalized.'),
        );
      }
    } finally {
      finish();
    }
  }

  async function generateFinalReport() {
    if (inspection.status !== 'finalized' || !begin('report', { allowDirty: true })) {
      return;
    }

    try {
      let version: DocumentVersionResponse;
      try {
        version = await api.post(
          inspectionFinalReportPath(inspection.id),
          {},
          documentVersionResponseSchema,
        );
      } catch (cause) {
        if (!isAmbiguousWriteFailure(cause)) throw cause;
        version = await api.post(
          inspectionFinalReportPath(inspection.id),
          {},
          documentVersionResponseSchema,
        );
      }
      assertFinalReportVersion(version);

      const canonical = await readCanonical();
      if (
        !canonical.evidence.some(
          (item) =>
            item.kind === 'final_report' &&
            item.documentVersionId === version.id &&
            item.sectionInstanceId === null &&
            item.sectionId === null &&
            item.itemId === null,
        )
      ) {
        throw new Error(
          'Generated final report is not registered as canonical final_report evidence.',
        );
      }
      applyCanonical(canonical);
      if (mountedRef.current) {
        setReportVersion(version);
        setSuccess('Final report generated/reused from the immutable snapshot.');
      }
    } catch (cause) {
      if (mountedRef.current) {
        setError(
          isAmbiguousWriteFailure(cause)
            ? `Final-report generation is idempotent, but the current outcome could not be confirmed: ${errorMessage(cause, 'request failed')}. Retrying the same command is safe.`
            : errorMessage(cause, 'Final report could not be generated.'),
        );
      }
    } finally {
      finish();
    }
  }

  const partyOptions = parties ?? [];
  const blocked = writeGate.pending;

  return (
    <div className="inspection-finalization-workspace">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Controlled lifecycle</p>
          <h3>Lock, signatures + final snapshot</h3>
        </div>
        <span className="section-note">
          lifecycle v{inspection.version} · content r{inspection.contentRevision}
        </span>
      </div>

      {error ? <p className="setup-form-error" role="alert">{error}</p> : null}
      {success ? (
        <p className="setup-form-success" aria-live="polite">{success}</p>
      ) : null}

      {inspection.status === 'in_progress' ? (
        <div className="inspection-finalization-card">
          <div>
            <strong>Freeze field content</strong>
            <p className="muted">
              Lock validates required responses with lifecycle + content-revision CAS.
            </p>
          </div>
          <button
            className="button-primary"
            disabled={blocked || blockedByDirtySection}
            onClick={lockInspection}
            type="button"
          >
            {pendingAction === 'lock' ? 'Locking…' : 'Lock Inspection'}
          </button>
        </div>
      ) : null}

      {inspection.status === 'locked' ? (
        <div className="inspection-finalization-grid">
          <div className="inspection-finalization-card">
            <strong>Required signatures</strong>
            {bundle.schema.requiredSignatureRoles.length === 0 ? (
              <p className="muted">This schema requires no signatures.</p>
            ) : (
              <ul className="inspection-content-list">
                {bundle.schema.requiredSignatureRoles.map((role) => {
                  const signed = active.some((item) => item.signerRole === role);
                  return (
                    <li key={role}>
                      <strong>{formatDetailKey(role)}</strong>
                      <small>{signed ? 'active signature present' : 'missing'}</small>
                    </li>
                  );
                })}
              </ul>
            )}
            {bundle.signatures.length > 0 ? (
              <>
                <strong>Signature history</strong>
                <ul className="inspection-content-list">
                  {bundle.signatures.map((signature) => (
                    <li key={signature.id}>
                      <strong>
                        {formatDetailKey(signature.signerRole)} · {signature.signerName}
                      </strong>
                      <small>
                        {signature.invalidatedAt === null
                          ? 'active'
                          : `invalidated · ${signature.invalidationReason ?? 'no reason'}`}
                      </small>
                      <small>
                        {signature.invalidatedAt === null
                          ? `Signed ${formatSwissDateTime(signature.signedAt)}`
                          : `Invalidated ${formatSwissDateTime(signature.invalidatedAt)}`}
                      </small>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </div>

          <form
            className="inspection-finalization-card setup-form"
            data-inspection-finalization-form="signature-upload"
            onSubmit={uploadSignatureBinary}
          >
            <div className="tenancy-form-heading">
              <strong>1 · Capture signature binary</strong>
              <span>Inspection-scoped · auto-finalized</span>
            </div>
            <label>
              Signature file
              <input disabled={blocked} name="file" required type="file" />
            </label>
            <p className="setup-hint">
              Field inspectors can upload only through this Inspection-scoped route.
            </p>
            <button className="button-primary" disabled={blocked} type="submit">
              {pendingAction === 'signature-upload'
                ? 'Uploading…'
                : 'Upload signature version'}
            </button>
            {signatureVersion ? (
              <div className="document-version-box">
                <span>Exact final signature version</span>
                <strong>
                  v{signatureVersion.versionNumber} · {signatureVersion.fileName}
                </strong>
                <DocumentBinaryActions
                  api={api}
                  fileName={signatureVersion.fileName}
                  mimeType={signatureVersion.mimeType}
                  versionId={signatureVersion.id}
                />
              </div>
            ) : null}
          </form>

          <form
            className="inspection-finalization-card setup-form"
            data-inspection-finalization-form="signature"
            onSubmit={captureSignature}
          >
            <div className="tenancy-form-heading">
              <strong>2 · Record signer</strong>
              <span>Relation to the exact final version</span>
            </div>
            <label>
              Role
              <select disabled={blocked} defaultValue="tenant" name="signerRole">
                <option value="landlord">Landlord</option>
                <option value="tenant">Tenant</option>
                <option value="witness">Witness</option>
                <option value="agent">Agent</option>
              </select>
            </label>
            <label>
              Party
              <select disabled={blocked || parties === null} defaultValue="" name="signerPartyId">
                <option value="">No Party (witness/agent only)</option>
                {partyOptions.map((party) => (
                  <option key={party.id} value={party.id}>
                    {party.displayName} · {party.code}
                  </option>
                ))}
              </select>
            </label>
            {partiesError ? <p className="form-error">{partiesError}</p> : null}
            <label>
              Signer name snapshot
              <input disabled={blocked} name="signerName" required />
            </label>
            <button
              className="button-primary"
              disabled={blocked || signatureVersion === null}
              type="submit"
            >
              {pendingAction === 'signature' ? 'Recording…' : 'Record signature'}
            </button>
          </form>

          <form
            className="inspection-finalization-card setup-form"
            data-inspection-finalization-form="unlock"
            onSubmit={unlockInspection}
          >
            <div className="tenancy-form-heading">
              <strong>Controlled unlock</strong>
              <span>Admin/manager · invalidates active signatures</span>
            </div>
            <label>
              Reason
              <textarea disabled={blocked} name="reason" required rows={3} />
            </label>
            <button className="button-secondary" disabled={blocked} type="submit">
              {pendingAction === 'unlock' ? 'Unlocking…' : 'Unlock Inspection'}
            </button>
          </form>

          <div className="inspection-finalization-card">
            <strong>Finalize immutable snapshot</strong>
            <p className="muted">
              Snapshot freezes header, schema, responses, findings, exact evidence
              versions, signature history and unlock history.
            </p>
            {missingRoles.length > 0 ? (
              <p className="setup-hint">
                Missing: {missingRoles.map(formatDetailKey).join(', ')}
              </p>
            ) : null}
            <button
              className="button-primary"
              disabled={blocked || missingRoles.length > 0}
              onClick={finalizeInspection}
              type="button"
            >
              {pendingAction === 'finalize' ? 'Finalizing…' : 'Finalize Inspection'}
            </button>
          </div>
        </div>
      ) : null}

      {inspection.status === 'finalized' ? (
        <div className="inspection-finalization-grid">
          <div className="inspection-finalization-card">
            <strong>Immutable final snapshot</strong>
            {bundle.finalSnapshot ? (
              <>
                <span>Snapshot v{bundle.finalSnapshot.snapshotVersion}</span>
                <small>
                  source lifecycle v{bundle.finalSnapshot.inspectionVersion} ·
                  content r{bundle.finalSnapshot.contentRevision}
                </small>
                <small>{formatSwissDateTime(bundle.finalSnapshot.createdAt)}</small>
              </>
            ) : (
              <p className="form-error">
                Finalized Inspection is missing its canonical snapshot.
              </p>
            )}
          </div>
          <div className="inspection-finalization-card">
            <strong>Final report</strong>
            <p className="muted">
              Generation is idempotent and always renders from the immutable snapshot.
            </p>
            <button
              className="button-primary"
              disabled={blocked || bundle.finalSnapshot === null}
              onClick={generateFinalReport}
              type="button"
            >
              {pendingAction === 'report'
                ? 'Generating…'
                : 'Generate / reuse final report'}
            </button>
            {reportVersion ? (
              <div className="document-version-box">
                <span>Canonical final report</span>
                <strong>{reportVersion.fileName}</strong>
                <DocumentBinaryActions
                  api={api}
                  fileName={reportVersion.fileName}
                  mimeType={reportVersion.mimeType}
                  versionId={reportVersion.id}
                />
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {inspection.status === 'cancelled' ? (
        <p className="muted">Cancelled Inspections have no finalization workflow.</p>
      ) : null}

      {blockedByDirtySection && inspection.status === 'in_progress' ? (
        <p className="setup-hint">
          Save or discard the current section before locking the Inspection.
        </p>
      ) : null}
    </div>
  );
}
