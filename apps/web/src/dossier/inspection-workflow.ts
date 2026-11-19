import type { InspectionResponseDto } from '@portfolio/contracts';

/**
 * UI guidance, not a persisted lifecycle or an independent completion ledger.
 * These five phases are intentionally different from the canonical states.
 */
export const INSPECTION_WORKFLOW_STEPS = [
  { id: 'setup', label: 'Vorbereitung' },
  { id: 'inspect', label: 'Räume prüfen' },
  { id: 'evidence', label: 'Fotos und Nachweise' },
  { id: 'review_sign', label: 'Prüfen und unterschreiben' },
  { id: 'report', label: 'Bericht' },
] as const;

export type InspectionWorkflowStepId =
  (typeof INSPECTION_WORKFLOW_STEPS)[number]['id'];
export type InspectionWorkflowStepState =
  | 'previous'
  | 'current'
  | 'upcoming';

export interface InspectionWorkflowStep {
  readonly id: InspectionWorkflowStepId;
  readonly label: string;
  /** "Previous" does NOT mean completed or canonically approved. */
  readonly state: InspectionWorkflowStepState;
  /** Can open a currently mounted, read-only-or-allowed task surface. */
  readonly available: boolean;
}

/**
 * Lifecycle gives only a safe default phase. Required responses becoming
 * complete does not certify Evidence review or authorize a lock/sign/finalize.
 */
export function inspectionWorkflowCurrentStep(
  status: InspectionResponseDto['status'],
): InspectionWorkflowStepId | null {
  switch (status) {
    case 'draft':
      return 'setup';
    case 'in_progress':
      return 'inspect';
    case 'locked':
      return 'review_sign';
    case 'finalized':
      return 'report';
    case 'cancelled':
      return null;
  }
}

/**
 * Navigation availability is not an authorization check. The existing
 * application commands and server still enforce actor + lifecycle policy.
 */
export function inspectionWorkflowStageAvailable(
  status: InspectionResponseDto['status'],
  stage: InspectionWorkflowStepId,
): boolean {
  switch (status) {
    case 'draft':
      return stage === 'setup';
    case 'in_progress':
      return stage === 'inspect' || stage === 'evidence' || stage === 'review_sign';
    case 'locked':
      return stage === 'review_sign';
    case 'finalized':
      return stage === 'report';
    case 'cancelled':
      return false;
  }
}

export function inspectionWorkflowSteps(
  status: InspectionResponseDto['status'],
  selectedStage?: InspectionWorkflowStepId | null,
): readonly InspectionWorkflowStep[] {
  const recommended = inspectionWorkflowCurrentStep(status);
  const current =
    selectedStage && inspectionWorkflowStageAvailable(status, selectedStage)
      ? selectedStage
      : recommended;
  const currentIndex = current
    ? INSPECTION_WORKFLOW_STEPS.findIndex((step) => step.id === current)
    : -1;

  return INSPECTION_WORKFLOW_STEPS.map((step, index) => ({
    ...step,
    available: inspectionWorkflowStageAvailable(status, step.id),
    state:
      currentIndex < 0
        ? 'upcoming'
        : index < currentIndex
          ? 'previous'
          : index === currentIndex
            ? 'current'
            : 'upcoming',
  }));
}
