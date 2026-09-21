import {
  createPropertyRequestSchema,
  propertyResponseSchema,
  type PropertyResponse,
} from '@portfolio/contracts';
import { PROPERTY_TYPES } from '@portfolio/domain';
import { type FormEvent, useState } from 'react';
import { propertiesPath } from '../api/paths.js';
import type { PortfolioApi } from '../api/portfolio-api.js';
import {
  contractErrorMessage,
  optionalNumber,
  requiredString,
} from './form-utils.js';

interface CreatePropertyFormProps {
  readonly api: PortfolioApi;
  readonly onCreated: (property: PropertyResponse) => void;
}

function label(value: string): string {
  return value.replaceAll('_', ' ');
}

export function CreatePropertyForm({
  api,
  onCreated,
}: CreatePropertyFormProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const parsed = createPropertyRequestSchema.safeParse({
      code: requiredString(form, 'code'),
      name: requiredString(form, 'name'),
      propertyType: requiredString(form, 'propertyType'),
      street: requiredString(form, 'street'),
      houseNumber: requiredString(form, 'houseNumber'),
      postalCode: requiredString(form, 'postalCode'),
      city: requiredString(form, 'city'),
      countryCode: requiredString(form, 'countryCode'),
      yearBuilt: optionalNumber(form, 'yearBuilt'),
    });

    if (!parsed.success) {
      setError(contractErrorMessage());
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const created = await api.post(
        propertiesPath(),
        parsed.data,
        propertyResponseSchema,
      );
      formElement.reset();
      onCreated(created);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Property could not be created.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="setup-form" onSubmit={submit}>
      <div className="setup-form-grid">
        <label>
          Code
          <input name="code" placeholder="PROP-001" required />
        </label>
        <label>
          Name
          <input name="name" placeholder="Central Apartments" required />
        </label>
        <label>
          Property type
          <select defaultValue="apartment_building" name="propertyType">
            {PROPERTY_TYPES.map((value) => (
              <option key={value} value={value}>{label(value)}</option>
            ))}
          </select>
        </label>
        <label>
          Year built
          <input min="1000" max="3000" name="yearBuilt" type="number" />
        </label>
        <label>
          Street
          <input name="street" required />
        </label>
        <label>
          House number
          <input name="houseNumber" required />
        </label>
        <label>
          Postal code
          <input name="postalCode" required />
        </label>
        <label>
          City
          <input name="city" required />
        </label>
        <label>
          Country code
          <input
            defaultValue="CH"
            maxLength={2}
            minLength={2}
            name="countryCode"
            required
          />
        </label>
      </div>

      {error ? <p className="setup-form-error" role="alert">{error}</p> : null}

      <div className="setup-form-actions">
        <span className="setup-hint">
          Property code must be unique across the Portfolio.
        </span>
        <button className="button-primary" disabled={submitting} type="submit">
          {submitting ? 'Creating…' : 'Create Property'}
        </button>
      </div>
    </form>
  );
}
