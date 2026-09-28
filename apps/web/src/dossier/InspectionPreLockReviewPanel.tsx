import { formatDetailKey } from '../presentation/format.js';
import type { InspectionPreLockReview } from './inspection-pre-lock-review.js';

interface InspectionPreLockReviewProps {
  readonly review: InspectionPreLockReview;
  readonly stale: boolean;
  readonly onFixSectionInstance: (sectionInstanceId: string) => void;
}

function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function InspectionPreLockReviewPanel({
  review,
  stale,
  onFixSectionInstance,
}: InspectionPreLockReviewProps) {
  const missingSections = review.sections.filter(
    (section) => section.missingRequired > 0,
  );

  return (
    <div
      className={`inspection-pre-lock-review ${stale ? 'inspection-pre-lock-review-stale' : ''}`}
      data-inspection-pre-lock-review
    >
      <div className="inspection-pre-lock-summary">
        <div>
          <span>Required responses</span>
          <strong>
            {review.requiredAnswered} / {review.requiredTotal}
          </strong>
          <small>
            {review.complete
              ? 'Canonical required responses complete'
              : countLabel(
                  review.missingRequired,
                  'required response missing',
                  'required responses missing',
                )}
          </small>
        </div>
        <div>
          <span>Findings</span>
          <strong>{review.findingsTotal}</strong>
          <small>Across all SectionInstances</small>
        </div>
        <div>
          <span>Evidence</span>
          <strong>{review.evidenceTotal}</strong>
          <small>Exact canonical evidence relations</small>
        </div>
        <div>
          <span>Review source</span>
          <strong>r{review.contentRevision}</strong>
          <small>Lifecycle v{review.inspectionVersion}</small>
        </div>
      </div>

      {stale ? (
        <p className="inspection-review-warning" role="alert">
          Inspection content changed after this review was loaded. Refresh the
          review before locking.
        </p>
      ) : null}

      {!review.complete ? (
        <section
          className="inspection-review-missing-summary"
          data-inspection-review-missing-summary
        >
          <div>
            <strong>
              {countLabel(
                review.missingRequired,
                'required response needs attention',
                'required responses need attention',
              )}
            </strong>
            <p>
              This summary comes from the fresh canonical pre-lock reread.
              Open the exact SectionInstance below to fix missing responses.
            </p>
          </div>
          <div className="inspection-review-missing-actions">
            {missingSections.map((section) => (
              <button
                className="button-secondary inspection-review-fix-button"
                data-inspection-review-fix-section={section.sectionInstanceId}
                disabled={stale}
                key={section.sectionInstanceId}
                onClick={() =>
                  onFixSectionInstance(section.sectionInstanceId)
                }
                type="button"
              >
                Fix {section.title} · {section.missingRequired} missing
              </button>
            ))}
          </div>
        </section>
      ) : (
        <p className="inspection-review-ready" role="status">
          Canonical review is complete. The Inspection is ready for the lock
          confirmation below.
        </p>
      )}

      {review.generalEvidence.length > 0 ? (
        <section className="inspection-review-general-evidence">
          <strong>Inspection-wide evidence</strong>
          <ul className="inspection-content-list">
            {review.generalEvidence.map((evidence) => (
              <li key={evidence.id}>
                <strong>{formatDetailKey(evidence.kind)}</strong>
                <small>
                  {evidence.caption ?? 'No caption'} · exact document version
                </small>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="inspection-review-sections">
        {review.sections.map((section) => (
          <section
            className={`inspection-review-section ${section.missingRequired > 0 ? 'inspection-review-section-missing' : ''}`}
            data-inspection-review-section={section.sectionInstanceId}
            key={section.sectionInstanceId}
          >
            <div className="inspection-review-section-heading">
              <div>
                <strong>{section.title}</strong>
                {section.scope === 'space' ? (
                  <small>
                    {section.sectionTitle}
                    {section.spaceCode ? ` · ${section.spaceCode}` : ''}
                  </small>
                ) : null}
              </div>
              <div className="inspection-review-section-status">
                <span>
                  {section.requiredAnswered}/{section.requiredTotal} required
                </span>
                {section.missingRequired > 0 ? (
                  <button
                    className="button-secondary inspection-review-fix-button"
                    data-inspection-review-fix-section={section.sectionInstanceId}
                    disabled={stale}
                    onClick={() =>
                      onFixSectionInstance(section.sectionInstanceId)
                    }
                    type="button"
                  >
                    Fix missing
                  </button>
                ) : null}
              </div>
            </div>

            <div className="inspection-review-items">
              {section.items.length === 0 ? (
                <p className="muted">No visible or saved responses.</p>
              ) : (
                section.items.map((item) => (
                  <div
                    className={`inspection-review-item ${item.missingRequired ? 'inspection-review-item-missing' : ''} ${!item.visible ? 'inspection-review-item-hidden' : ''}`}
                    key={item.itemId}
                  >
                    <div className="inspection-review-item-heading">
                      <strong>
                        {item.label}
                        {item.required ? ' *' : ''}
                      </strong>
                      <small>
                        {formatDetailKey(item.type)}
                        {!item.visible ? ' · currently hidden' : ''}
                      </small>
                    </div>
                    <p>
                      {item.hasResponse
                        ? item.answer === '' || item.answer === null
                          ? 'Saved blank value'
                          : item.answer
                        : item.missingRequired
                          ? 'Missing required response'
                          : 'No saved response'}
                    </p>
                    {item.comment ? (
                      <small className="inspection-review-comment">
                        Comment: {item.comment}
                      </small>
                    ) : null}
                  </div>
                ))
              )}
            </div>

            {section.findings.length > 0 ? (
              <div className="inspection-review-subsection">
                <strong>
                  {countLabel(
                    section.findings.length,
                    'Finding',
                    'Findings',
                  )}
                </strong>
                <ul className="inspection-content-list">
                  {section.findings.map((finding) => (
                    <li key={finding.id}>
                      <strong>
                        {formatDetailKey(finding.severity)} · {finding.title}
                      </strong>
                      {finding.description ? (
                        <small>{finding.description}</small>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {section.evidence.length > 0 ? (
              <div className="inspection-review-subsection">
                <strong>
                  {countLabel(
                    section.evidence.length,
                    'Evidence item',
                    'Evidence items',
                  )}
                </strong>
                <ul className="inspection-content-list">
                  {section.evidence.map((evidence) => (
                    <li key={evidence.id}>
                      <strong>{formatDetailKey(evidence.kind)}</strong>
                      <small>
                        {evidence.caption ?? 'No caption'} · exact document
                        version
                      </small>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>
        ))}
      </div>
    </div>
  );
}
