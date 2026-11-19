import type {
  InspectionBundleResponse,
  InspectionEvidenceResponse,
} from '@portfolio/contracts';
import { useEffect, useRef, useState } from 'react';
import type { PortfolioApi } from '../api/portfolio-api.js';
import { formatDetailKey } from '../presentation/format.js';
import { InspectionEvidenceBinaryPreview } from './InspectionEvidenceBinaryPreview.js';

type SectionInstance = InspectionBundleResponse['sectionInstances'][number];

interface InspectionEvidenceOverviewProps {
  readonly api: PortfolioApi;
  readonly active: boolean;
  readonly bundle: InspectionBundleResponse;
  readonly orderedSectionInstances: readonly SectionInstance[];
  readonly selectedSectionInstanceId: string | null;
  readonly navigationBlocked: boolean;
  readonly onOpenRoom: (sectionInstanceId: string) => void;
}

function evidenceKindLabel(kind: InspectionEvidenceResponse['kind']): string {
  if (kind === 'photo') return 'Foto';
  if (kind === 'attachment') return 'Anhang';
  return formatDetailKey(kind);
}

function EvidenceItems({
  items,
  bundle,
  sectionId,
  onPreview,
}: {
  readonly items: readonly InspectionEvidenceResponse[];
  readonly bundle: InspectionBundleResponse;
  readonly sectionId: string | null;
  readonly onPreview: (evidence: InspectionEvidenceResponse, trigger: HTMLButtonElement) => void;
}) {
  if (items.length === 0) {
    return <p className="muted">Noch keine verknüpften Nachweise.</p>;
  }
  const section = sectionId
    ? bundle.schema.sections.find((entry) => entry.id === sectionId)
    : null;
  return (
    <ul className="inspection-content-list">
      {items.map((item) => {
        const itemLabel =
          item.itemId && section
            ? section.items.find((entry) => entry.id === item.itemId)?.label ?? null
            : null;
        return (
          <li key={item.id}>
            <strong>{evidenceKindLabel(item.kind)}</strong>
            <span>{item.caption ?? 'Ohne Beschriftung'}</span>
            {itemLabel ? <small>{itemLabel}</small> : null}
            <small>Exakte Dokumentversion verknüpft</small>
            <button
              className="button-secondary"
              data-inspection-evidence-preview-open={item.id}
              onClick={(event) => onPreview(item, event.currentTarget)}
              type="button"
            >
              Foto ansehen / Datei öffnen
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The overview reads ONLY the already owner-validated canonical Inspection
 * bundle. It must not fetch the global Documents catalog or infer that an
 * uploaded-but-unlinked binary is an Inspection relation.
 */
export function InspectionEvidenceOverview({
  api,
  active,
  bundle,
  orderedSectionInstances,
  selectedSectionInstanceId,
  navigationBlocked,
  onOpenRoom,
}: InspectionEvidenceOverviewProps) {
  const [previewSelection, setPreviewSelection] = useState<{
    readonly inspectionId: string;
    readonly evidenceId: string;
    readonly versionId: string;
  } | null>(null);
  const lastPreviewTriggerRef = useRef<HTMLButtonElement | null>(null);

  // Do not retain private decoded bytes while the phase is hidden.
  useEffect(() => {
    if (!active) setPreviewSelection(null);
  }, [active, bundle.inspection.id]);

  const selectedRelation =
    active && previewSelection?.inspectionId === bundle.inspection.id
      ? bundle.evidence.find(
          (item) =>
            item.id === previewSelection.evidenceId &&
            item.documentVersionId === previewSelection.versionId &&
            item.inspectionId === bundle.inspection.id &&
            item.kind !== 'final_report',
        ) ?? null
      : null;

  function openEvidencePreview(
    evidence: InspectionEvidenceResponse,
    trigger: HTMLButtonElement,
  ) {
    if (!active || evidence.inspectionId !== bundle.inspection.id) return;
    lastPreviewTriggerRef.current = trigger;
    setPreviewSelection({
      inspectionId: evidence.inspectionId,
      evidenceId: evidence.id,
      versionId: evidence.documentVersionId,
    });
  }

  function closeEvidencePreview() {
    setPreviewSelection(null);
    const trigger = lastPreviewTriggerRef.current;
    // Restore focus only for an explicit operator close, not on canonical
    // refresh, phase changes, or the next Inspection becoming active.
    window.requestAnimationFrame(() => {
      if (trigger?.isConnected && active) trigger.focus();
    });
  }

  const attached = bundle.evidence.filter((item) => item.kind !== 'final_report');
  const inspectionLevel = attached.filter((item) => item.sectionInstanceId === null);
  const roomIds = new Set(orderedSectionInstances.map((item) => item.id));
  const unresolvedOwnerCount = attached.filter(
    (item) => item.sectionInstanceId !== null && !roomIds.has(item.sectionInstanceId),
  ).length;
  const coveredRooms = orderedSectionInstances.filter((instance) =>
    attached.some((item) => item.sectionInstanceId === instance.id),
  ).length;

  return (
    <section
      aria-label="Nachweise aus allen Räumen"
      className="inspection-evidence-overview"
      data-inspection-evidence-overview
    >
      <div className="inspection-evidence-overview-heading">
        <div>
          <p className="eyebrow">Übersicht</p>
          <h4>Nachweise der gesamten Inspektion</h4>
          <p className="muted">
            Nur kanonisch verknüpfte Nachweise. Hochgeladene, noch nicht
            zugeordnete Dateien werden im jeweiligen Raum wiederhergestellt.
          </p>
        </div>
        <strong data-inspection-evidence-overview-total>
          {attached.length} verknüpft · {coveredRooms}/{orderedSectionInstances.length} Räume
        </strong>
      </div>
      {unresolvedOwnerCount > 0 ? (
        <p role="alert" className="form-error">
          {unresolvedOwnerCount} Nachweis(e) mit nicht auflösbarer
          Raumzuordnung. Die Zuordnung muss kanonisch geprüft werden.
        </p>
      ) : null}
      <div className="inspection-evidence-overview-grid">
        <div
          className="inspection-evidence-overview-room"
          data-inspection-evidence-overview-room="inspection"
        >
          <div className="inspection-evidence-overview-room-heading">
            <strong>Gesamte Inspektion</strong>
            <span>{inspectionLevel.length} Nachweis(e)</span>
          </div>
          <EvidenceItems
            bundle={bundle}
            items={inspectionLevel}
            onPreview={openEvidencePreview}
            sectionId={null}
          />
        </div>
        {orderedSectionInstances.map((instance) => {
          const section = bundle.schema.sections.find(
            (entry) => entry.id === instance.sectionId,
          );
          const label =
            instance.scope === 'space'
              ? instance.spaceName ?? instance.spaceCode ?? section?.title ?? 'Raum'
              : section?.title ?? 'Abschnitt';
          const roomEvidence = attached.filter(
            (item) => item.sectionInstanceId === instance.id,
          );
          const isSelected = selectedSectionInstanceId === instance.id;
          return (
            <div
              className="inspection-evidence-overview-room"
              data-inspection-evidence-overview-room={instance.id}
              key={instance.id}
            >
              <div className="inspection-evidence-overview-room-heading">
                <div>
                  <strong>{label}</strong>
                  {isSelected ? (
                    <small className="inspection-evidence-overview-selected">
                      Aktuell ausgewählt
                    </small>
                  ) : null}
                </div>
                <span>{roomEvidence.length} Nachweis(e)</span>
              </div>
              <EvidenceItems
                bundle={bundle}
                items={roomEvidence}
                onPreview={openEvidencePreview}
                sectionId={instance.sectionId}
              />
              <button
                className="button-secondary"
                data-inspection-evidence-open-room={instance.id}
                disabled={navigationBlocked || bundle.inspection.status !== 'in_progress'}
                onClick={() => onOpenRoom(instance.id)}
                type="button"
              >
                {isSelected ? 'Nachweise in diesem Raum bearbeiten' : 'Zum Raum und Nachweisen'}
              </button>
            </div>
          );
        })}
      </div>
      {selectedRelation ? (
        <InspectionEvidenceBinaryPreview
          api={api}
          caption={selectedRelation.caption}
          documentVersionId={selectedRelation.documentVersionId}
          key={selectedRelation.id}
          onClose={closeEvidencePreview}
        />
      ) : null}
    </section>
  );
}
