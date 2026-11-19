import type { InspectionResponseDto } from '@portfolio/contracts';
import {
  inspectionWorkflowSteps,
  type InspectionWorkflowStepId,
} from './inspection-workflow.js';

interface InspectionWorkflowStepperProps {
  readonly status: InspectionResponseDto['status'];
  readonly selectedStage: InspectionWorkflowStepId | null;
  readonly navigationBlocked: boolean;
  readonly onSelectStage: (stage: InspectionWorkflowStepId) => void;
}

export function InspectionWorkflowStepper({
  status,
  selectedStage,
  navigationBlocked,
  onSelectStage,
}: InspectionWorkflowStepperProps) {
  if (status === 'cancelled') {
    return (
      <div className="inspection-workflow-cancelled" role="status">
        Inspection cancelled
      </div>
    );
  }

  const steps = inspectionWorkflowSteps(status, selectedStage);

  return (
    <nav
      aria-label="Inspektionsablauf"
      className="inspection-workflow-stepper"
      data-inspection-stage-navigation
    >
      <ol>
        {steps.map((step, index) => (
          <li
            className={`inspection-workflow-step inspection-workflow-step-${step.state}`}
            key={step.id}
          >
            <button
              aria-current={step.state === 'current' ? 'step' : undefined}
              data-inspection-stage={step.id}
              disabled={!step.available || (navigationBlocked && step.state !== 'current')}
              onClick={() => onSelectStage(step.id)}
              type="button"
            >
              <span className="inspection-workflow-step-number">
                {index + 1}
              </span>
              <strong>{step.label}</strong>
            </button>
          </li>
        ))}
      </ol>
      {navigationBlocked && status === 'in_progress' ? (
        <p className="inspection-workflow-navigation-hint">
          Aktuelle Änderungen zuerst speichern oder den Konflikt beheben.
        </p>
      ) : null}
    </nav>
  );
}
