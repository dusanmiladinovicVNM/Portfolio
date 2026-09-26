import type {
  InspectionBundleResponse,
  InspectionFindingResponse,
  InspectionItemResponse,
  InspectionEvidenceResponse,
} from '@portfolio/contracts';
import { evaluateInspectionCondition } from '@portfolio/domain';
import {
  buildInspectionRequiredProgress,
  inspectionValuesByFieldKey,
} from './inspection-progress.js';

type SchemaSection = InspectionBundleResponse['schema']['sections'][number];
type SchemaItem = SchemaSection['items'][number];
type SectionInstance = InspectionBundleResponse['sectionInstances'][number];

export interface InspectionPreLockReviewItem {
  readonly itemId: string;
  readonly label: string;
  readonly type: SchemaItem['type'];
  readonly visible: boolean;
  readonly required: boolean;
  readonly missingRequired: boolean;
  readonly hasResponse: boolean;
  readonly answer: string | null;
  readonly comment: string | null;
}

export interface InspectionPreLockReviewSection {
  readonly sectionInstanceId: string;
  readonly sectionId: string;
  readonly title: string;
  readonly sectionTitle: string;
  readonly spaceCode: string | null;
  readonly scope: SectionInstance['scope'];
  readonly requiredTotal: number;
  readonly requiredAnswered: number;
  readonly missingRequired: number;
  readonly items: readonly InspectionPreLockReviewItem[];
  readonly findings: readonly InspectionFindingResponse[];
  readonly evidence: readonly InspectionEvidenceResponse[];
}

export interface InspectionPreLockReview {
  readonly inspectionId: string;
  readonly inspectionVersion: number;
  readonly contentRevision: number;
  readonly schemaVersionId: string;
  readonly requiredTotal: number;
  readonly requiredAnswered: number;
  readonly missingRequired: number;
  readonly complete: boolean;
  readonly findingsTotal: number;
  readonly evidenceTotal: number;
  readonly generalEvidence: readonly InspectionEvidenceResponse[];
  readonly sections: readonly InspectionPreLockReviewSection[];
}

function sectionTitle(
  section: SchemaSection,
  instance: SectionInstance,
): string {
  return instance.scope === 'space'
    ? instance.spaceName ?? instance.spaceCode ?? section.title
    : section.title;
}

function responseForItem(
  responses: readonly InspectionItemResponse[],
  instanceId: string,
  itemId: string,
): InspectionItemResponse | null {
  return (
    responses.find(
      (response) =>
        response.sectionInstanceId === instanceId &&
        response.itemId === itemId,
    ) ?? null
  );
}

function optionLabel(item: SchemaItem, value: string): string {
  return item.options.find((option) => option.value === value)?.label ?? value;
}

export function formatInspectionReviewAnswer(
  item: SchemaItem,
  response: InspectionItemResponse | null,
): string | null {
  if (!response) return null;
  const value = response.value;
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) {
    return value.map((entry) => optionLabel(item, entry)).join(', ');
  }
  if (
    item.type === 'select' ||
    item.type === 'radio'
  ) {
    return optionLabel(item, value);
  }
  return value;
}

function orderedSectionInstances(
  bundle: InspectionBundleResponse,
): readonly SectionInstance[] {
  const sectionById = new Map(
    bundle.schema.sections.map((section) => [section.id, section] as const),
  );
  return [...bundle.sectionInstances].sort((left, right) => {
    const leftSection = sectionById.get(left.sectionId);
    const rightSection = sectionById.get(right.sectionId);
    return (
      (leftSection?.sortOrder ?? 0) - (rightSection?.sortOrder ?? 0) ||
      (left.spaceSortOrder ?? -1) - (right.spaceSortOrder ?? -1) ||
      (left.spaceName ?? '').localeCompare(right.spaceName ?? '') ||
      left.id.localeCompare(right.id)
    );
  });
}

export function buildInspectionPreLockReview(
  bundle: InspectionBundleResponse,
): InspectionPreLockReview {
  const progress = buildInspectionRequiredProgress(bundle);
  const progressByInstance = new Map(
    progress.sections.map((section) => [
      section.sectionInstanceId,
      section,
    ] as const),
  );
  const sectionById = new Map(
    bundle.schema.sections.map((section) => [section.id, section] as const),
  );

  const sections = orderedSectionInstances(bundle).map((instance) => {
    const section = sectionById.get(instance.sectionId);
    if (!section) {
      throw new Error(
        'Inspection review cannot resolve a SectionInstance schema owner.',
      );
    }
    const values = inspectionValuesByFieldKey(bundle, instance);
    const sectionProgress = progressByInstance.get(instance.id);
    if (!sectionProgress) {
      throw new Error('Inspection review cannot resolve required progress.');
    }

    const items = [...section.items]
      .sort(
        (left, right) =>
          left.sortOrder - right.sortOrder || left.id.localeCompare(right.id),
      )
      .map((item) => {
        const response = responseForItem(
          bundle.responses,
          instance.id,
          item.id,
        );
        const visible =
          item.visibleWhen === null ||
          evaluateInspectionCondition(item.visibleWhen, values);
        const required =
          visible &&
          (item.required ||
            (item.requiredWhen !== null &&
              evaluateInspectionCondition(item.requiredWhen, values)));
        const missingRequired =
          sectionProgress.missingItemIds.includes(item.id);

        return {
          itemId: item.id,
          label: item.label,
          type: item.type,
          visible,
          required,
          missingRequired,
          hasResponse: response !== null,
          answer: formatInspectionReviewAnswer(item, response),
          comment: response?.comment ?? null,
        } satisfies InspectionPreLockReviewItem;
      })
      .filter((item) => item.visible || item.hasResponse);

    return {
      sectionInstanceId: instance.id,
      sectionId: section.id,
      title: sectionTitle(section, instance),
      sectionTitle: section.title,
      spaceCode: instance.spaceCode,
      scope: instance.scope,
      requiredTotal: sectionProgress.requiredTotal,
      requiredAnswered: sectionProgress.requiredAnswered,
      missingRequired: sectionProgress.missingRequired,
      items,
      findings: bundle.findings.filter(
        (finding) => finding.sectionInstanceId === instance.id,
      ),
      evidence: bundle.evidence.filter(
        (evidence) => evidence.sectionInstanceId === instance.id,
      ),
    } satisfies InspectionPreLockReviewSection;
  });

  return {
    inspectionId: bundle.inspection.id,
    inspectionVersion: bundle.inspection.version,
    contentRevision: bundle.inspection.contentRevision,
    schemaVersionId: bundle.inspection.schemaVersionId,
    requiredTotal: progress.requiredTotal,
    requiredAnswered: progress.requiredAnswered,
    missingRequired: progress.missingRequired,
    complete: progress.complete,
    findingsTotal: bundle.findings.length,
    evidenceTotal: bundle.evidence.filter(
      (evidence) => evidence.kind !== 'final_report',
    ).length,
    generalEvidence: bundle.evidence.filter(
      (evidence) =>
        evidence.kind !== 'final_report' &&
        evidence.sectionInstanceId === null,
    ),
    sections,
  };
}

export function sameInspectionPreLockReviewSource(
  current: InspectionBundleResponse,
  reviewed: InspectionBundleResponse,
): boolean {
  return (
    current.inspection.id === reviewed.inspection.id &&
    current.inspection.unitId === reviewed.inspection.unitId &&
    current.inspection.schemaVersionId === reviewed.inspection.schemaVersionId &&
    current.inspection.status === 'in_progress' &&
    reviewed.inspection.status === 'in_progress' &&
    current.inspection.version === reviewed.inspection.version &&
    current.inspection.contentRevision ===
      reviewed.inspection.contentRevision
  );
}
