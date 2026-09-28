import type { InspectionResponseDto } from '@portfolio/contracts';

export const INSPECTION_WORKFLOW_STEPS = [
  { id: 'setup', label: 'Setup' },
  { id: 'inspect', label: 'Inspect' },
  { id: 'review', label: 'Review' },
  { id: 'sign', label: 'Sign' },
  { id: 'complete', label: 'Complete' },
] as const;

export type InspectionWorkflowStepId =
  (typeof INSPECTION_WORKFLOW_STEPS)[number]['id'];
export type InspectionWorkflowStepState =
  | 'complete'
  | 'current'
  | 'upcoming';

export interface InspectionWorkflowStep {
  readonly id: InspectionWorkflowStepId;
  readonly label: string;
  readonly state: InspectionWorkflowStepState;
}

export function inspectionWorkflowCurrentStep(
  status: InspectionResponseDto['status'],
  requiredResponsesComplete: boolean,
): InspectionWorkflowStepId | null {
  if (status === 'cancelled') return null;
  if (status === 'draft') return 'setup';
  if (status === 'in_progress') {
    return requiredResponsesComplete ? 'review' : 'inspect';
  }
  if (status === 'locked') return 'sign';
  return 'complete';
}

/**
 * Presentation-only projection of the canonical lifecycle.
 *
 * "Review" is not a persisted Inspection status. It becomes the current UX
 * step once canonical required responses are complete while the Inspection is
 * still in_progress. No domain transition is introduced here.
 */
export function inspectionWorkflowSteps(
  status: InspectionResponseDto['status'],
  requiredResponsesComplete: boolean,
): readonly InspectionWorkflowStep[] {
  const current = inspectionWorkflowCurrentStep(
    status,
    requiredResponsesComplete,
  );
  const currentIndex = current
    ? INSPECTION_WORKFLOW_STEPS.findIndex((step) => step.id === current)
    : -1;

  return INSPECTION_WORKFLOW_STEPS.map((step, index) => ({
    ...step,
    state:
      currentIndex < 0
        ? 'upcoming'
        : index < currentIndex
          ? 'complete'
          : index === currentIndex
            ? 'current'
            : 'upcoming',
  }));
}
