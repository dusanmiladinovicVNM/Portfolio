import {
  inspectionWorkflowCurrentStep,
  inspectionWorkflowSteps,
} from '../src/dossier/inspection-workflow.js';
import { describe, expect, it } from 'vitest';

describe('Inspection workflow presentation', () => {
  it('maps canonical lifecycle states to the focused UX step', () => {
    expect(inspectionWorkflowCurrentStep('draft', false)).toBe('setup');
    expect(inspectionWorkflowCurrentStep('in_progress', false)).toBe('inspect');
    expect(inspectionWorkflowCurrentStep('in_progress', true)).toBe('review');
    expect(inspectionWorkflowCurrentStep('locked', true)).toBe('sign');
    expect(inspectionWorkflowCurrentStep('finalized', true)).toBe('complete');
    expect(inspectionWorkflowCurrentStep('cancelled', false)).toBeNull();
  });

  it('marks only presentation predecessors complete', () => {
    expect(
      inspectionWorkflowSteps('locked', true).map((step) => [
        step.id,
        step.state,
      ]),
    ).toEqual([
      ['setup', 'complete'],
      ['inspect', 'complete'],
      ['review', 'complete'],
      ['sign', 'current'],
      ['complete', 'upcoming'],
    ]);
  });

  it('does not invent a persisted review lifecycle state', () => {
    const incomplete = inspectionWorkflowSteps('in_progress', false);
    const ready = inspectionWorkflowSteps('in_progress', true);

    expect(incomplete.find((step) => step.state === 'current')?.id).toBe(
      'inspect',
    );
    expect(ready.find((step) => step.state === 'current')?.id).toBe('review');
  });
});
