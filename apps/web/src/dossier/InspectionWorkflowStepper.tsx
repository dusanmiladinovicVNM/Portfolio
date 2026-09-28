import type { InspectionResponseDto } from '@portfolio/contracts';
import { inspectionWorkflowSteps } from './inspection-workflow.js';

interface InspectionWorkflowStepperProps {
  readonly status: InspectionResponseDto['status'];
  readonly requiredResponsesComplete: boolean;
}

export function InspectionWorkflowStepper({
  status,
  requiredResponsesComplete,
}: InspectionWorkflowStepperProps) {
  if (status === 'cancelled') {
    return (
      <div className="inspection-workflow-cancelled" role="status">
        Inspection cancelled
      </div>
    );
  }

  const steps = inspectionWorkflowSteps(status, requiredResponsesComplete);

  return (
    <nav
      aria-label="Inspection workflow"
      className="inspection-workflow-stepper"
    >
      <ol>
        {steps.map((step, index) => (
          <li
            aria-current={step.state === 'current' ? 'step' : undefined}
            className={`inspection-workflow-step inspection-workflow-step-${step.state}`}
            key={step.id}
          >
            <span className="inspection-workflow-step-number">
              {step.state === 'complete' ? '✓' : index + 1}
            </span>
            <strong>{step.label}</strong>
          </li>
        ))}
      </ol>
    </nav>
  );
}
