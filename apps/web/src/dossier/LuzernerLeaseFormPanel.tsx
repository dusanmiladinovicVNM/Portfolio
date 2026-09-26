import {
  luzernerLeaseFormDataSchema,
  nullableLuzernerLeaseFormProfileResponseSchema,
  upsertLuzernerLeaseFormRequestSchema,
  type LeaseAgreementResponse,
  type LuzernerLeaseFormDataRequest,
  type LuzernerLeaseFormProfileResponse,
} from '@portfolio/contracts';
import {
  LUZERNER_ANCILLARY_COST_KEYS,
  LUZERNER_ANCILLARY_TREATMENTS,
  LUZERNER_LEASE_DURATION_MODES,
  LUZERNER_LEASE_USE_TYPES,
  LUZERNER_LIABILITY_INSURANCE_VALUES,
  LUZERNER_RENT_ADJUSTMENT_MODES,
  LUZERNER_SETTLEMENT_CUTOFF_MODES,
  LUZERNER_TERMINATION_DATE_MODES,
} from '@portfolio/domain';
import {
  type FormEvent,
  useEffect,
  useRef,
  useState,
} from 'react';
import { agreementLuzernerFormPath } from '../api/paths.js';
import {
  isAmbiguousWriteFailure,
  type PortfolioApi,
} from '../api/portfolio-api.js';
import type { SetNavigationBlocker } from '../navigation/use-workspace-navigation.js';
import { formatDetailKey } from '../presentation/format.js';
import {
  emptyLuzernerLeaseFormData,
  luzernerLeaseFormDataFromFormData,
  sameLuzernerLeaseFormData,
} from './luzerner-lease-form.js';

interface LuzernerLeaseFormPanelProps {
  readonly api: PortfolioApi;
  readonly agreement: LeaseAgreementResponse;
  readonly setNavigationBlocker: SetNavigationBlocker;
}

const ancillaryLabels: Readonly<Record<
  (typeof LUZERNER_ANCILLARY_COST_KEYS)[number],
  string
>> = {
  heating_hot_water: 'Heating + hot water',
  cold_water: 'Cold water',
  caretaking_stair_cleaning: 'Caretaking + stair cleaning',
  garden_snow: 'Garden / surroundings / snow',
  lift: 'Lift service',
  general_energy: 'General electricity + gas',
  ara_kva_sewer: 'ARA / KVA / sewer operating fees',
  tv_cable: 'TV cable connection',
  laundry: 'Laundry equipment operating costs',
  administration: 'Ancillary-cost administration',
};

function optionLabel(value: string): string {
  if (value === 'not_recorded') return 'Not recorded';
  if (value === 'excluded') return 'Not applicable / strike out';
  if (value === 'advance') return 'Akonto';
  if (value === 'flat') return 'Pauschal';
  return formatDetailKey(value);
}

function checkbox(
  label: string,
  name: keyof LuzernerLeaseFormDataRequest,
  checked: boolean,
  disabled: boolean,
) {
  return (
    <label className="schema-builder-check" key={String(name)}>
      <input
        defaultChecked={checked}
        disabled={disabled}
        name={String(name)}
        type="checkbox"
      />
      {label}
    </label>
  );
}

function Choice({
  name,
  value,
  values,
  disabled,
  emptyLabel = 'Not recorded',
}: {
  readonly name: string;
  readonly value: string | null;
  readonly values: readonly string[];
  readonly disabled: boolean;
  readonly emptyLabel?: string;
}) {
  return (
    <select defaultValue={value ?? ''} disabled={disabled} name={name}>
      <option value="">{emptyLabel}</option>
      {values.map((entry) => (
        <option key={entry} value={entry}>
          {formatDetailKey(entry)}
        </option>
      ))}
    </select>
  );
}

function FormFields({
  data,
  disabled,
}: {
  readonly data: LuzernerLeaseFormDataRequest;
  readonly disabled: boolean;
}) {
  return (
    <div className="luzerner-form-sections">
      <section className="luzerner-form-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Page 1 · Mietobjekt</p>
            <h3>Object and use</h3>
          </div>
          <span className="section-note">
            Property / Unit / Party identities stay canonical elsewhere
          </span>
        </div>

        <div className="setup-form-grid">
          <label>
            Persons
            <input
              defaultValue={data.occupantsCount ?? ''}
              disabled={disabled}
              max="99"
              min="1"
              name="occupantsCount"
              type="number"
            />
          </label>
          <label>
            Use
            <Choice
              disabled={disabled}
              name="useType"
              value={data.useType}
              values={LUZERNER_LEASE_USE_TYPES}
            />
          </label>
          <label>
            Custom use
            <input
              defaultValue={data.customUse ?? ''}
              disabled={disabled}
              name="customUse"
            />
          </label>
        </div>

        <div className="luzerner-check-grid">
          {checkbox('Family dwelling', 'familyDwelling', data.familyDwelling, disabled)}
          {checkbox(
            'Registered partnership',
            'registeredPartnership',
            data.registeredPartnership,
            disabled,
          )}
          {checkbox('Furnished', 'furnished', data.furnished, disabled)}
          {checkbox('Separate room', 'separateRoom', data.separateRoom, disabled)}
          {checkbox('Cellar', 'cellar', data.cellar, disabled)}
          {checkbox('Attic', 'attic', data.attic, disabled)}
          {checkbox(
            'Separate apartment',
            'separateApartment',
            data.separateApartment,
            disabled,
          )}
          {checkbox('Garage / Einstellplatz', 'garage', data.garage, disabled)}
          {checkbox(
            'Parking space',
            'parkingSpace',
            data.parkingSpace,
            disabled,
          )}
        </div>

        <div className="setup-form-grid">
          <label>
            Garage / Einstellplatz number
            <input
              defaultValue={data.garageNumber ?? ''}
              disabled={disabled}
              name="garageNumber"
            />
          </label>
          <label>
            Parking-space number
            <input
              defaultValue={data.parkingSpaceNumber ?? ''}
              disabled={disabled}
              name="parkingSpaceNumber"
            />
          </label>
          <label>
            Additional object 1
            <input
              defaultValue={data.additionalObjects[0] ?? ''}
              disabled={disabled}
              name="additionalObject1"
            />
          </label>
          <label>
            Additional object 2
            <input
              defaultValue={data.additionalObjects[1] ?? ''}
              disabled={disabled}
              name="additionalObject2"
            />
          </label>
        </div>
      </section>

      <section className="luzerner-form-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Page 1 · Mitbenutzung</p>
            <h3>Shared facilities</h3>
          </div>
        </div>
        <div className="luzerner-check-grid">
          {checkbox(
            'Laundry room',
            'sharedLaundryRoom',
            data.sharedLaundryRoom,
            disabled,
          )}
          {checkbox(
            'Drying room',
            'sharedDryingRoom',
            data.sharedDryingRoom,
            disabled,
          )}
          {checkbox(
            'Clothes line area',
            'sharedClothesLine',
            data.sharedClothesLine,
            disabled,
          )}
          {checkbox(
            'Stroller storage',
            'sharedStrollerStorage',
            data.sharedStrollerStorage,
            disabled,
          )}
          {checkbox('Garden', 'sharedGarden', data.sharedGarden, disabled)}
          {checkbox(
            'Hobby room',
            'sharedHobbyRoom',
            data.sharedHobbyRoom,
            disabled,
          )}
          {checkbox(
            'Playground',
            'sharedPlayground',
            data.sharedPlayground,
            disabled,
          )}
          {checkbox(
            'Bicycle / moped storage',
            'sharedBicycleMopedStorage',
            data.sharedBicycleMopedStorage,
            disabled,
          )}
        </div>
        <div className="setup-form-grid">
          <label>
            Shared-use extra 1
            <input
              defaultValue={data.sharedUseExtras[0] ?? ''}
              disabled={disabled}
              name="sharedUseExtra1"
            />
          </label>
          <label>
            Shared-use extra 2
            <input
              defaultValue={data.sharedUseExtras[1] ?? ''}
              disabled={disabled}
              name="sharedUseExtra2"
            />
          </label>
        </div>
      </section>

      <section className="luzerner-form-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Page 1 · Mietdauer</p>
            <h3>Entry, duration and termination dates</h3>
          </div>
          <span className="section-note">
            Mietbeginn comes from Agreement effectiveFrom
          </span>
        </div>
        <div className="setup-form-grid">
          <label>
            Mietantritt / handover date
            <input
              defaultValue={data.handoverDate ?? ''}
              disabled={disabled}
              name="handoverDate"
              type="date"
            />
          </label>
          <label>
            Duration mode
            <Choice
              disabled={disabled}
              name="durationMode"
              value={data.durationMode}
              values={LUZERNER_LEASE_DURATION_MODES}
            />
          </label>
          <label>
            First termination date for minimum duration
            <input
              defaultValue={data.minimumFirstTerminationDate ?? ''}
              disabled={disabled}
              name="minimumFirstTerminationDate"
              type="date"
            />
          </label>
          <label>
            Termination dates
            <Choice
              disabled={disabled}
              name="terminationDateMode"
              value={data.terminationDateMode}
              values={LUZERNER_TERMINATION_DATE_MODES}
            />
          </label>
        </div>
      </section>

      <section className="luzerner-form-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Page 2 · Nebenkosten</p>
            <h3>Ancillary-cost treatment</h3>
          </div>
          <span className="section-note">
            Amounts come from immutable signed tenancy terms
          </span>
        </div>
        <div className="luzerner-ancillary-grid">
          {LUZERNER_ANCILLARY_COST_KEYS.map((key) => (
            <label key={key}>
              {ancillaryLabels[key]}
              <select
                defaultValue={data.ancillaryCosts[key]}
                disabled={disabled}
                name={`ancillary_${key}`}
              >
                {LUZERNER_ANCILLARY_TREATMENTS.map((value) => (
                  <option key={value} value={value}>
                    {optionLabel(value)}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
        {[0, 1].map((index) => (
          <div className="setup-form-grid" key={index}>
            <label>
              Custom ancillary row {index + 1}
              <input
                defaultValue={data.customAncillaryCosts[index]?.label ?? ''}
                disabled={disabled}
                name={`customAncillaryLabel${index + 1}`}
              />
            </label>
            <label>
              Treatment
              <select
                defaultValue={
                  data.customAncillaryCosts[index]?.treatment ??
                  'not_recorded'
                }
                disabled={disabled}
                name={`customAncillaryTreatment${index + 1}`}
              >
                {LUZERNER_ANCILLARY_TREATMENTS.map((value) => (
                  <option key={value} value={value}>
                    {optionLabel(value)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ))}
      </section>

      <section className="luzerner-form-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Page 2 · Mietzins</p>
            <h3>Adjustment, settlement and security</h3>
          </div>
        </div>
        <div className="setup-form-grid">
          <label>
            Rent-adjustment method
            <Choice
              disabled={disabled}
              name="rentAdjustmentMode"
              value={data.rentAdjustmentMode}
              values={LUZERNER_RENT_ADJUSTMENT_MODES}
            />
          </label>
          <label>
            Adjustment notice months
            <input
              defaultValue={data.adjustmentNoticeMonths ?? ''}
              disabled={disabled}
              min="1"
              name="adjustmentNoticeMonths"
              type="number"
            />
          </label>
          <label>
            Index points at contract
            <input
              defaultValue={data.indexPointsAtContract ?? ''}
              disabled={disabled}
              inputMode="decimal"
              name="indexPointsAtContract"
            />
          </label>
          <label>
            Ancillary settlement cutoff
            <Choice
              disabled={disabled}
              name="settlementCutoffMode"
              value={data.settlementCutoffMode}
              values={LUZERNER_SETTLEMENT_CUTOFF_MODES}
            />
          </label>
          <label>
            Custom settlement cutoff date
            <input
              defaultValue={data.customSettlementCutoffDate ?? ''}
              disabled={disabled}
              name="customSettlementCutoffDate"
              type="date"
            />
          </label>
          <label>
            Private liability insurance
            <select
              defaultValue={data.liabilityInsurance}
              disabled={disabled}
              name="liabilityInsurance"
            >
              {LUZERNER_LIABILITY_INSURANCE_VALUES.map((value) => (
                <option key={value} value={value}>
                  {formatDetailKey(value)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Reference interest rate
            <input
              defaultValue={data.referenceInterestRate ?? ''}
              disabled={disabled}
              inputMode="decimal"
              name="referenceInterestRate"
            />
          </label>
          <label>
            Cost increase balanced until
            <input
              defaultValue={data.costIncreaseBalancedUntil ?? ''}
              disabled={disabled}
              name="costIncreaseBalancedUntil"
              type="date"
            />
          </label>
          <label>
            Consumer price index
            <input
              defaultValue={data.consumerPriceIndex ?? ''}
              disabled={disabled}
              inputMode="decimal"
              name="consumerPriceIndex"
            />
          </label>
          <label>
            CPI month / year
            <input
              defaultValue={data.consumerPriceIndexMonthYear ?? ''}
              disabled={disabled}
              name="consumerPriceIndexMonthYear"
              placeholder="09.2026"
            />
          </label>
          <label>
            CPI basis
            <input
              defaultValue={data.consumerPriceIndexBasis ?? ''}
              disabled={disabled}
              name="consumerPriceIndexBasis"
            />
          </label>
          <label>
            Incomplete adjustment reserve CHF
            <input
              defaultValue={data.incompleteAdjustmentReserveAmount ?? ''}
              disabled={disabled}
              inputMode="decimal"
              name="incompleteAdjustmentReserveAmount"
            />
          </label>
          <label>
            Incomplete adjustment reserve %
            <input
              defaultValue={data.incompleteAdjustmentReservePercent ?? ''}
              disabled={disabled}
              inputMode="decimal"
              name="incompleteAdjustmentReservePercent"
            />
          </label>
        </div>
        <div className="luzerner-check-grid">
          {checkbox(
            'Deposit account on tenant name',
            'depositAccountOnTenantName',
            data.depositAccountOnTenantName,
            disabled,
          )}
          {checkbox(
            'Initial-rent form attached',
            'initialRentFormAttached',
            data.initialRentFormAttached,
            disabled,
          )}
        </div>
      </section>

      <section className="luzerner-form-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Pages 2 + 8</p>
            <h3>Remarks and special provisions</h3>
          </div>
        </div>
        <label>
          Remarks / attachments
          <textarea
            defaultValue={data.remarksAndAttachments}
            disabled={disabled}
            maxLength={3000}
            name="remarksAndAttachments"
            rows={5}
          />
        </label>
        <label>
          Special provisions
          <textarea
            defaultValue={data.specialProvisions}
            disabled={disabled}
            maxLength={5000}
            name="specialProvisions"
            rows={8}
          />
        </label>
        <label>
          Contract place
          <input
            defaultValue={data.contractPlace ?? ''}
            disabled={disabled}
            name="contractPlace"
          />
        </label>
      </section>
    </div>
  );
}

export function LuzernerLeaseFormPanel({
  api,
  agreement,
  setNavigationBlocker,
}: LuzernerLeaseFormPanelProps) {
  const [profile, setProfile] =
    useState<LuzernerLeaseFormProfileResponse | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState(false);
  const [outcomeAmbiguous, setOutcomeAmbiguous] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const activeAgreementIdRef = useRef(agreement.id);
  activeAgreementIdRef.current = agreement.id;

  async function readCanonical() {
    return api.get(
      agreementLuzernerFormPath(agreement.id),
      nullableLuzernerLeaseFormProfileResponseSchema,
    );
  }

  useEffect(() => {
    mountedRef.current = true;
    const controller = new AbortController();
    const targetAgreementId = agreement.id;
    setLoaded(false);
    setProfile(null);
    setDirty(false);
    setOutcomeAmbiguous(false);
    setError(null);
    setSuccess(null);

    void api
      .get(
        agreementLuzernerFormPath(targetAgreementId),
        nullableLuzernerLeaseFormProfileResponseSchema,
        { signal: controller.signal },
      )
      .then((canonical) => {
        if (
          controller.signal.aborted ||
          activeAgreementIdRef.current !== targetAgreementId
        ) {
          return;
        }
        setProfile(canonical);
        setLoaded(true);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setLoaded(true);
        setError(
          cause instanceof Error
            ? cause.message
            : 'Luzerner lease form could not be loaded.',
        );
      });

    return () => {
      controller.abort();
      mountedRef.current = false;
    };
  }, [agreement.id, api]);

  useEffect(() => {
    if (pending || outcomeAmbiguous) {
      setNavigationBlocker(() => false);
      return () => setNavigationBlocker(null);
    }
    if (dirty) {
      setNavigationBlocker(() =>
        window.confirm(
          'This Luzerner Mietvertrag form has unsaved changes. Leave and discard them?',
        ),
      );
      return () => setNavigationBlocker(null);
    }
    setNavigationBlocker(null);
    return () => setNavigationBlocker(null);
  }, [dirty, outcomeAmbiguous, pending, setNavigationBlocker]);

  const data = profile?.data ?? emptyLuzernerLeaseFormData();
  const editable = agreement.status === 'draft';

  async function reloadCanonical() {
    const targetAgreementId = agreement.id;
    setPending(true);
    setError(null);
    setSuccess(null);
    try {
      const canonical = await readCanonical();
      if (
        !mountedRef.current ||
        activeAgreementIdRef.current !== targetAgreementId
      ) {
        return;
      }
      setProfile(canonical);
      setDirty(false);
      setOutcomeAmbiguous(false);
      setSuccess('Canonical Luzerner form state reloaded.');
    } catch (cause) {
      if (
        mountedRef.current &&
        activeAgreementIdRef.current === targetAgreementId
      ) {
        setError(
          cause instanceof Error
            ? cause.message
            : 'Canonical Luzerner form could not be reloaded.',
        );
      }
    } finally {
      if (
        mountedRef.current &&
        activeAgreementIdRef.current === targetAgreementId
      ) {
        setPending(false);
      }
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editable || pending || outcomeAmbiguous) return;

    const targetAgreementId = agreement.id;
    const form = event.currentTarget;
    const candidate = luzernerLeaseFormDataFromFormData(
      new FormData(form),
    );
    const parsedData = luzernerLeaseFormDataSchema.safeParse(candidate);
    if (!parsedData.success) {
      setError(
        parsedData.error.issues[0]?.message ??
          'Luzerner lease form contains invalid values.',
      );
      return;
    }

    const expectedRevision = profile?.revision ?? 0;
    const parsedRequest = upsertLuzernerLeaseFormRequestSchema.safeParse({
      expectedRevision,
      data: parsedData.data,
    });
    if (!parsedRequest.success) {
      setError('Luzerner lease form does not match the API contract.');
      return;
    }

    setPending(true);
    setError(null);
    setSuccess(null);
    try {
      const saved = await api.patch(
        agreementLuzernerFormPath(targetAgreementId),
        parsedRequest.data,
        // The response and read contract are the same non-null profile.
        { safeParse: (value) => {
          const parsed =
            nullableLuzernerLeaseFormProfileResponseSchema.safeParse(value);
          return parsed.success && parsed.data !== null
            ? { success: true as const, data: parsed.data }
            : { success: false as const, error: parsed };
        } },
      );
      if (
        !mountedRef.current ||
        activeAgreementIdRef.current !== targetAgreementId
      ) {
        return;
      }
      setProfile(saved);
      setDirty(false);
      setOutcomeAmbiguous(false);
      setSuccess(`Luzerner form saved at revision ${saved.revision}.`);
    } catch (cause) {
      if (
        !mountedRef.current ||
        activeAgreementIdRef.current !== targetAgreementId
      ) {
        return;
      }

      if (!isAmbiguousWriteFailure(cause)) {
        setError(
          cause instanceof Error
            ? cause.message
            : 'Luzerner lease form could not be saved.',
        );
        return;
      }

      setOutcomeAmbiguous(true);
      setError(
        'Save outcome is uncertain. Navigation and another Save are blocked while canonical state is checked.',
      );

      try {
        const canonical = await readCanonical();
        if (
          !mountedRef.current ||
          activeAgreementIdRef.current !== targetAgreementId
        ) {
          return;
        }

        if (
          canonical !== null &&
          canonical.revision === expectedRevision + 1 &&
          sameLuzernerLeaseFormData(
            canonical.data,
            parsedRequest.data.data,
          )
        ) {
          setProfile(canonical);
          setDirty(false);
          setOutcomeAmbiguous(false);
          setError(null);
          setSuccess(
            `Luzerner form save recovered from canonical revision ${canonical.revision}.`,
          );
          return;
        }

        setError(
          'Save outcome remains uncertain. Reload canonical form state before editing or saving again.',
        );
      } catch (rereadCause) {
        if (
          mountedRef.current &&
          activeAgreementIdRef.current === targetAgreementId
        ) {
          setError(
            `Save outcome is uncertain and canonical reread failed: ${
              rereadCause instanceof Error
                ? rereadCause.message
                : 'request failed'
            }. Reload canonical form state before continuing.`,
          );
        }
      }
    } finally {
      if (
        mountedRef.current &&
        activeAgreementIdRef.current === targetAgreementId
      ) {
        setPending(false);
      }
    }
  }

  if (!loaded) {
    return (
      <section className="panel">
        <p className="eyebrow">Luzerner Mietvertrag</p>
        <p className="muted">Loading canonical form data…</p>
      </section>
    );
  }

  return (
    <section className="panel luzerner-form-panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Luzerner Mietvertrag · Ausgabe 2020</p>
          <h2>Contract form data</h2>
          <p className="muted">
            This stores only template-specific legal choices. Property, Unit,
            Party, Tenancy and signed rent terms remain canonical at their own
            domain grain.
          </p>
        </div>
        <div className="schema-builder-button-row">
          {profile ? (
            <span className="status-chip">revision {profile.revision}</span>
          ) : (
            <span className="status-chip">not saved</span>
          )}
          <span className="status-chip">
            {profile?.templateDocumentVersionId
              ? 'template linked'
              : 'template pending'}
          </span>
        </div>
      </div>

      {agreement.status !== 'draft' ? (
        <p className="inspection-review-warning">
          Agreement is {agreement.status}. Luzerner form data is immutable
          after the Agreement leaves draft status.
        </p>
      ) : null}

      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {success ? <p className="form-success" role="status">{success}</p> : null}

      {outcomeAmbiguous ? (
        <div className="schema-builder-ambiguity" role="alert">
          <strong>Save outcome is uncertain.</strong>
          <p>
            Do not issue another write until canonical state has been
            explicitly reloaded.
          </p>
          <button
            className="button-secondary"
            disabled={pending}
            onClick={() => void reloadCanonical()}
            type="button"
          >
            Reload canonical form state
          </button>
        </div>
      ) : null}

      {!profile && agreement.status !== 'draft' ? (
        <p className="muted">
          No Luzerner form profile was captured before this Agreement became
          immutable.
        </p>
      ) : (
        <form
          key={`${agreement.id}:${profile?.revision ?? 0}`}
          onChange={() => {
            if (editable) setDirty(true);
          }}
          onSubmit={(event) => void save(event)}
        >
          <FormFields data={data} disabled={!editable || pending} />
          {editable ? (
            <div className="setup-form-actions">
              <span className="setup-hint">
                Exact PDF generation will require a licensed blank template and
                a complete canonical readiness check.
              </span>
              <button
                className="button-primary"
                disabled={pending || outcomeAmbiguous || !dirty}
                type="submit"
              >
                {pending ? 'Saving…' : 'Save Luzerner form'}
              </button>
            </div>
          ) : null}
        </form>
      )}
    </section>
  );
}
