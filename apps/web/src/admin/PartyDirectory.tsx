import {
  createPartyRequestSchema,
  partyListResponseSchema,
  partyResponseSchema,
  type PartyResponse,
} from '@portfolio/contracts';
import { ADDRESS_TYPES } from '@portfolio/domain';
import { type FormEvent, useEffect, useState } from 'react';
import { partiesPath } from '../api/paths.js';
import type { PortfolioApi } from '../api/portfolio-api.js';
import {
  contractErrorMessage,
  optionalString,
  requiredString,
} from './form-utils.js';
import { useCreateSubmissionGuard } from './use-create-submission-guard.js';

interface PartyDirectoryProps {
  readonly api: PortfolioApi;
  readonly asOf: string;
}

export function PartyDirectory({ api, asOf }: PartyDirectoryProps) {
  const [parties, setParties] = useState<readonly PartyResponse[] | null>(null);
  const [partyType, setPartyType] = useState<'person' | 'company'>('person');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submission = useCreateSubmissionGuard();

  useEffect(() => {
    const controller = new AbortController();
    setParties(null);
    setLoadError(null);

    void api
      .get(partiesPath(), partyListResponseSchema, {
        signal: controller.signal,
      })
      .then((response) =>
        setParties(
          [...response.items].sort((left, right) =>
            left.displayName.localeCompare(right.displayName),
          ),
        ),
      )
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setLoadError(
          cause instanceof Error ? cause.message : 'Parties could not be loaded.',
        );
      });

    return () => controller.abort();
  }, [api]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!submission.tryStart()) return;

    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const email = optionalString(form, 'email');
    const phone = optionalString(form, 'phone');
    const addressLine1 = optionalString(form, 'addressLine1');
    const postalCode = optionalString(form, 'postalCode');
    const city = optionalString(form, 'city');
    const countryCode = optionalString(form, 'countryCode');

    const common = {
      code: requiredString(form, 'code'),
      displayName: optionalString(form, 'displayName'),
      contactPoints: [
        ...(email
          ? [{ contactType: 'email' as const, value: email, isPrimary: true }]
          : []),
        ...(phone
          ? [{ contactType: 'phone' as const, value: phone, isPrimary: true }]
          : []),
      ],
      ...(
        addressLine1 || postalCode || city || countryCode
          ? {
              addresses: [{
                addressType: requiredString(form, 'addressType'),
                line1: addressLine1 ?? '',
                postalCode: postalCode ?? '',
                city: city ?? '',
                countryCode: countryCode ?? '',
                isPrimary: true,
              }],
            }
          : {}
      ),
    };

    const parsed = createPartyRequestSchema.safeParse(
      partyType === 'person'
        ? {
            ...common,
            partyType: 'person',
            firstName: requiredString(form, 'firstName'),
            middleName: optionalString(form, 'middleName'),
            lastName: requiredString(form, 'lastName'),
          }
        : {
            ...common,
            partyType: 'company',
            legalName: requiredString(form, 'legalName'),
          },
    );

    if (!parsed.success) {
      submission.finish();
      setCreateError(contractErrorMessage());
      return;
    }

    setSubmitting(true);
    setCreateError(null);
    try {
      const created = await api.post(
        partiesPath(),
        parsed.data,
        partyResponseSchema,
      );
      if (submission.isMounted()) {
        setParties((current) =>
          [created, ...(current ?? []).filter((item) => item.id !== created.id)]
            .sort((left, right) =>
              left.displayName.localeCompare(right.displayName),
            ),
        );
        formElement.reset();
        setPartyType('person');
      }
    } catch (cause) {
      if (submission.isMounted()) {
        setCreateError(
          cause instanceof Error ? cause.message : 'Party could not be created.',
        );
      }
    } finally {
      submission.finish();
      if (submission.isMounted()) setSubmitting(false);
    }
  }

  return (
    <>
      <header className="workspace-header">
        <div>
          <p className="eyebrow">Master data</p>
          <h1>Parties</h1>
          <p className="header-note">
            People and companies used by Tenancies, agreements, service,
            ownership and other Portfolio workflows. Reporting context remains
            {' ' + asOf}.
          </p>
        </div>
      </header>

      <div className="party-layout">
        <section className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Core setup</p>
              <h2>Add Party</h2>
            </div>
            <span className="section-note">Person or company</span>
          </div>

          <form className="setup-form" onSubmit={submit}>
            <div className="setup-form-grid">
              <label>
                Party type
                <select
                  name="partyType"
                  onChange={(event) =>
                    setPartyType(
                      event.currentTarget.value === 'company'
                        ? 'company'
                        : 'person',
                    )
                  }
                  value={partyType}
                >
                  <option value="person">Person</option>
                  <option value="company">Company</option>
                </select>
              </label>
              <label>
                Code
                <input name="code" placeholder="PTY-001" required />
              </label>

              {partyType === 'person' ? (
                <>
                  <label>
                    First name
                    <input name="firstName" required />
                  </label>
                  <label>
                    Middle name
                    <input name="middleName" />
                  </label>
                  <label>
                    Last name
                    <input name="lastName" required />
                  </label>
                </>
              ) : (
                <label>
                  Legal name
                  <input name="legalName" required />
                </label>
              )}

              <label>
                Display name
                <input name="displayName" />
              </label>
            </div>

            <div className="setup-subsection">
              <h3>Primary contact</h3>
              <div className="setup-form-grid">
                <label>
                  Email
                  <input inputMode="email" name="email" type="email" />
                </label>
                <label>
                  Phone
                  <input inputMode="tel" name="phone" />
                </label>
              </div>
            </div>

            <div className="setup-subsection">
              <h3>Primary address</h3>
              <div className="setup-form-grid">
                <label>
                  Address type
                  <select
                    defaultValue={
                      partyType === 'company' ? 'legal' : 'residential'
                    }
                    key={partyType}
                    name="addressType"
                  >
                    {ADDRESS_TYPES.map((value) => (
                      <option key={value} value={value}>
                        {value.replaceAll('_', ' ')}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Address line
                  <input name="addressLine1" />
                </label>
                <label>
                  Postal code
                  <input name="postalCode" />
                </label>
                <label>
                  City
                  <input name="city" />
                </label>
                <label>
                  Country code
                  <input maxLength={2} minLength={2} name="countryCode" />
                </label>
              </div>
              <p className="setup-hint">
                If one address field is entered, all required address fields
                must be completed.
              </p>
            </div>

            {createError ? (
              <p className="setup-form-error" role="alert">{createError}</p>
            ) : null}

            <div className="setup-form-actions">
              <span className="setup-hint">
                Party code must be globally unique.
              </span>
              <button
                className="button-primary"
                disabled={submitting}
                type="submit"
              >
                {submitting ? 'Creating…' : 'Create Party'}
              </button>
            </div>
          </form>
        </section>

        <section className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Directory</p>
              <h2>Current Parties</h2>
            </div>
            <span className="section-note">
              {parties === null ? 'Loading…' : String(parties.length) + ' records'}
            </span>
          </div>
          {loadError ? <p className="form-error" role="alert">{loadError}</p> : null}
          {!loadError && parties === null ? (
            <p className="muted" aria-live="polite">Loading Parties…</p>
          ) : null}
          {parties?.length === 0 ? (
            <p className="muted">No Parties created yet.</p>
          ) : null}
          {parties && parties.length > 0 ? (
            <div className="party-list">
              {parties.map((item) => (
                <article className="party-card" key={item.id}>
                  <div className="party-card-header">
                    <div>
                      <span className="eyebrow">{item.code}</span>
                      <h3>{item.displayName}</h3>
                    </div>
                    <span className="status-chip">{item.status}</span>
                  </div>
                  <div className="party-meta">
                    <span>{item.partyType}</span>
                    <span>{item.contactPoints.length} contacts</span>
                    <span>{item.addresses.length} addresses</span>
                  </div>
                </article>
              ))}
            </div>
          ) : null}
        </section>
      </div>
    </>
  );
}
