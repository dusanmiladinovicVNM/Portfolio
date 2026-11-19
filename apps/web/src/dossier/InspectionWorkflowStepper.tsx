import type { InspectionResponseDto } from '@portfolio/contracts';
import { useEffect, useRef } from 'react';
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
  const viewportRef = useRef<HTMLElement>(null);
  const currentIndex = steps.findIndex((step) => step.state === 'current');
  const currentStep = currentIndex >= 0 ? steps[currentIndex] : null;

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    function keepCurrentStepVisible() {
      const selected = viewport?.querySelector<HTMLElement>('[aria-current="step"]');
      if (!viewport || !selected) return;

      // Horizontal adjustment only: never steal focus or scroll the whole
      // document when canonical lifecycle or viewport width changes.
      const viewportRect = viewport.getBoundingClientRect();
      const stepRect = selected.getBoundingClientRect();
      const padding = 12;
      if (stepRect.left < viewportRect.left + padding) {
        viewport.scrollLeft += stepRect.left - viewportRect.left - padding;
      } else if (stepRect.right > viewportRect.right - padding) {
        viewport.scrollLeft += stepRect.right - viewportRect.right + padding;
      }
    }

    keepCurrentStepVisible();
    window.addEventListener('resize', keepCurrentStepVisible);
    return () => window.removeEventListener('resize', keepCurrentStepVisible);
  }, [status, selectedStage]);

  return (
    <nav
      aria-label="Inspektionsablauf"
      className="inspection-workflow-stepper"
      data-inspection-stage-navigation
      ref={viewportRef}
    >
      {currentStep ? (
        <p className="inspection-workflow-current-summary" aria-live="polite" aria-atomic="true">
          Schritt {currentIndex + 1} von {steps.length} · {currentStep.label}
        </p>
      ) : null}
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
