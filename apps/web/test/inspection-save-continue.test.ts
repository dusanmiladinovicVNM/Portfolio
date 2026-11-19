import { describe, expect, it } from 'vitest';
import {
  inspectionContinueDecision,
  type InspectionContinueProgress,
} from '../src/dossier/UnitInspections.js';

type Intent = Parameters<typeof inspectionContinueDecision>[0];

const intent: Intent = {
  inspectionId: 'inspection-A',
  sourceSectionId: 'room-A',
  destinationSectionId: 'room-B',
  sourceRevision: 7,
  draftRevision: 3,
  requiresAcknowledgedSave: true,
};

const pending: InspectionContinueProgress = {
  sourceInspectionId: 'inspection-A',
  sourceSectionId: 'room-A',
  sectionRevision: 7,
  draftRevision: 3,
  hasUnsavedChanges: true,
  sectionWritePending: false,
  inspectionWritePending: false,
  conflict: false,
  saveError: null,
};

describe('Inspection Save & continue server-authoritative transition', () => {
  it('never advances a dirty section without matching revision acknowledgement', () => {
    expect(inspectionContinueDecision(intent, pending)).toBe('wait');
    expect(inspectionContinueDecision(intent, {
      ...pending,
      hasUnsavedChanges: false,
    })).toBe('wait');
  });

  it('waits while a PATCH or lifecycle mutation remains in flight', () => {
    expect(inspectionContinueDecision(intent, {
      ...pending,
      sectionRevision: 8,
      hasUnsavedChanges: false,
      sectionWritePending: true,
    })).toBe('wait');
    expect(inspectionContinueDecision(intent, {
      ...pending,
      sectionRevision: 8,
      hasUnsavedChanges: false,
      inspectionWritePending: true,
    })).toBe('wait');
  });

  it('advances only after a matching newer canonical revision and clean draft', () => {
    expect(inspectionContinueDecision(intent, {
      ...pending,
      sectionRevision: 8,
      hasUnsavedChanges: false,
    })).toBe('advance');
  });

  it('keeps failed writes and 409 conflicts in the source room', () => {
    expect(inspectionContinueDecision(intent, {
      ...pending,
      saveError: 'PATCH rejected',
    })).toBe('abort');
    expect(inspectionContinueDecision(intent, {
      ...pending,
      conflict: true,
    })).toBe('abort');
  });

  it('does not proceed after a lost acknowledgement, even if the server committed', () => {
    expect(inspectionContinueDecision(intent, {
      ...pending,
      saveError: 'NetworkError',
      sectionRevision: 7,
    })).toBe('abort');
  });

  it('rejects mismatched Inspection, room or changed local draft revision', () => {
    expect(inspectionContinueDecision(intent, {
      ...pending,
      sourceInspectionId: 'inspection-B',
    })).toBe('abort');
    expect(inspectionContinueDecision(intent, {
      ...pending,
      sourceSectionId: 'room-B',
    })).toBe('abort');
    expect(inspectionContinueDecision(intent, {
      ...pending,
      draftRevision: 4,
      sectionRevision: 8,
      hasUnsavedChanges: false,
    })).toBe('abort');
  });

  it('never advances after a newer revision if unresolved local edits remain', () => {
    expect(inspectionContinueDecision(intent, {
      ...pending,
      sectionRevision: 8,
      hasUnsavedChanges: true,
    })).toBe('abort');
  });

  it('permits navigation of a clean section without requiring a new write', () => {
    expect(inspectionContinueDecision({
      ...intent,
      requiresAcknowledgedSave: false,
    }, {
      ...pending,
      hasUnsavedChanges: false,
    })).toBe('advance');
  });
});
