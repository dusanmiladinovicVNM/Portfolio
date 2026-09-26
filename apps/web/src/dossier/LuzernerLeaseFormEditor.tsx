import {
  luzernerLeaseFormResponseSchema,
  type LeaseAgreementResponse,
  type LuzernerLeaseFormContentRequest,
  type LuzernerLeaseFormResponse,
} from '@portfolio/contracts';
import {
  LUZERNER_ANCILLARY_COST_KEYS,
  LUZERNER_SHARED_USE_KEYS,
  emptyLuzernerLeaseFormContent,
  normalizeLuzernerLeaseFormContent,
  type LuzernerAncillaryCostKey,
  type LuzernerAncillaryCostMode,
  type LuzernerLeaseFormContent,
  type LuzernerSharedUseKey,
} from '@portfolio/domain';
import { useEffect, useRef, useState } from 'react';
import { agreementLuzernerFormPath } from '../api/paths.js';
import {
  isAmbiguousWriteFailure,
  PortfolioApiError,
  type PortfolioApi,
} from '../api/portfolio-api.js';

interface LuzernerLeaseFormEditorProps {
  readonly api: PortfolioApi;
  readonly agreement: LeaseAgreementResponse;
}

const ANCILLARY_LABELS: Readonly<Record<LuzernerAncillaryCostKey, string>> = {
  heating_hot_water: 'Heiz- und Warmwasserkosten (VMWG Art. 5)',
  cold_water: 'Kaltwasserbezug',
  caretaker_stair_cleaning: 'Hauswartung und Treppenhausreinigung',
  garden_surroundings_snow:
    'Garten und Umgebungspflege, Schneeräumung, inkl. Service Geräte und Verbrauchsmaterial',
  lift: 'Liftservice inkl. Strom, Wartung und Notrufsystem',
  common_electricity_gas: 'Allgemeine Strom- und Gaskosten',
  ara_kva_sewer: 'Betriebsgebühren ARA/KVA/Kanalisation',
  tv_cable: 'TV-Kabelanschluss (ohne Dienste)',
  laundry:
    'Betriebskosten Waschmaschine/Geräte in der Waschküche, inkl. Service-Abonnemente',
  administration_share: 'Verwaltungsanteil an Nebenkosten',
};

const SHARED_USE_LABELS: Readonly<Record<LuzernerSharedUseKey, string>> = {
  laundry_room: 'Waschküche',
  drying_room: 'Trockenraum',
  drying_area: 'Wäschehängeplatz',
  stroller_room: 'Einstellr. Kinderwagen',
  garden: 'Garten',
  hobby_room: 'Bastelraum',
  playground: 'Kinderspielplatz',
  bicycle_moped_room: 'Einstellr. Velo/Moped',
};

function sameContent(
  left: LuzernerLeaseFormContentRequest,
  right: LuzernerLeaseFormContentRequest,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function optionalString(value: string): string | null {
  return value.trim() ? value : null;
}

function optionalNumber(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toRequestContent(
  input: LuzernerLeaseFormContent,
): LuzernerLeaseFormContentRequest {
  return {
    ...input,
    sharedUse: { ...input.sharedUse },
    customSharedUse: [...input.customSharedUse],
    ancillaryCosts: { ...input.ancillaryCosts },
    customAncillaryCosts: input.customAncillaryCosts.map((value) => ({
      ...value,
    })),
  };
}

function normalizeRequestContent(
  input: LuzernerLeaseFormContentRequest,
): LuzernerLeaseFormContentRequest {
  return toRequestContent(normalizeLuzernerLeaseFormContent(input));
}

function customSharedUseValue(
  values: readonly string[],
  index: number,
): string {
  return values[index] ?? '';
}

function setCustomSharedUseValue(
  values: readonly string[],
  index: number,
  value: string,
): string[] {
  const next = [...values];
  while (next.length <= index) next.push('');
  next[index] = value;
  return next;
}

function customAncillaryValue(
  values: LuzernerLeaseFormContentRequest['customAncillaryCosts'],
  index: number,
): { readonly label: string; readonly mode: LuzernerAncillaryCostMode } {
  return values[index] ?? { label: '', mode: 'excluded' };
}

function setCustomAncillaryValue(
  values: LuzernerLeaseFormContentRequest['customAncillaryCosts'],
  index: number,
  value: { readonly label: string; readonly mode: LuzernerAncillaryCostMode },
): LuzernerLeaseFormContentRequest['customAncillaryCosts'] {
  const next = [...values];
  while (next.length <= index) {
    next.push({ label: '', mode: 'excluded' });
  }
  next[index] = value;
  return next;
}

export function LuzernerLeaseFormEditor({
  api,
  agreement,
}: LuzernerLeaseFormEditorProps) {
  const [canonical, setCanonical] =
    useState<LuzernerLeaseFormResponse | null>(null);
  const [draft, setDraft] = useState<LuzernerLeaseFormContentRequest>(() =>
    toRequestContent(emptyLuzernerLeaseFormContent()),
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [outcomeAmbiguous, setOutcomeAmbiguous] = useState(false);
  const ambiguousAttemptRef = useRef<{
    expectedRevision: number;
    content: LuzernerLeaseFormContentRequest;
  } | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setSuccess(null);
    setOutcomeAmbiguous(false);
    ambiguousAttemptRef.current = null;

    void api
      .get(
        agreementLuzernerFormPath(agreement.id),
        luzernerLeaseFormResponseSchema,
        { signal: controller.signal },
      )
      .then((value) => {
        if (controller.signal.aborted) return;
        setCanonical(value);
        setDraft(value.content);
        setDirty(false);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        if (
          cause instanceof PortfolioApiError &&
          cause.code === 'LUZERNER_LEASE_FORM_NOT_FOUND'
        ) {
          setCanonical(null);
          setDraft(toRequestContent(emptyLuzernerLeaseFormContent()));
          setDirty(false);
          return;
        }
        setError(
          cause instanceof Error
            ? cause.message
            : 'Luzerner lease form could not be loaded.',
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [agreement.id, api]);

  const editable = agreement.status === 'draft';
  const controlsDisabled =
    loading || saving || outcomeAmbiguous || !editable;

  function update(
    producer: (
      current: LuzernerLeaseFormContentRequest,
    ) => LuzernerLeaseFormContentRequest,
  ): void {
    if (controlsDisabled) return;
    setDraft((current) => producer(current));
    setDirty(true);
    setSuccess(null);
    setError(null);
  }

  async function exactReread(): Promise<LuzernerLeaseFormResponse> {
    return api.get(
      agreementLuzernerFormPath(agreement.id),
      luzernerLeaseFormResponseSchema,
    );
  }

  function acceptCanonical(value: LuzernerLeaseFormResponse): void {
    setCanonical(value);
    setDraft(value.content);
    setDirty(false);
    setOutcomeAmbiguous(false);
    ambiguousAttemptRef.current = null;
  }

  async function recoverAmbiguousAttempt(): Promise<boolean> {
    const attempt = ambiguousAttemptRef.current;
    if (!attempt) return false;

    try {
      const reread = await exactReread();
      if (!mountedRef.current) return false;

      if (
        reread.revision === attempt.expectedRevision &&
        sameContent(reread.content, attempt.content)
      ) {
        acceptCanonical(reread);
        setSuccess(
          `Saved state recovered at revision ${reread.revision} after an uncertain acknowledgement.`,
        );
        return true;
      }

      setError(
        'The exact canonical reread does not match the uncertain save. Reload the Agreement before making another write.',
      );
      return false;
    } catch (cause) {
      if (!mountedRef.current) return false;
      setError(
        `Save outcome remains uncertain because exact reread failed: ${
          cause instanceof Error ? cause.message : 'request failed'
        }. Save remains disabled.`,
      );
      return false;
    }
  }

  async function save(): Promise<void> {
    if (!editable || saving || outcomeAmbiguous || !dirty) return;

    let normalized: LuzernerLeaseFormContentRequest;
    try {
      normalized = normalizeRequestContent(draft);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Lease form contains invalid data.',
      );
      return;
    }

    const expectedRevision = canonical?.revision ?? null;
    const expectedNextRevision = (canonical?.revision ?? 0) + 1;
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const saved = await api.put(
        agreementLuzernerFormPath(agreement.id),
        {
          expectedRevision,
          content: normalized,
        },
        luzernerLeaseFormResponseSchema,
      );
      if (!mountedRef.current) return;
      acceptCanonical(saved);
      setSuccess(
        `Luzerner Mietvertrag data saved as revision ${saved.revision}.`,
      );
    } catch (cause) {
      if (!mountedRef.current) return;
      if (!isAmbiguousWriteFailure(cause)) {
        setError(
          cause instanceof Error
            ? cause.message
            : 'Luzerner lease form could not be saved.',
        );
        return;
      }

      setOutcomeAmbiguous(true);
      ambiguousAttemptRef.current = {
        expectedRevision: expectedNextRevision,
        content: normalized,
      };
      setError(
        'Save acknowledgement is uncertain. A second write is blocked until the exact Agreement form is reread.',
      );
      await recoverAmbiguousAttempt();
    } finally {
      if (mountedRef.current) setSaving(false);
    }
  }

  if (loading) {
    return (
      <section className="panel" aria-live="polite">
        <p className="muted">Loading Luzerner Mietvertrag data…</p>
      </section>
    );
  }

  const textInput = (
    label: string,
    value: string | null,
    onValue: (value: string | null) => void,
    type: 'text' | 'date' | 'number' = 'text',
  ) => (
    <label>
      {label}
      <input
        disabled={controlsDisabled}
        onChange={(event) =>
          onValue(
            type === 'number'
              ? String(event.currentTarget.value)
              : optionalString(event.currentTarget.value),
          )
        }
        type={type}
        value={value ?? ''}
      />
    </label>
  );

  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Luzerner Mietvertrag · Ausgabe 2020</p>
          <h2>Contract form data</h2>
        </div>
        <span className="section-note">
          {canonical
            ? `Canonical draft revision ${canonical.revision}`
            : 'Not saved yet'}
        </span>
      </div>

      {!editable ? (
        <p className="muted">
          This Agreement is {agreement.status}. Contract form content is now
          read-only.
        </p>
      ) : null}
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {success ? <p className="setup-form-success">{success}</p> : null}

      {outcomeAmbiguous ? (
        <div className="schema-builder-ambiguity" role="alert">
          <strong>Save outcome is uncertain.</strong>
          <p>
            No second write is allowed until the exact canonical form revision
            is known.
          </p>
          <button
            className="button-secondary"
            disabled={saving}
            onClick={() => void recoverAmbiguousAttempt()}
            type="button"
          >
            Resolve exact saved state
          </button>
        </div>
      ) : null}

      <details open>
        <summary><strong>Mietobjekt</strong></summary>
        <div className="setup-form-grid">
          {textInput('EWID', draft.ewid, (value) =>
            update((current) => ({ ...current, ewid: value })))}
          {textInput('EGID', draft.egid, (value) =>
            update((current) => ({ ...current, egid: value })))}
          <label>
            für Personen
            <input
              disabled={controlsDisabled}
              min="1"
              onChange={(event) =>
                update((current) => ({
                  ...current,
                  intendedForPersonCount: optionalNumber(
                    event.currentTarget.value,
                  ),
                }))
              }
              type="number"
              value={draft.intendedForPersonCount ?? ''}
            />
          </label>
          <label className="tenancy-checkbox">
            <input
              checked={draft.familyApartment}
              disabled={controlsDisabled}
              onChange={(event) =>
                update((current) => ({
                  ...current,
                  familyApartment: event.currentTarget.checked,
                }))
              }
              type="checkbox"
            />
            Familienwohnung
          </label>
          <label className="tenancy-checkbox">
            <input
              checked={draft.registeredPartnership}
              disabled={controlsDisabled}
              onChange={(event) =>
                update((current) => ({
                  ...current,
                  registeredPartnership: event.currentTarget.checked,
                }))
              }
              type="checkbox"
            />
            Eingetragene Partnerschaft
          </label>
          <label className="tenancy-checkbox">
            <input
              checked={draft.furnished}
              disabled={controlsDisabled}
              onChange={(event) =>
                update((current) => ({
                  ...current,
                  furnished: event.currentTarget.checked,
                }))
              }
              type="checkbox"
            />
            möbliert
          </label>
          {([
            ['separateRoom', 'sep. Zimmer'],
            ['cellar', 'Keller'],
            ['attic', 'Estrich'],
            ['separateApartment', 'sep. Wohnung'],
            ['garage', 'Garage / Einstellpl. Nr.'],
            ['parkingSpace', 'Abstellplatz Nr.'],
          ] as const).map(([key, label]) => (
            <label className="tenancy-checkbox" key={key}>
              <input
                checked={draft[key]}
                disabled={controlsDisabled}
                onChange={(event) =>
                  update((current) => ({
                    ...current,
                    [key]: event.currentTarget.checked,
                  }))
                }
                type="checkbox"
              />
              {label}
            </label>
          ))}
          {textInput('Garage / Einstellpl. Nr.', draft.garageNumber, (value) =>
            update((current) => ({ ...current, garageNumber: value })))}
          {textInput('Abstellplatz Nr.', draft.parkingSpaceNumber, (value) =>
            update((current) => ({ ...current, parkingSpaceNumber: value })))}
          {textInput('Weiteres Mietobjekt', draft.additionalObjectLabel, (value) =>
            update((current) => ({ ...current, additionalObjectLabel: value })))}
        </div>

        <h4>Zur Mitbenutzung mit den übrigen Hausbewohnern</h4>
        <div className="tenancy-form-grid">
          {LUZERNER_SHARED_USE_KEYS.map((key) => (
            <label className="tenancy-checkbox" key={key}>
              <input
                checked={draft.sharedUse[key]}
                disabled={controlsDisabled}
                onChange={(event) =>
                  update((current) => ({
                    ...current,
                    sharedUse: {
                      ...current.sharedUse,
                      [key]: event.currentTarget.checked,
                    },
                  }))
                }
                type="checkbox"
              />
              {SHARED_USE_LABELS[key]}
            </label>
          ))}
          {[0, 1].map((index) => (
            <label key={index}>
              Weitere Mitbenutzung {index + 1}
              <input
                disabled={controlsDisabled}
                onChange={(event) =>
                  update((current) => ({
                    ...current,
                    customSharedUse: setCustomSharedUseValue(
                      current.customSharedUse,
                      index,
                      event.currentTarget.value,
                    ),
                  }))
                }
                value={customSharedUseValue(draft.customSharedUse, index)}
              />
            </label>
          ))}
        </div>

        <div className="setup-form-grid">
          <label>
            Benutzungsart
            <select
              disabled={controlsDisabled}
              onChange={(event) =>
                update((current) => ({
                  ...current,
                  useType: event.currentTarget.value as
                    | 'apartment'
                    | 'commercial'
                    | 'other',
                }))
              }
              value={draft.useType}
            >
              <option value="apartment">Wohnung</option>
              <option value="commercial">Gewerbe</option>
              <option value="other">Andere Nutzungsart</option>
            </select>
          </label>
          {textInput('Nutzungsart', draft.useTypeOther, (value) =>
            update((current) => ({ ...current, useTypeOther: value })))}
        </div>
      </details>

      <details open>
        <summary><strong>Mietbeginn · Mietdauer · Kündigung</strong></summary>
        <div className="setup-form-grid">
          {textInput('Mietantritt', draft.moveInDate, (value) =>
            update((current) => ({ ...current, moveInDate: value })), 'date')}
          <label>
            Mietdauer
            <select
              disabled={controlsDisabled}
              onChange={(event) =>
                update((current) => ({
                  ...current,
                  durationKind: event.currentTarget.value as
                    | 'indefinite'
                    | 'minimum_term'
                    | 'fixed_term',
                }))
              }
              value={draft.durationKind}
            >
              <option value="indefinite">auf unbestimmte Zeit</option>
              <option value="minimum_term">
                mit minimaler Laufzeit, erstmals kündbar auf den
              </option>
              <option value="fixed_term">
                mit bestimmter Laufzeit, endet ohne Kündigung am
              </option>
            </select>
          </label>
          {draft.durationKind === 'minimum_term'
            ? textInput('erstmals kündbar auf den', draft.minimumCancelableOn, (value) =>
                update((current) => ({
                  ...current,
                  minimumCancelableOn: value,
                })), 'date')
            : null}
          {draft.durationKind === 'fixed_term'
            ? textInput('endet ohne Kündigung am', draft.fixedEndDate, (value) =>
                update((current) => ({
                  ...current,
                  fixedEndDate: value,
                })), 'date')
            : null}
          <label>
            Kündigungstermine
            <select
              disabled={controlsDisabled}
              onChange={(event) =>
                update((current) => ({
                  ...current,
                  terminationSchedule: event.currentTarget.value as
                    | 'monthly_except_december'
                    | 'quarter_ends'
                    | 'custom',
                }))
              }
              value={draft.terminationSchedule}
            >
              <option value="monthly_except_december">
                auf jedes Monatsende, ausgenommen Ende Dez.
              </option>
              <option value="quarter_ends">
                per 31. März, 30. Juni, 30. Sept.
              </option>
              <option value="custom">Andere</option>
            </select>
          </label>
          {textInput(
            'Kündigungstermin (andere)',
            draft.terminationScheduleCustom,
            (value) =>
              update((current) => ({
                ...current,
                terminationScheduleCustom: value,
              })),
          )}
          <label>
            Kündigungsfristen
            <select
              disabled={controlsDisabled}
              onChange={(event) =>
                update((current) => ({
                  ...current,
                  noticePeriodKind: event.currentTarget.value as
                    | 'residential_3_months'
                    | 'commercial_6_months'
                    | 'furnished_room_14_days'
                    | 'longer_months',
                }))
              }
              value={draft.noticePeriodKind}
            >
              <option value="residential_3_months">3 Monate (Wohnräume)</option>
              <option value="commercial_6_months">6 Monate (Geschäftsräume)</option>
              <option value="furnished_room_14_days">14 Tage (möbl. Zimmer)</option>
              <option value="longer_months">Längere Kündigungsfrist</option>
            </select>
          </label>
          <label>
            Längere Kündigungsfrist: Monate
            <input
              disabled={controlsDisabled}
              min="1"
              onChange={(event) =>
                update((current) => ({
                  ...current,
                  longerNoticeMonths: optionalNumber(
                    event.currentTarget.value,
                  ),
                }))
              }
              type="number"
              value={draft.longerNoticeMonths ?? ''}
            />
          </label>
        </div>
      </details>

      <details open>
        <summary><strong>Mietzins · Nebenkosten</strong></summary>
        <div className="setup-form-grid">
          {textInput('Netto-Mietzins Wohnung / Gewerberaum CHF', draft.netRent, (value) =>
            update((current) => ({ ...current, netRent: value })))}
          {textInput('Brutto-Mietzins Garage, Autoeinstellplatz / Autoabstellplatz CHF', draft.garageParkingRent, (value) =>
            update((current) => ({ ...current, garageParkingRent: value })))}
          {textInput('Nebenkosten Akonto CHF', draft.ancillaryAdvance, (value) =>
            update((current) => ({ ...current, ancillaryAdvance: value })))}
          {textInput('Nebenkosten Pauschal CHF', draft.ancillaryFlat, (value) =>
            update((current) => ({ ...current, ancillaryFlat: value })))}
          <label>
            Zahlbar im Voraus
            <select
              disabled={controlsDisabled}
              onChange={(event) =>
                update((current) => ({
                  ...current,
                  paymentFrequency: event.currentTarget.value as
                    | 'monthly'
                    | 'quarterly'
                    | 'semiannual',
                }))
              }
              value={draft.paymentFrequency}
            >
              <option value="monthly">monatlich</option>
              <option value="quarterly">vierteljährlich</option>
              <option value="semiannual">halbjährlich</option>
            </select>
          </label>
        </div>

        <div className="legal-document-list">
          {LUZERNER_ANCILLARY_COST_KEYS.map((key) => (
            <label className="schema-option-row" key={key}>
              <span>{ANCILLARY_LABELS[key]}</span>
              <select
                disabled={controlsDisabled}
                onChange={(event) =>
                  update((current) => ({
                    ...current,
                    ancillaryCosts: {
                      ...current.ancillaryCosts,
                      [key]: event.currentTarget.value as LuzernerAncillaryCostMode,
                    },
                  }))
                }
                value={draft.ancillaryCosts[key]}
              >
                <option value="excluded">Nicht geschuldet / streichen</option>
                <option value="advance">Akonto</option>
                <option value="flat">Pauschal *</option>
              </select>
            </label>
          ))}
          {[0, 1].map((index) => {
            const value = customAncillaryValue(
              draft.customAncillaryCosts,
              index,
            );
            return (
              <div className="schema-option-row" key={index}>
                <input
                  aria-label={`Weitere Nebenkostenposition ${index + 1}`}
                  disabled={controlsDisabled}
                  onChange={(event) =>
                    update((current) => ({
                      ...current,
                      customAncillaryCosts: setCustomAncillaryValue(
                        current.customAncillaryCosts,
                        index,
                        {
                          ...customAncillaryValue(
                            current.customAncillaryCosts,
                            index,
                          ),
                          label: event.currentTarget.value,
                        },
                      ),
                    }))
                  }
                  placeholder="-"
                  value={value.label}
                />
                <select
                  disabled={controlsDisabled}
                  onChange={(event) =>
                    update((current) => ({
                      ...current,
                      customAncillaryCosts: setCustomAncillaryValue(
                        current.customAncillaryCosts,
                        index,
                        {
                          ...customAncillaryValue(
                            current.customAncillaryCosts,
                            index,
                          ),
                          mode: event.currentTarget.value as LuzernerAncillaryCostMode,
                        },
                      ),
                    }))
                  }
                  value={value.mode}
                >
                  <option value="excluded">Nicht geschuldet</option>
                  <option value="advance">Akonto</option>
                  <option value="flat">Pauschal *</option>
                </select>
              </div>
            );
          })}
        </div>
      </details>

      <details open>
        <summary><strong>Mietzinsanpassung · Sicherheitsleistungen</strong></summary>
        <div className="setup-form-grid">
          <label>
            Mietzinsanpassung
            <select
              disabled={controlsDisabled}
              onChange={(event) =>
                update((current) => ({
                  ...current,
                  rentAdjustmentMode: event.currentTarget.value as
                    | 'termination_date'
                    | 'indexation'
                    | 'graduated',
                }))
              }
              value={draft.rentAdjustmentMode}
            >
              <option value="termination_date">
                auf jeden aufgeführten Kündigungstermin
              </option>
              <option value="indexation">
                mit Indexierung Landesindex der Konsumentenpreise
              </option>
              <option value="graduated">mit Mietzinsstaffel</option>
            </select>
          </label>
          <label>
            Monate im Voraus
            <input
              disabled={controlsDisabled}
              min="0"
              onChange={(event) =>
                update((current) => ({
                  ...current,
                  rentAdjustmentAdvanceMonths: optionalNumber(
                    event.currentTarget.value,
                  ),
                }))
              }
              type="number"
              value={draft.rentAdjustmentAdvanceMonths ?? ''}
            />
          </label>
          {textInput('Landesindex der Konsumentenpreise bei Vertragsabschluss Punkte', draft.consumerPriceIndexPoints, (value) =>
            update((current) => ({ ...current, consumerPriceIndexPoints: value })))}
          <label>
            Stichtag Nebenkostenabrechnung
            <select
              disabled={controlsDisabled}
              onChange={(event) =>
                update((current) => ({
                  ...current,
                  ancillaryClosingDate: event.currentTarget.value as
                    | 'june_30'
                    | 'december_31'
                    | 'custom',
                }))
              }
              value={draft.ancillaryClosingDate}
            >
              <option value="june_30">30. Juni</option>
              <option value="december_31">31. Dezember</option>
              <option value="custom">Anderer Stichtag</option>
            </select>
          </label>
          {textInput('Anderer Stichtag', draft.ancillaryClosingDateCustom, (value) =>
            update((current) => ({ ...current, ancillaryClosingDateCustom: value })))}
          {textInput('Sicherheitsleistungen CHF', draft.securityAmount, (value) =>
            update((current) => ({ ...current, securityAmount: value })))}
          <label className="tenancy-checkbox">
            <input
              checked={draft.tenantNamedDepositAccount}
              disabled={controlsDisabled}
              onChange={(event) =>
                update((current) => ({
                  ...current,
                  tenantNamedDepositAccount: event.currentTarget.checked,
                }))
              }
              type="checkbox"
            />
            Mietzinskautionskonto auf Mieterschaft lautend
          </label>
          {textInput('Mietzinskautionskonto', draft.depositAccountReference, (value) =>
            update((current) => ({ ...current, depositAccountReference: value })))}
          <label>
            Privat-Haftpflicht-Police
            <select
              disabled={controlsDisabled}
              onChange={(event) =>
                update((current) => ({
                  ...current,
                  privateLiabilityPolicy: event.currentTarget.value as
                    | 'yes'
                    | 'no'
                    | 'unset',
                }))
              }
              value={draft.privateLiabilityPolicy}
            >
              <option value="unset">—</option>
              <option value="yes">ja</option>
              <option value="no">nein</option>
            </select>
          </label>
          {textInput('Hypothekarischer Referenzzinssatz', draft.mortgageReferenceRate, (value) =>
            update((current) => ({ ...current, mortgageReferenceRate: value })))}
          {textInput('Kostensteigerung ausgeglichen bis', draft.costIncreaseCompensatedThrough, (value) =>
            update((current) => ({ ...current, costIncreaseCompensatedThrough: value })))}
          {textInput('Landesindex der Konsumentenpreise', draft.consumerPriceIndex, (value) =>
            update((current) => ({ ...current, consumerPriceIndex: value })))}
          {textInput('Monat / Jahr', draft.consumerPriceIndexMonthYear, (value) =>
            update((current) => ({ ...current, consumerPriceIndexMonthYear: value })))}
          {textInput('Basis', draft.consumerPriceIndexBasis, (value) =>
            update((current) => ({ ...current, consumerPriceIndexBasis: value })))}
          {textInput('aufgelaufene Reserve CHF', draft.rentReserveAmount, (value) =>
            update((current) => ({ ...current, rentReserveAmount: value })))}
          {textInput('aufgelaufene Reserve %', draft.rentReservePercent, (value) =>
            update((current) => ({ ...current, rentReservePercent: value })))}
          <label className="tenancy-checkbox">
            <input
              checked={draft.separateRentReserveAgreement}
              disabled={controlsDisabled}
              onChange={(event) =>
                update((current) => ({
                  ...current,
                  separateRentReserveAgreement: event.currentTarget.checked,
                }))
              }
              type="checkbox"
            />
            Berechnung gemäss separater Vereinbarung, Formular Mietzinsreserve
          </label>
        </div>
      </details>

      <details open>
        <summary><strong>Bemerkungen · Beilagen · Besondere Bestimmungen</strong></summary>
        <div className="setup-form-grid">
          <label>
            Bemerkungen / Beilagen
            <textarea
              disabled={controlsDisabled}
              onChange={(event) =>
                update((current) => ({
                  ...current,
                  remarksAttachments: event.currentTarget.value,
                }))
              }
              rows={5}
              value={draft.remarksAttachments}
            />
          </label>
          <label className="tenancy-checkbox">
            <input
              checked={draft.initialRentFormAttached}
              disabled={controlsDisabled}
              onChange={(event) =>
                update((current) => ({
                  ...current,
                  initialRentFormAttached: event.currentTarget.checked,
                }))
              }
              type="checkbox"
            />
            Formular Anfangsmietzins
          </label>
          <label>
            Besondere Bestimmungen
            <textarea
              disabled={controlsDisabled}
              onChange={(event) =>
                update((current) => ({
                  ...current,
                  specialProvisions: event.currentTarget.value,
                }))
              }
              rows={10}
              value={draft.specialProvisions}
            />
          </label>
          {textInput('Ort', draft.placeOfSigning, (value) =>
            update((current) => ({ ...current, placeOfSigning: value })))}
          {textInput('Datum', draft.signingDate, (value) =>
            update((current) => ({ ...current, signingDate: value })), 'date')}
        </div>
      </details>

      <div className="setup-form-actions">
        <span className="setup-hint">
          Property, Unit and Party identity stay canonical outside this
          template-specific draft. PDF generation will consume both sources.
        </span>
        <button
          className="button-primary"
          disabled={
            controlsDisabled ||
            !dirty
          }
          onClick={() => void save()}
          type="button"
        >
          {saving ? 'Saving…' : 'Save Luzerner contract data'}
        </button>
      </div>
    </section>
  );
}
