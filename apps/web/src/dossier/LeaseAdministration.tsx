import {
  contractVersionRequestSchema,
  createLeaseAgreementRequestSchema,
  createLeaseAmendmentRequestSchema,
  leaseAgreementResponseSchema,
  leaseAmendmentResponseSchema,
  partyListResponseSchema,
  signLeaseAgreementRequestSchema,
  signLeaseAmendmentRequestSchema,
  type LeaseAgreementResponse,
  type LeaseAmendmentResponse,
  type PartyResponse,
  type TenancyResponse,
} from '@portfolio/contracts';
import {
  BILLING_FREQUENCIES,
  LEASE_AGREEMENT_TYPES,
  type LeaseAgreementType,
} from '@portfolio/domain';
import {
  type FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  agreementAmendmentsPath,
  agreementCancelPath,
  agreementSignPath,
  amendmentCancelPath,
  amendmentSignPath,
  partiesPath,
  tenancyAgreementsPath,
} from '../api/paths.js';
import {
  PortfolioApiError,
  type PortfolioApi,
} from '../api/portfolio-api.js';
import {
  contractErrorMessage,
  optionalString,
  requiredString,
} from '../admin/form-utils.js';
import type { NavigateWorkspace } from '../navigation/use-workspace-navigation.js';
import { unitRoute } from '../navigation/workspace-route.js';
import { formatDetailKey } from '../presentation/format.js';
import {
  assertAgreementMutationOwner,
  assertAmendmentMutationOwner,
} from './contract-owner.js';

interface LeaseAdministrationProps {
  readonly api: PortfolioApi;
  readonly propertyId: string;
  readonly unitId: string;
  readonly asOf: string;
  readonly tenancy: TenancyResponse;
  readonly agreements: readonly LeaseAgreementResponse[];
  readonly agreement: LeaseAgreementResponse | null;
  readonly amendments: readonly LeaseAmendmentResponse[] | null;
  readonly amendment: LeaseAmendmentResponse | null;
  readonly navigate: NavigateWorkspace;
  readonly onCanonicalWrite: () => void;
}

function integerOrUndefined(form: FormData, name: string): number | undefined {
  const value = String(form.get(name) ?? '').trim();
  return value === '' ? undefined : Number(value);
}

function termsFromForm(form: FormData) {
  return {
    currency: requiredString(form, 'currency'),
    baseRent: requiredString(form, 'baseRent'),
    serviceCharge: optionalString(form, 'serviceCharge'),
    utilitiesAdvance: optionalString(form, 'utilitiesAdvance'),
    parkingRent: optionalString(form, 'parkingRent'),
    otherRecurringCharge: optionalString(form, 'otherRecurringCharge'),
    depositRequired: optionalString(form, 'depositRequired'),
    billingFrequency: requiredString(form, 'billingFrequency'),
    noticePeriodTenantDays: integerOrUndefined(
      form,
      'noticePeriodTenantDays',
    ),
    noticePeriodLandlordDays: integerOrUndefined(
      form,
      'noticePeriodLandlordDays',
    ),
  };
}

function TermsSnapshotFields() {
  return (
    <div className="contract-admin-terms">
      <div className="tenancy-form-heading">
        <strong>Complete legal terms snapshot</strong>
        <span>Signing appends immutable effective terms</span>
      </div>
      <div className="setup-form-grid">
        <label>
          Currency
          <input
            defaultValue="CHF"
            maxLength={3}
            minLength={3}
            name="currency"
            required
          />
        </label>
        <label>
          Base rent
          <input
            inputMode="decimal"
            name="baseRent"
            placeholder="1800.00"
            required
          />
        </label>
        <label>
          Service charge
          <input inputMode="decimal" name="serviceCharge" placeholder="0.00" />
        </label>
        <label>
          Utilities advance
          <input
            inputMode="decimal"
            name="utilitiesAdvance"
            placeholder="0.00"
          />
        </label>
        <label>
          Parking rent
          <input inputMode="decimal" name="parkingRent" placeholder="0.00" />
        </label>
        <label>
          Other recurring
          <input
            inputMode="decimal"
            name="otherRecurringCharge"
            placeholder="0.00"
          />
        </label>
        <label>
          Deposit required
          <input
            inputMode="decimal"
            name="depositRequired"
            placeholder="0.00"
          />
        </label>
        <label>
          Billing frequency
          <select defaultValue="monthly" name="billingFrequency">
            {BILLING_FREQUENCIES.map((value) => (
              <option key={value} value={value}>
                {formatDetailKey(value)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Tenant notice days
          <input min="0" name="noticePeriodTenantDays" step="1" type="number" />
        </label>
        <label>
          Landlord notice days
          <input
            min="0"
            name="noticePeriodLandlordDays"
            step="1"
            type="number"
          />
        </label>
      </div>
    </div>
  );
}

function AgreementCreateForm({
  agreements,
  parties,
  pending,
  tenancy,
  onSubmit,
}: {
  readonly agreements: readonly LeaseAgreementResponse[];
  readonly parties: readonly PartyResponse[] | null;
  readonly pending: boolean;
  readonly tenancy: TenancyResponse;
  readonly onSubmit: (
    event: FormEvent<HTMLFormElement>,
    agreementType: LeaseAgreementType,
  ) => void;
}) {
  const hasInitial = agreements.some(
    (agreement) =>
      agreement.agreementType === 'initial' &&
      agreement.status !== 'cancelled',
  );
  const [agreementType, setAgreementType] = useState<LeaseAgreementType>(
    hasInitial ? 'replacement' : 'initial',
  );
  const legalAgreementType: LeaseAgreementType = hasInitial
    ? agreementType === 'initial'
      ? 'replacement'
      : agreementType
    : 'initial';

  const activeParties = useMemo(
    () =>
      [...(parties ?? [])]
        .filter((party) => party.status === 'active')
        .sort((left, right) =>
          left.displayName.localeCompare(right.displayName),
        ),
    [parties],
  );
  const tenancyLegalParties = tenancy.parties.filter(
    (party) =>
      party.role === 'tenant' ||
      party.role === 'co_tenant' ||
      party.role === 'guarantor',
  );
  const availablePredecessors = agreements.filter(
    (candidate) =>
      candidate.status === 'signed' &&
      !agreements.some(
        (possibleSuccessor) =>
          possibleSuccessor.predecessorAgreementId === candidate.id &&
          possibleSuccessor.status !== 'cancelled',
      ),
  );

  return (
    <form
      className="setup-form contract-admin-form"
      data-contract-form="agreement-create"
      onSubmit={(event) => onSubmit(event, legalAgreementType)}
    >
      <div className="section-heading">
        <div>
          <p className="eyebrow">Legal record</p>
          <h3>Create Agreement draft</h3>
        </div>
        <span className="section-note">
          Party composition becomes immutable after signing
        </span>
      </div>

      <div className="setup-form-grid">
        <label>
          Agreement code
          <input name="code" placeholder="AGR-2026-001" required />
        </label>
        <label>
          Agreement type
          <select
            disabled={pending}
            name="agreementType"
            onChange={(event) =>
              setAgreementType(
                event.currentTarget.value as LeaseAgreementType,
              )
            }
            value={legalAgreementType}
          >
            {LEASE_AGREEMENT_TYPES.map((value) => (
              <option
                disabled={value === 'initial' && hasInitial}
                key={value}
                value={value}
              >
                {formatDetailKey(value)}
              </option>
            ))}
          </select>
        </label>
        {legalAgreementType !== 'initial' ? (
          <label>
            Predecessor
            <select disabled={pending} name="predecessorAgreementId" required>
              <option value="">Select signed predecessor…</option>
              {availablePredecessors.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.code} · {candidate.effectiveFrom}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label>
          Effective from
          <input disabled={pending} name="effectiveFrom" required type="date" />
        </label>
        <label>
          Effective to
          <input disabled={pending} name="effectiveTo" type="date" />
        </label>
        <label>
          Landlord
          <select
            disabled={pending || parties === null}
            name="landlordPartyId"
            required
          >
            <option value="">Select Party…</option>
            {activeParties.map((party) => (
              <option key={party.id} value={party.id}>
                {party.displayName} · {party.code}
              </option>
            ))}
          </select>
        </label>
        <label>
          Authorized signatory
          <select
            disabled={pending || parties === null}
            name="authorizedSignatoryPartyId"
          >
            <option value="">None</option>
            {activeParties.map((party) => (
              <option key={party.id} value={party.id}>
                {party.displayName} · {party.code}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="setup-subsection">
        <h3>Tenancy Parties on legal record</h3>
        {tenancyLegalParties.length === 0 ? (
          <p className="setup-form-error">
            This Tenancy has no tenant/co-tenant Party available for an Agreement.
          </p>
        ) : (
          <div className="contract-party-checklist">
            {tenancyLegalParties.map((party) => (
              <label key={party.id}>
                <input
                  defaultChecked={
                    party.role === 'tenant' || party.role === 'co_tenant'
                  }
                  disabled={pending}
                  name="tenancyParty"
                  type="checkbox"
                  value={`${party.partyId}:${party.role}`}
                />
                <span>
                  {parties?.find((item) => item.id === party.partyId)
                    ?.displayName ?? party.partyId}
                  {' · '}
                  {formatDetailKey(party.role)}
                </span>
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="setup-form-actions">
        <span className="setup-hint">
          Renewal/replacement requires one currently signed predecessor with no
          live successor.
        </span>
        <button
          className="button-primary"
          disabled={
            pending ||
            parties === null ||
            tenancyLegalParties.every((party) => party.role === 'guarantor')
          }
          type="submit"
        >
          Create Agreement draft
        </button>
      </div>
    </form>
  );
}

function AgreementDraftActions({
  agreement,
  pending,
  onCancel,
  onSign,
}: {
  readonly agreement: LeaseAgreementResponse;
  readonly pending: boolean;
  readonly onCancel: (agreement: LeaseAgreementResponse) => void;
  readonly onSign: (
    event: FormEvent<HTMLFormElement>,
    agreement: LeaseAgreementResponse,
  ) => void;
}) {
  return (
    <div className="contract-admin-actions">
      <form
        className="setup-form contract-admin-form"
        data-contract-form="agreement-sign"
        onSubmit={(event) => onSign(event, agreement)}
      >
        <div className="section-heading">
          <div>
            <p className="eyebrow">Agreement lifecycle</p>
            <h3>Sign {agreement.code}</h3>
          </div>
          <span className="section-note">CAS v{agreement.version}</span>
        </div>
        <label>
          Signed on
          <input disabled={pending} name="signedAt" required type="date" />
        </label>
        <TermsSnapshotFields />
        <button className="button-primary" disabled={pending} type="submit">
          Sign Agreement
        </button>
      </form>

      <div className="contract-terminal-box">
        <div>
          <strong>Cancel draft</strong>
          <p className="setup-hint">
            Cancellation is only valid while the Agreement remains draft.
          </p>
        </div>
        <button
          className="button-secondary"
          disabled={pending}
          onClick={() => onCancel(agreement)}
          type="button"
        >
          Cancel Agreement
        </button>
      </div>
    </div>
  );
}

function AmendmentCreateForm({
  agreement,
  pending,
  onSubmit,
}: {
  readonly agreement: LeaseAgreementResponse;
  readonly pending: boolean;
  readonly onSubmit: (
    event: FormEvent<HTMLFormElement>,
    agreement: LeaseAgreementResponse,
  ) => void;
}) {
  return (
    <form
      className="setup-form contract-admin-form"
      data-contract-form="amendment-create"
      onSubmit={(event) => onSubmit(event, agreement)}
    >
      <div className="section-heading">
        <div>
          <p className="eyebrow">Legal change</p>
          <h3>Create Amendment draft</h3>
        </div>
        <span className="section-note">
          Available only while Agreement is signed
        </span>
      </div>
      <div className="setup-form-grid">
        <label>
          Amendment code
          <input name="code" placeholder="AMD-2026-001" required />
        </label>
        <label>
          Title
          <input name="title" placeholder="Rent adjustment" required />
        </label>
        <label>
          Effective from
          <input disabled={pending} name="effectiveFrom" required type="date" />
        </label>
      </div>
      <label>
        Description
        <textarea name="description" rows={3} />
      </label>
      <button className="button-primary" disabled={pending} type="submit">
        Create Amendment draft
      </button>
    </form>
  );
}

function AmendmentDraftActions({
  amendment,
  agreement,
  pending,
  onCancel,
  onSign,
}: {
  readonly amendment: LeaseAmendmentResponse;
  readonly agreement: LeaseAgreementResponse;
  readonly pending: boolean;
  readonly onCancel: (
    agreement: LeaseAgreementResponse,
    amendment: LeaseAmendmentResponse,
  ) => void;
  readonly onSign: (
    event: FormEvent<HTMLFormElement>,
    agreement: LeaseAgreementResponse,
    amendment: LeaseAmendmentResponse,
  ) => void;
}) {
  return (
    <div className="contract-admin-actions">
      <form
        className="setup-form contract-admin-form"
        data-contract-form="amendment-sign"
        onSubmit={(event) => onSign(event, agreement, amendment)}
      >
        <div className="section-heading">
          <div>
            <p className="eyebrow">Amendment lifecycle</p>
            <h3>Sign {amendment.code}</h3>
          </div>
          <span className="section-note">CAS v{amendment.version}</span>
        </div>
        <label>
          Signed on
          <input disabled={pending} name="signedAt" required type="date" />
        </label>
        <TermsSnapshotFields />
        <button className="button-primary" disabled={pending} type="submit">
          Sign Amendment
        </button>
      </form>

      <div className="contract-terminal-box">
        <div>
          <strong>Cancel draft</strong>
          <p className="setup-hint">
            Signed Amendments are immutable; only a draft can be cancelled.
          </p>
        </div>
        <button
          className="button-secondary"
          disabled={pending}
          onClick={() => onCancel(agreement, amendment)}
          type="button"
        >
          Cancel Amendment
        </button>
      </div>
    </div>
  );
}

function writeError(cause: unknown, fallback: string): string {
  if (
    cause instanceof PortfolioApiError &&
    (cause.code === 'LEASE_AGREEMENT_VERSION_CONFLICT' ||
      cause.code === 'LEASE_AMENDMENT_VERSION_CONFLICT')
  ) {
    return 'This legal record changed on the server. Reload the Contract dossier before retrying.';
  }
  return cause instanceof Error ? cause.message : fallback;
}

export function LeaseAdministration({
  api,
  propertyId,
  unitId,
  asOf,
  tenancy,
  agreements,
  agreement,
  amendments,
  amendment,
  navigate,
  onCanonicalWrite,
}: LeaseAdministrationProps) {
  const [parties, setParties] =
    useState<readonly PartyResponse[] | null>(null);
  const [partyError, setPartyError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const writeInFlightRef = useRef(false);
  const mountedRef = useRef(true);
  const activeTenancyIdRef = useRef(tenancy.id);
  const activeAgreementIdRef = useRef(agreement?.id);
  const activeAmendmentIdRef = useRef(amendment?.id);
  activeTenancyIdRef.current = tenancy.id;
  activeAgreementIdRef.current = agreement?.id;
  activeAmendmentIdRef.current = amendment?.id;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setParties(null);
    setPartyError(null);

    void api
      .get(partiesPath(), partyListResponseSchema, {
        signal: controller.signal,
      })
      .then((response) => setParties(response.items))
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setPartyError(
          cause instanceof Error
            ? cause.message
            : 'Party directory could not be loaded.',
        );
      });

    return () => controller.abort();
  }, [api]);

  useEffect(() => {
    setError(null);
  }, [tenancy.id, agreement?.id, amendment?.id]);

  function beginWrite(): boolean {
    if (writeInFlightRef.current) return false;
    writeInFlightRef.current = true;
    setPending(true);
    setError(null);
    return true;
  }

  function finishWrite(): void {
    writeInFlightRef.current = false;
    if (mountedRef.current) setPending(false);
  }

  function canonicalRefreshIfActive(
    targetTenancyId: string,
    targetAgreementId?: string,
  ): boolean {
    if (!mountedRef.current) return false;
    if (activeTenancyIdRef.current !== targetTenancyId) return false;
    if (
      targetAgreementId !== undefined &&
      activeAgreementIdRef.current !== targetAgreementId
    ) {
      return false;
    }
    onCanonicalWrite();
    return true;
  }

  async function createAgreement(
    event: FormEvent<HTMLFormElement>,
    agreementType: LeaseAgreementType,
  ) {
    event.preventDefault();
    if (!beginWrite()) return;

    const targetTenancyId = tenancy.id;
    const agreementSelectionAtStart = activeAgreementIdRef.current;
    const form = new FormData(event.currentTarget);
    const tenancyParties = form
      .getAll('tenancyParty')
      .map(String)
      .map((value) => {
        const separator = value.lastIndexOf(':');
        return {
          partyId: value.slice(0, separator),
          role: value.slice(separator + 1),
        };
      });
    const landlordPartyId = requiredString(form, 'landlordPartyId');
    const authorizedSignatoryPartyId = optionalString(
      form,
      'authorizedSignatoryPartyId',
    );

    const parsed = createLeaseAgreementRequestSchema.safeParse({
      code: requiredString(form, 'code'),
      agreementType,
      ...(agreementType === 'initial'
        ? {}
        : {
            predecessorAgreementId: requiredString(
              form,
              'predecessorAgreementId',
            ),
          }),
      effectiveFrom: requiredString(form, 'effectiveFrom'),
      effectiveTo: optionalString(form, 'effectiveTo') ?? null,
      parties: [
        { partyId: landlordPartyId, role: 'landlord' },
        ...tenancyParties,
        ...(authorizedSignatoryPartyId
          ? [
              {
                partyId: authorizedSignatoryPartyId,
                role: 'authorized_signatory',
              },
            ]
          : []),
      ],
    });

    if (!parsed.success) {
      finishWrite();
      setError(contractErrorMessage());
      return;
    }

    try {
      const created = await api.post(
        tenancyAgreementsPath(targetTenancyId),
        parsed.data,
        leaseAgreementResponseSchema,
      );
      if (
        created.tenancyId !== targetTenancyId ||
        created.version !== 1 ||
        created.status !== 'draft'
      ) {
        throw new Error(
          'Created Agreement does not match the target Tenancy or initial draft lifecycle.',
        );
      }

      const parentStillActive = canonicalRefreshIfActive(targetTenancyId);
      if (
        parentStillActive &&
        activeAgreementIdRef.current === agreementSelectionAtStart
      ) {
        navigate(
          unitRoute(propertyId, unitId, asOf, 'contracts', {
            tenancyId: targetTenancyId,
            agreementId: created.id,
          }),
        );
      }
    } catch (cause) {
      if (
        mountedRef.current &&
        activeTenancyIdRef.current === targetTenancyId &&
        activeAgreementIdRef.current === agreementSelectionAtStart
      ) {
        setError(writeError(cause, 'Agreement could not be created.'));
      }
    } finally {
      finishWrite();
    }
  }

  async function signAgreement(
    event: FormEvent<HTMLFormElement>,
    target: LeaseAgreementResponse,
  ) {
    event.preventDefault();
    if (!beginWrite()) return;

    const targetTenancyId = tenancy.id;
    const form = new FormData(event.currentTarget);
    const parsed = signLeaseAgreementRequestSchema.safeParse({
      expectedVersion: target.version,
      signedAt: requiredString(form, 'signedAt'),
      terms: termsFromForm(form),
    });

    if (!parsed.success) {
      finishWrite();
      setError(contractErrorMessage());
      return;
    }

    try {
      const updated = await api.post(
        agreementSignPath(target.id),
        parsed.data,
        leaseAgreementResponseSchema,
      );
      assertAgreementMutationOwner(
        targetTenancyId,
        target.id,
        target.version,
        updated,
      );
      canonicalRefreshIfActive(targetTenancyId);
    } catch (cause) {
      if (
        mountedRef.current &&
        activeTenancyIdRef.current === targetTenancyId &&
        activeAgreementIdRef.current === target.id
      ) {
        setError(writeError(cause, 'Agreement could not be signed.'));
      }
    } finally {
      finishWrite();
    }
  }

  async function cancelAgreement(target: LeaseAgreementResponse) {
    if (!beginWrite()) return;

    const targetTenancyId = tenancy.id;
    const parsed = contractVersionRequestSchema.safeParse({
      expectedVersion: target.version,
    });
    if (!parsed.success) {
      finishWrite();
      setError(contractErrorMessage());
      return;
    }

    try {
      const updated = await api.post(
        agreementCancelPath(target.id),
        parsed.data,
        leaseAgreementResponseSchema,
      );
      assertAgreementMutationOwner(
        targetTenancyId,
        target.id,
        target.version,
        updated,
      );
      canonicalRefreshIfActive(targetTenancyId);
    } catch (cause) {
      if (
        mountedRef.current &&
        activeTenancyIdRef.current === targetTenancyId &&
        activeAgreementIdRef.current === target.id
      ) {
        setError(writeError(cause, 'Agreement could not be cancelled.'));
      }
    } finally {
      finishWrite();
    }
  }

  async function createAmendment(
    event: FormEvent<HTMLFormElement>,
    targetAgreement: LeaseAgreementResponse,
  ) {
    event.preventDefault();
    if (!beginWrite()) return;

    const targetTenancyId = tenancy.id;
    const amendmentSelectionAtStart = activeAmendmentIdRef.current;
    const form = new FormData(event.currentTarget);
    const parsed = createLeaseAmendmentRequestSchema.safeParse({
      code: requiredString(form, 'code'),
      title: requiredString(form, 'title'),
      description: optionalString(form, 'description') ?? null,
      effectiveFrom: requiredString(form, 'effectiveFrom'),
    });

    if (!parsed.success) {
      finishWrite();
      setError(contractErrorMessage());
      return;
    }

    try {
      const created = await api.post(
        agreementAmendmentsPath(targetAgreement.id),
        parsed.data,
        leaseAmendmentResponseSchema,
      );
      if (
        created.agreementId !== targetAgreement.id ||
        created.version !== 1 ||
        created.status !== 'draft'
      ) {
        throw new Error(
          'Created Amendment does not match the target Agreement or initial draft lifecycle.',
        );
      }

      const parentStillActive = canonicalRefreshIfActive(
        targetTenancyId,
        targetAgreement.id,
      );
      if (
        parentStillActive &&
        activeAmendmentIdRef.current === amendmentSelectionAtStart
      ) {
        navigate(
          unitRoute(propertyId, unitId, asOf, 'contracts', {
            tenancyId: targetTenancyId,
            agreementId: targetAgreement.id,
            amendmentId: created.id,
          }),
        );
      }
    } catch (cause) {
      if (
        mountedRef.current &&
        activeTenancyIdRef.current === targetTenancyId &&
        activeAgreementIdRef.current === targetAgreement.id &&
        activeAmendmentIdRef.current === amendmentSelectionAtStart
      ) {
        setError(writeError(cause, 'Amendment could not be created.'));
      }
    } finally {
      finishWrite();
    }
  }

  async function signAmendment(
    event: FormEvent<HTMLFormElement>,
    targetAgreement: LeaseAgreementResponse,
    targetAmendment: LeaseAmendmentResponse,
  ) {
    event.preventDefault();
    if (!beginWrite()) return;

    const targetTenancyId = tenancy.id;
    const form = new FormData(event.currentTarget);
    const parsed = signLeaseAmendmentRequestSchema.safeParse({
      expectedVersion: targetAmendment.version,
      signedAt: requiredString(form, 'signedAt'),
      terms: termsFromForm(form),
    });

    if (!parsed.success) {
      finishWrite();
      setError(contractErrorMessage());
      return;
    }

    try {
      const updated = await api.post(
        amendmentSignPath(targetAmendment.id),
        parsed.data,
        leaseAmendmentResponseSchema,
      );
      assertAmendmentMutationOwner(
        targetAgreement.id,
        targetAmendment.id,
        targetAmendment.version,
        updated,
      );
      canonicalRefreshIfActive(targetTenancyId, targetAgreement.id);
    } catch (cause) {
      if (
        mountedRef.current &&
        activeTenancyIdRef.current === targetTenancyId &&
        activeAgreementIdRef.current === targetAgreement.id &&
        activeAmendmentIdRef.current === targetAmendment.id
      ) {
        setError(writeError(cause, 'Amendment could not be signed.'));
      }
    } finally {
      finishWrite();
    }
  }

  async function cancelAmendment(
    targetAgreement: LeaseAgreementResponse,
    targetAmendment: LeaseAmendmentResponse,
  ) {
    if (!beginWrite()) return;

    const targetTenancyId = tenancy.id;
    const parsed = contractVersionRequestSchema.safeParse({
      expectedVersion: targetAmendment.version,
    });
    if (!parsed.success) {
      finishWrite();
      setError(contractErrorMessage());
      return;
    }

    try {
      const updated = await api.post(
        amendmentCancelPath(targetAmendment.id),
        parsed.data,
        leaseAmendmentResponseSchema,
      );
      assertAmendmentMutationOwner(
        targetAgreement.id,
        targetAmendment.id,
        targetAmendment.version,
        updated,
      );
      canonicalRefreshIfActive(targetTenancyId, targetAgreement.id);
    } catch (cause) {
      if (
        mountedRef.current &&
        activeTenancyIdRef.current === targetTenancyId &&
        activeAgreementIdRef.current === targetAgreement.id &&
        activeAmendmentIdRef.current === targetAmendment.id
      ) {
        setError(writeError(cause, 'Amendment could not be cancelled.'));
      }
    } finally {
      finishWrite();
    }
  }

  return (
    <section className="panel contract-admin-panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Contract administration</p>
          <h2>Legal write workflow</h2>
        </div>
        <span className="section-note">
          Named commands · immutable signed records · full term snapshots
        </span>
      </div>

      {partyError ? (
        <p className="form-error" role="alert">
          Party directory unavailable: {partyError}
        </p>
      ) : null}
      {error ? <p className="setup-form-error" role="alert">{error}</p> : null}

      <div className="contract-admin-stack">
        <AgreementCreateForm
          agreements={agreements}
          onSubmit={createAgreement}
          parties={parties}
          pending={pending}
          tenancy={tenancy}
        />

        {agreement?.status === 'draft' ? (
          <AgreementDraftActions
            agreement={agreement}
            onCancel={(target) => void cancelAgreement(target)}
            onSign={signAgreement}
            pending={pending}
          />
        ) : null}

        {agreement?.status === 'signed' ? (
          <AmendmentCreateForm
            agreement={agreement}
            onSubmit={createAmendment}
            pending={pending}
          />
        ) : null}

        {agreement?.status === 'signed' && amendment?.status === 'draft' ? (
          <AmendmentDraftActions
            agreement={agreement}
            amendment={amendment}
            onCancel={(targetAgreement, targetAmendment) =>
              void cancelAmendment(targetAgreement, targetAmendment)
            }
            onSign={signAmendment}
            pending={pending}
          />
        ) : null}

        {agreement && agreement.status !== 'draft' && agreement.status !== 'signed' ? (
          <p className="muted">
            {formatDetailKey(agreement.status)} Agreements are immutable legal
            history. Create a renewal/replacement from a valid signed
            predecessor when the legal chain requires another Agreement.
          </p>
        ) : null}

        {amendments === null && agreement?.status === 'signed' ? (
          <p className="muted" aria-live="polite">
            Loading Amendment state…
          </p>
        ) : null}
      </div>
    </section>
  );
}
