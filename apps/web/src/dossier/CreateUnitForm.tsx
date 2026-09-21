import {
  createUnitRequestSchema,
  unitResponseSchema,
  type UnitResponse,
} from '@portfolio/contracts';
import { UNIT_TYPES } from '@portfolio/domain';
import { type FormEvent, useState } from 'react';
import { unitsPath } from '../api/paths.js';
import type { PortfolioApi } from '../api/portfolio-api.js';
import { useCreateSubmissionGuard } from '../admin/use-create-submission-guard.js';
import {
  contractErrorMessage,
  optionalNumber,
  optionalString,
  requiredString,
} from '../admin/form-utils.js';

interface CreateUnitFormProps {
  readonly api: PortfolioApi;
  readonly propertyId: string;
  readonly onCreated: (unit: UnitResponse) => void;
}

function label(value: string): string {
  return value.replaceAll('_', ' ');
}

export function CreateUnitForm({
  api,
  propertyId,
  onCreated,
}: CreateUnitFormProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submission = useCreateSubmissionGuard();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!submission.tryStart()) return;

    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const parsed = createUnitRequestSchema.safeParse({
      propertyId,
      code: requiredString(form, 'code'),
      unitNumber: requiredString(form, 'unitNumber'),
      unitType: requiredString(form, 'unitType'),
      floor: optionalString(form, 'floor'),
      areaM2: optionalNumber(form, 'areaM2'),
      rooms: optionalNumber(form, 'rooms'),
      notes: optionalString(form, 'notes'),
    });

    if (!parsed.success) {
      submission.finish();
      setError(contractErrorMessage());
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const created = await api.post(
        unitsPath(),
        parsed.data,
        unitResponseSchema,
      );
      if (created.propertyId !== propertyId) {
        throw new Error(
          'Created Unit does not belong to the Property encoded in the route.',
        );
      }
      if (submission.isMounted()) {
        formElement.reset();
        onCreated(created);
      }
    } catch (cause) {
      if (submission.isMounted()) {
        setError(
          cause instanceof Error ? cause.message : 'Unit could not be created.',
        );
      }
    } finally {
      submission.finish();
      if (submission.isMounted()) setSubmitting(false);
    }
  }

  return (
    <form className="setup-form" onSubmit={submit}>
      <div className="setup-form-grid">
        <label>
          Code
          <input name="code" placeholder="UNIT-001" required />
        </label>
        <label>
          Unit number
          <input name="unitNumber" placeholder="1A" required />
        </label>
        <label>
          Unit type
          <select defaultValue="apartment" name="unitType">
            {UNIT_TYPES.map((value) => (
              <option key={value} value={value}>{label(value)}</option>
            ))}
          </select>
        </label>
        <label>
          Floor
          <input name="floor" />
        </label>
        <label>
          Area m²
          <input min="0.01" name="areaM2" step="0.01" type="number" />
        </label>
        <label>
          Rooms
          <input min="0.5" name="rooms" step="0.5" type="number" />
        </label>
      </div>
      <label>
        Notes
        <textarea name="notes" rows={3} />
      </label>

      {error ? <p className="setup-form-error" role="alert">{error}</p> : null}

      <div className="setup-form-actions">
        <span className="setup-hint">
          Unit number must be unique inside this Property.
        </span>
        <button className="button-primary" disabled={submitting} type="submit">
          {submitting ? 'Creating…' : 'Create Unit'}
        </button>
      </div>
    </form>
  );
}
