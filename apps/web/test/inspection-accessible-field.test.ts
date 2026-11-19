import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  InspectionQuestionField,
  InspectionSaveStatus,
  inspectionAutosaveMessage,
  type InspectionSaveStatusState,
} from '../src/dossier/UnitInspections.js';

type Item = Parameters<typeof InspectionQuestionField>[0]['item'];
type QuestionProps = Parameters<typeof InspectionQuestionField>[0];

const fieldId = 'inspection-answer-inspection-one-room-one-question-one';

function question(type: Item['type']): Item {
  return {
    id: 'question-one',
    sectionId: 'schema-section',
    key: 'window_condition',
    type,
    label: 'Window condition',
    required: true,
    sortOrder: 1,
    options: [
      { value: 'good', label: 'Good' },
      { value: 'damaged', label: 'Damaged' },
    ],
    visibleWhen: null,
    requiredWhen: null,
  } as Item;
}

function renderQuestion(
  type: Item['type'],
  overrides: Partial<QuestionProps> = {},
): string {
  return renderToStaticMarkup(
    createElement(InspectionQuestionField, {
      item: question(type),
      entry: { value: undefined, comment: '' },
      disabled: false,
      required: true,
      requiredMissing: true,
      fieldId,
      onChange: () => {},
      ...overrides,
    }),
  );
}

describe('Inspection schema field accessible identity', () => {
  it.each([
    ['text', 'input'],
    ['number', 'input'],
    ['date', 'input'],
    ['textarea', 'textarea'],
    ['select', 'select'],
    ['radio', 'select'],
    ['checkbox', 'select'],
  ] as const)(
    'associates the visible question label with the %s control',
    (kind, tag) => {
      const html = renderQuestion(kind);
      expect(html).toContain('for="' + fieldId + '"');
      expect(html).toMatch(
        new RegExp('<' + tag + '\\b[^>]*\\bid="' + fieldId + '"'),
      );
      expect(html).toContain('aria-required="true"');
      expect(html).toContain('aria-invalid="true"');
      expect(html).toContain(
        'aria-describedby="' + fieldId + '-required"',
      );
      expect(html).toContain('id="' + fieldId + '-required"');
      expect(html).toContain('Required response missing');
      expect(html).toContain('Comment for Window condition');
    },
  );

  it('groups multiselect choices in a fieldset with a question legend', () => {
    const html = renderQuestion('multiselect');
    expect(html).toContain('<fieldset');
    expect(html).toContain('<legend class="inspection-item-label">');
    expect(html).toContain('Window condition');
    expect(html).not.toContain('aria-invalid="true"');
    expect(html).toContain('class="inspection-required-screen-reader"');
    expect(html).toContain('(required)');
    expect(html).toContain('aria-describedby="' + fieldId + '-required"');
    expect(html).toContain('id="' + fieldId + '-required"');
    expect((html.match(/type="checkbox"/g) ?? []).length).toBe(2);
    expect(html).toContain('Good');
    expect(html).toContain('Damaged');
    expect(html).toContain('Comment for Window condition');
  });

  it('keeps optional multiselect groups free of invalid and required state', () => {
    const html = renderQuestion('multiselect', {
      required: false,
      requiredMissing: false,
      entry: { value: ['good'], comment: '' },
    });
    expect(html).not.toContain('aria-invalid="true"');
    expect(html).not.toContain('inspection-required-screen-reader');
    expect(html).not.toContain('Required response missing');
    expect(html).toContain('checked=""');
  });

  it('does not misrepresent an optional answered item as required or invalid', () => {
    const html = renderQuestion('text', {
      required: false,
      requiredMissing: false,
      entry: { value: 'Clean', comment: 'Checked' },
    });
    expect(html).not.toContain('aria-required="true"');
    expect(html).not.toContain('aria-invalid="true"');
    expect(html).not.toContain(fieldId + '-required');
    expect(html).not.toContain('Required response missing');
    expect(html).toContain('value="Clean"');
    expect(html).toContain('Checked');
  });

  it('does not reuse one label target for the same schema item in two rooms', () => {
    const roomA = renderQuestion('text', { fieldId: fieldId + '-a' });
    const roomB = renderQuestion('text', { fieldId: fieldId + '-b' });
    expect(roomA).toContain('for="' + fieldId + '-a"');
    expect(roomB).toContain('for="' + fieldId + '-b"');
    expect(roomA).not.toContain('for="' + fieldId + '-b"');
    expect(roomB).not.toContain('for="' + fieldId + '-a"');
  });
});

const saved: InspectionSaveStatusState = {
  conflict: false,
  saveError: null,
  autosaveBlockedChangeRevision: null,
  draftChangeRevision: 3,
  saving: false,
  hasUnsavedChanges: false,
};

describe('Inspection autosave live announcement', () => {
  it('renders one polite atomic status region for screen readers', () => {
    const html = renderToStaticMarkup(
      createElement(InspectionSaveStatus, {
        message: 'Saving section…',
      }),
    );
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('aria-atomic="true"');
    expect(html).toContain('data-inspection-field-save-status');
    expect(html).toContain('Saving section…');
    expect((html.match(/role="status"/g) ?? []).length).toBe(1);
  });

  it('announces pending changes and saving before claiming success', () => {
    expect(
      inspectionAutosaveMessage({ ...saved, hasUnsavedChanges: true }),
    ).toBe('Unsaved changes · autosave pending');
    expect(
      inspectionAutosaveMessage({
        ...saved,
        hasUnsavedChanges: true,
        saving: true,
      }),
    ).toBe('Saving section…');
    expect(inspectionAutosaveMessage(saved)).toBe(
      'All section changes saved',
    );
  });

  it('prioritizes unresolved CAS conflicts over any save in progress', () => {
    expect(
      inspectionAutosaveMessage({
        ...saved,
        conflict: true,
        saving: true,
        hasUnsavedChanges: true,
      }),
    ).toBe('Autosave paused · resolve the server conflict');
  });

  it('keeps a failed write paused until a new change or explicit retry', () => {
    expect(
      inspectionAutosaveMessage({
        ...saved,
        saveError: 'PATCH failed',
        autosaveBlockedChangeRevision: 3,
        hasUnsavedChanges: true,
      }),
    ).toBe('Autosave paused after save failure · use Save now to retry');
    expect(
      inspectionAutosaveMessage({
        ...saved,
        saveError: 'PATCH failed',
        autosaveBlockedChangeRevision: 2,
        hasUnsavedChanges: true,
      }),
    ).toBe('Unsaved changes · autosave pending');
  });
});
