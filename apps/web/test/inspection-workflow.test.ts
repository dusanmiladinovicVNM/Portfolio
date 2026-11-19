import {
  inspectionWorkflowCurrentStep,
  inspectionWorkflowStageAvailable,
  inspectionWorkflowSteps,
} from '../src/dossier/inspection-workflow.js';
import { describe, expect, it } from 'vitest';

describe('Inspection task phase navigation (presentation only)', () => {
  it('always exposes the owner-approved five phases in the intended order', () => {
    expect(inspectionWorkflowSteps('in_progress').map((step) => step.id)).toEqual([
      'setup',
      'inspect',
      'evidence',
      'review_sign',
      'report',
    ]);
  });

  it('derives a safe default without inventing another lifecycle state', () => {
    expect(inspectionWorkflowCurrentStep('draft')).toBe('setup');
    expect(inspectionWorkflowCurrentStep('in_progress')).toBe('inspect');
    expect(inspectionWorkflowCurrentStep('locked')).toBe('review_sign');
    expect(inspectionWorkflowCurrentStep('finalized')).toBe('report');
    expect(inspectionWorkflowCurrentStep('cancelled')).toBeNull();
  });

  it('does not assert that earlier stages were canonically completed', () => {
    const selected = inspectionWorkflowSteps('in_progress', 'review_sign');
    expect(selected.map(({ id, state }) => [id, state])).toEqual([
      ['setup', 'previous'],
      ['inspect', 'previous'],
      ['evidence', 'previous'],
      ['review_sign', 'current'],
      ['report', 'upcoming'],
    ]);
    expect(selected.every((step) => step.state !== 'complete')).toBe(true);
  });

  it('allows only lifecycle-compatible surfaces, never illegal navigation', () => {
    expect(
      inspectionWorkflowSteps('draft').filter((step) => step.available).map((step) => step.id),
    ).toEqual(['setup']);
    expect(
      inspectionWorkflowSteps('in_progress').filter((step) => step.available).map((step) => step.id),
    ).toEqual(['inspect', 'evidence', 'review_sign']);
    expect(
      inspectionWorkflowSteps('locked').filter((step) => step.available).map((step) => step.id),
    ).toEqual(['review_sign']);
    expect(
      inspectionWorkflowSteps('finalized').filter((step) => step.available).map((step) => step.id),
    ).toEqual(['report']);
    expect(inspectionWorkflowSteps('cancelled').every((step) => !step.available)).toBe(true);
  });

  it('ignores a stale or unavailable selection after lifecycle changes', () => {
    expect(inspectionWorkflowSteps('locked', 'evidence')
      .find((step) => step.state === 'current')?.id).toBe('review_sign');
    expect(inspectionWorkflowSteps('finalized', 'review_sign')
      .find((step) => step.state === 'current')?.id).toBe('report');
    expect(inspectionWorkflowStageAvailable('draft', 'report')).toBe(false);
  });

  it('never interprets phase selection as authorization or completion', () => {
    const selected = inspectionWorkflowSteps('in_progress', 'review_sign');
    expect(selected.find((step) => step.id === 'review_sign')?.available).toBe(true);
    expect(selected.find((step) => step.id === 'report')?.available).toBe(false);
  });
});
