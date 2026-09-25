import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const migrationUrl = new URL(
  '../../../supabase/migrations/20260925194000_space_aware_inspections.sql',
  import.meta.url,
);

describe('space-aware Inspection migration', () => {
  it('suspends both response UPDATE guards around the legacy ownership backfill', async () => {
    const sql = await readFile(migrationUrl, 'utf8');

    const disableValidate = sql.indexOf(
      'disable trigger inspection_responses_validate_trg',
    );
    const disableEditable = sql.indexOf(
      'disable trigger inspection_responses_editable_trg',
    );
    const backfill = sql.indexOf(
      'update public.inspection_responses response',
    );
    const enableEditable = sql.indexOf(
      'enable trigger inspection_responses_editable_trg',
    );
    const enableValidate = sql.indexOf(
      'enable trigger inspection_responses_validate_trg',
    );

    expect(disableValidate).toBeGreaterThanOrEqual(0);
    expect(disableEditable).toBeGreaterThan(disableValidate);
    expect(backfill).toBeGreaterThan(disableEditable);
    expect(enableEditable).toBeGreaterThan(backfill);
    expect(enableValidate).toBeGreaterThan(enableEditable);
  });
});
