import type { InspectionBundleResponse } from '@portfolio/contracts';
import {
  evaluateInspectionCondition,
  type InspectionAnswerValue,
} from '@portfolio/domain';

export type InspectionProgressSource = Pick<
  InspectionBundleResponse,
  'schema' | 'sectionInstances' | 'responses'
>;

type SectionInstance = InspectionProgressSource['sectionInstances'][number];

export interface InspectionSectionRequiredProgress {
  readonly sectionInstanceId: string;
  readonly requiredTotal: number;
  readonly requiredAnswered: number;
  readonly missingRequired: number;
  readonly missingItemIds: readonly string[];
  readonly complete: boolean;
}

export interface InspectionRequiredProgress {
  readonly requiredTotal: number;
  readonly requiredAnswered: number;
  readonly missingRequired: number;
  readonly complete: boolean;
  readonly sections: readonly InspectionSectionRequiredProgress[];
}

export function inspectionAnswerPresent(
  value: InspectionAnswerValue | undefined,
): boolean {
  if (value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'boolean') return true;
  return value.length > 0;
}

export function inspectionValuesByFieldKey(
  source: InspectionProgressSource,
  targetInstance: SectionInstance,
): ReadonlyMap<string, InspectionAnswerValue> {
  const sectionById = new Map(
    source.schema.sections.map((section) => [section.id, section] as const),
  );
  const itemById = new Map(
    source.schema.sections.flatMap((section) =>
      section.items.map((item) => [item.id, item] as const),
    ),
  );
  const instanceById = new Map(
    source.sectionInstances.map((instance) => [instance.id, instance] as const),
  );
  const values = new Map<string, InspectionAnswerValue>();

  for (const response of source.responses) {
    const sourceInstance = instanceById.get(response.sectionInstanceId);
    const item = itemById.get(response.itemId);
    if (!sourceInstance || !item) continue;
    if (sourceInstance.sectionId !== response.sectionId) continue;
    const sourceSection = sectionById.get(sourceInstance.sectionId);
    if (!sourceSection || item.sectionId !== sourceSection.id) continue;

    const sameInstance = sourceInstance.id === targetInstance.id;
    const unitContext = sourceInstance.scope === 'unit';
    const sameSpaceContext =
      targetInstance.spaceId !== null &&
      sourceInstance.spaceId === targetInstance.spaceId;

    if (sameInstance || unitContext || sameSpaceContext) {
      values.set(item.key.toLowerCase(), response.value);
    }
  }

  return values;
}

export function buildInspectionRequiredProgress(
  source: InspectionProgressSource,
): InspectionRequiredProgress {
  const sectionById = new Map(
    source.schema.sections.map((section) => [section.id, section] as const),
  );

  const sections = source.sectionInstances.map((instance) => {
    const section = sectionById.get(instance.sectionId);
    if (!section) {
      throw new Error(
        'Inspection progress cannot resolve a SectionInstance schema owner.',
      );
    }

    const valuesByFieldKey = inspectionValuesByFieldKey(source, instance);
    const missingItemIds: string[] = [];
    let requiredTotal = 0;
    let requiredAnswered = 0;

    for (const item of section.items) {
      const visible =
        item.visibleWhen === null ||
        evaluateInspectionCondition(item.visibleWhen, valuesByFieldKey);
      if (!visible) continue;

      const required =
        item.required ||
        (item.requiredWhen !== null &&
          evaluateInspectionCondition(item.requiredWhen, valuesByFieldKey));
      if (!required) continue;

      requiredTotal += 1;
      if (
        inspectionAnswerPresent(
          valuesByFieldKey.get(item.key.toLowerCase()),
        )
      ) {
        requiredAnswered += 1;
      } else {
        missingItemIds.push(item.id);
      }
    }

    return {
      sectionInstanceId: instance.id,
      requiredTotal,
      requiredAnswered,
      missingRequired: missingItemIds.length,
      missingItemIds,
      complete: missingItemIds.length === 0,
    } satisfies InspectionSectionRequiredProgress;
  });

  const requiredTotal = sections.reduce(
    (sum, section) => sum + section.requiredTotal,
    0,
  );
  const requiredAnswered = sections.reduce(
    (sum, section) => sum + section.requiredAnswered,
    0,
  );
  const missingRequired = requiredTotal - requiredAnswered;

  return {
    requiredTotal,
    requiredAnswered,
    missingRequired,
    complete: missingRequired === 0,
    sections,
  };
}
