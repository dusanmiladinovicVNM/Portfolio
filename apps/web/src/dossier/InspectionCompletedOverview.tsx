import type { InspectionBundleResponse } from '@portfolio/contracts';
import {
  formatDetailKey,
  formatSwissDateTime,
} from '../presentation/format.js';
import { buildInspectionPreLockReview } from './inspection-pre-lock-review.js';

interface InspectionCompletedOverviewProps {
  readonly bundle: InspectionBundleResponse;
}

export function InspectionCompletedOverview({
  bundle,
}: InspectionCompletedOverviewProps) {
  if (bundle.inspection.status !== 'finalized') return null;

  const review = buildInspectionPreLockReview(bundle);
  const activeSignatures = bundle.signatures.filter(
    (signature) => signature.invalidatedAt === null,
  );
  const invalidatedSignatures = bundle.signatures.filter(
    (signature) => signature.invalidatedAt !== null,
  );
  const finalReportRegistered = bundle.evidence.some(
    (evidence) =>
      evidence.kind === 'final_report' &&
      evidence.sectionInstanceId === null &&
      evidence.sectionId === null &&
      evidence.itemId === null,
  );

  return (
    <section
      className="inspection-completed-overview"
      data-inspection-completed-overview
    >
      <div className="inspection-completed-hero">
        <div>
          <p className="eyebrow">Completed</p>
          <h3>Final Inspection record</h3>
          <p>
            This Inspection is finalized and read-only. The content below is the
            canonical record identified by the immutable final snapshot.
          </p>
        </div>
        {bundle.finalSnapshot ? (
          <div className="inspection-completed-snapshot-proof">
            <strong>Snapshot v{bundle.finalSnapshot.snapshotVersion}</strong>
            <span>{formatSwissDateTime(bundle.finalSnapshot.createdAt)}</span>
            <small>
              source lifecycle v{bundle.finalSnapshot.inspectionVersion} · content
              r{bundle.finalSnapshot.contentRevision}
            </small>
          </div>
        ) : (
          <p className="form-error">
            Finalized Inspection is missing its canonical snapshot metadata.
          </p>
        )}
      </div>

      <div className="inspection-completed-summary">
        <div>
          <span>Required responses</span>
          <strong>
            {review.requiredAnswered}/{review.requiredTotal}
          </strong>
          <small>{review.complete ? 'Complete' : 'Canonical mismatch'}</small>
        </div>
        <div>
          <span>Findings</span>
          <strong>{review.findingsTotal}</strong>
          <small>Final canonical record</small>
        </div>
        <div>
          <span>Evidence</span>
          <strong>{review.evidenceTotal}</strong>
          <small>Excludes final report</small>
        </div>
        <div>
          <span>Active signatures</span>
          <strong>{activeSignatures.length}</strong>
          <small>{invalidatedSignatures.length} invalidated in history</small>
        </div>
        <div>
          <span>Final report</span>
          <strong>{finalReportRegistered ? 'Ready' : 'Not generated'}</strong>
          <small>Generated from immutable snapshot</small>
        </div>
      </div>

      <div className="inspection-completed-sections">
        {review.sections.map((section) => (
          <details
            className="inspection-completed-section"
            data-inspection-completed-section={section.sectionInstanceId}
            key={section.sectionInstanceId}
          >
            <summary>
              <span>
                <strong>{section.title}</strong>
                {section.scope === 'space' ? (
                  <small>
                    {section.sectionTitle}
                    {section.spaceCode ? ` · ${section.spaceCode}` : ''}
                  </small>
                ) : null}
              </span>
              <span>
                {section.requiredAnswered}/{section.requiredTotal} required ·{' '}
                {section.findings.length} findings · {section.evidence.length} evidence
              </span>
            </summary>
            <div className="inspection-completed-section-body">
              <div className="inspection-completed-items">
                {section.items.map((item) => (
                  <div className="inspection-completed-item" key={item.itemId}>
                    <div>
                      <strong>{item.label}</strong>
                      <small>{formatDetailKey(item.type)}</small>
                    </div>
                    <p>{item.answer ?? '—'}</p>
                    {item.comment ? <small>{item.comment}</small> : null}
                  </div>
                ))}
              </div>

              {section.findings.length > 0 ? (
                <div className="inspection-completed-subsection">
                  <strong>Findings</strong>
                  <ul className="inspection-content-list">
                    {section.findings.map((finding) => (
                      <li key={finding.id}>
                        <strong>{finding.title}</strong>
                        <small>
                          {formatDetailKey(finding.severity)}
                          {finding.description ? ` · ${finding.description}` : ''}
                        </small>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {section.evidence.length > 0 ? (
                <div className="inspection-completed-subsection">
                  <strong>Evidence</strong>
                  <span>
                    {section.evidence.length} canonical attachment
                    {section.evidence.length === 1 ? '' : 's'}
                  </span>
                </div>
              ) : null}
            </div>
          </details>
        ))}
      </div>

      {review.generalEvidence.length > 0 ? (
        <div className="inspection-completed-general-evidence">
          <strong>Inspection-level Evidence</strong>
          <span>
            {review.generalEvidence.length} canonical attachment
            {review.generalEvidence.length === 1 ? '' : 's'}
          </span>
        </div>
      ) : null}

      <details className="inspection-completed-signatures">
        <summary>
          Signatures · {activeSignatures.length} active
          {invalidatedSignatures.length > 0
            ? ` · ${invalidatedSignatures.length} invalidated`
            : ''}
        </summary>
        <ul className="inspection-content-list">
          {bundle.signatures.map((signature) => (
            <li key={signature.id}>
              <strong>
                {formatDetailKey(signature.signerRole)} · {signature.signerName}
              </strong>
              <small>
                {signature.invalidatedAt === null
                  ? `Signed ${formatSwissDateTime(signature.signedAt)}`
                  : `Invalidated ${formatSwissDateTime(signature.invalidatedAt)} · ${signature.invalidationReason ?? 'no reason'}`}
              </small>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
