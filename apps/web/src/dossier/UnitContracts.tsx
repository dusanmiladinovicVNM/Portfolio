import {
  leaseAgreementListResponseSchema,
  leaseAmendmentListResponseSchema,
  tenancyListResponseSchema,
  tenancyTermVersionResponseSchema,
  type LeaseAgreementResponse,
  type LeaseAmendmentResponse,
  type TenancyResponse,
  type TenancyTermVersionResponse,
} from '@portfolio/contracts';
import { useEffect, useMemo, useState } from 'react';
import {
  agreementAmendmentsPath,
  tenancyAgreementsPath,
  tenancyTermsPath,
  unitTenanciesPath,
} from '../api/paths.js';
import {
  PortfolioApiError,
  type PortfolioApi,
} from '../api/portfolio-api.js';
import { WorkspaceLink } from '../navigation/WorkspaceLink.js';
import { unitRoute } from '../navigation/workspace-route.js';
import type { NavigateWorkspace } from '../navigation/use-workspace-navigation.js';
import {
  formatDetailKey,
  formatExactMoney,
} from '../presentation/format.js';
import {
  partyDisplayName,
  usePartyDirectory,
} from '../parties/use-party-directory.js';

interface UnitContractsProps {
  readonly api: PortfolioApi;
  readonly propertyId: string;
  readonly unitId: string;
  readonly asOf: string;
  readonly tenancyId?: string | undefined;
  readonly agreementId?: string | undefined;
  readonly navigate: NavigateWorkspace;
}

type TermsState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'missing' }
  | { readonly kind: 'ready'; readonly value: TenancyTermVersionResponse }
  | { readonly kind: 'error'; readonly message: string };

function tenancyPeriod(tenancy: TenancyResponse): string {
  if (tenancy.actualStart) {
    return `${tenancy.actualStart} → ${tenancy.actualEnd ?? 'open'}`;
  }
  if (tenancy.plannedStart) {
    return `${tenancy.plannedStart} → ${tenancy.plannedEnd ?? 'open'}`;
  }
  return 'Not scheduled';
}

function TermsPanel({
  asOf,
  state,
}: {
  readonly asOf: string;
  readonly state: TermsState;
}) {
  if (state.kind === 'idle') return null;

  if (state.kind === 'loading') {
    return (
      <section className="panel contract-terms-panel" aria-live="polite">
        <p className="eyebrow">Effective terms · {asOf}</p>
        <p className="muted">Loading effective terms…</p>
      </section>
    );
  }

  if (state.kind === 'missing') {
    return (
      <section className="panel contract-terms-panel">
        <p className="eyebrow">Effective terms · {asOf}</p>
        <h3>No effective terms at this business date</h3>
        <p className="muted">
          This is a valid legal-history state, not a transport error.
        </p>
      </section>
    );
  }

  if (state.kind === 'error') {
    return (
      <section className="panel contract-terms-panel" role="alert">
        <p className="eyebrow">Effective terms · {asOf}</p>
        <p className="form-error">{state.message}</p>
      </section>
    );
  }

  const terms = state.value;
  return (
    <section className="panel contract-terms-panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Effective terms · {asOf}</p>
          <h3>
            {formatDetailKey(terms.sourceType)} terms from {terms.effectiveFrom}
          </h3>
        </div>
        <span className="section-note">
          Scalar legal facts · no client-side recurring-total calculation
        </span>
      </div>

      <div className="terms-grid">
        <div>
          <span>Base rent</span>
          <strong>{formatExactMoney(terms.currency, terms.baseRent)}</strong>
        </div>
        <div>
          <span>Service charge</span>
          <strong>{formatExactMoney(terms.currency, terms.serviceCharge)}</strong>
        </div>
        <div>
          <span>Utilities advance</span>
          <strong>{formatExactMoney(terms.currency, terms.utilitiesAdvance)}</strong>
        </div>
        <div>
          <span>Parking rent</span>
          <strong>{formatExactMoney(terms.currency, terms.parkingRent)}</strong>
        </div>
        <div>
          <span>Other recurring</span>
          <strong>{formatExactMoney(terms.currency, terms.otherRecurringCharge)}</strong>
        </div>
        <div>
          <span>Deposit required</span>
          <strong>{formatExactMoney(terms.currency, terms.depositRequired)}</strong>
        </div>
      </div>

      <dl className="detail-list compact-detail-list">
        <div><dt>Billing</dt><dd>{formatDetailKey(terms.billingFrequency)}</dd></div>
        <div><dt>Tenant notice</dt><dd>{terms.noticePeriodTenantDays} days</dd></div>
        <div><dt>Landlord notice</dt><dd>{terms.noticePeriodLandlordDays} days</dd></div>
        <div>
          <dt>Source identity</dt>
          <dd>{terms.sourceAgreementId ?? terms.sourceAmendmentId ?? '—'}</dd>
        </div>
      </dl>
    </section>
  );
}

function Amendments({
  items,
}: {
  readonly items: readonly LeaseAmendmentResponse[] | null;
}) {
  if (items === null) {
    return <p className="muted" aria-live="polite">Loading Amendments…</p>;
  }

  if (items.length === 0) {
    return <p className="muted">No Amendments for this Agreement.</p>;
  }

  return (
    <div className="amendment-list">
      {items.map((amendment) => (
        <article key={amendment.id}>
          <div>
            <strong>{amendment.code}</strong>
            <span>{amendment.title}</span>
          </div>
          <dl className="detail-list">
            <div><dt>Status</dt><dd>{formatDetailKey(amendment.status)}</dd></div>
            <div><dt>Effective</dt><dd>{amendment.effectiveFrom}</dd></div>
            <div><dt>Signed</dt><dd>{amendment.signedAt ?? '—'}</dd></div>
          </dl>
        </article>
      ))}
    </div>
  );
}

export function UnitContracts({
  api,
  propertyId,
  unitId,
  asOf,
  tenancyId,
  agreementId,
  navigate,
}: UnitContractsProps) {
  const [tenancies, setTenancies] =
    useState<readonly TenancyResponse[] | null>(null);
  const [tenancyError, setTenancyError] = useState<string | null>(null);
  const [agreements, setAgreements] =
    useState<readonly LeaseAgreementResponse[] | null>(null);
  const [agreementError, setAgreementError] = useState<string | null>(null);
  const [amendments, setAmendments] =
    useState<readonly LeaseAmendmentResponse[] | null>(null);
  const [amendmentError, setAmendmentError] = useState<string | null>(null);
  const [termsState, setTermsState] = useState<TermsState>({ kind: 'idle' });

  useEffect(() => {
    const controller = new AbortController();
    setTenancies(null);
    setTenancyError(null);

    void api
      .get(unitTenanciesPath(unitId), tenancyListResponseSchema, {
        signal: controller.signal,
      })
      .then((response) => setTenancies(response.items))
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setTenancyError(
          cause instanceof Error ? cause.message : 'Tenancies could not be loaded.',
        );
      });

    return () => controller.abort();
  }, [api, unitId]);

  const selectedTenancy = useMemo(
    () => tenancies?.find((item) => item.id === tenancyId) ?? null,
    [tenancies, tenancyId],
  );
  const tenancySelectionInvalid =
    tenancies !== null && tenancyId !== undefined && selectedTenancy === null;

  useEffect(() => {
    setAgreements(null);
    setAgreementError(null);
    setTermsState({ kind: 'idle' });

    if (!selectedTenancy) return;

    const controller = new AbortController();

    void api
      .get(
        tenancyAgreementsPath(selectedTenancy.id),
        leaseAgreementListResponseSchema,
        { signal: controller.signal },
      )
      .then((response) => setAgreements(response.items))
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setAgreementError(
          cause instanceof Error ? cause.message : 'Agreements could not be loaded.',
        );
      });

    setTermsState({ kind: 'loading' });
    void api
      .get(
        tenancyTermsPath(selectedTenancy.id, asOf),
        tenancyTermVersionResponseSchema,
        { signal: controller.signal },
      )
      .then((value) => setTermsState({ kind: 'ready', value }))
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        if (
          cause instanceof PortfolioApiError &&
          cause.code === 'TENANCY_TERMS_NOT_FOUND'
        ) {
          setTermsState({ kind: 'missing' });
          return;
        }
        setTermsState({
          kind: 'error',
          message:
            cause instanceof Error
              ? cause.message
              : 'Effective terms could not be loaded.',
        });
      });

    return () => controller.abort();
  }, [api, asOf, selectedTenancy]);

  const selectedAgreement = useMemo(
    () => agreements?.find((item) => item.id === agreementId) ?? null,
    [agreements, agreementId],
  );
  const agreementSelectionInvalid =
    agreements !== null &&
    agreementId !== undefined &&
    selectedAgreement === null;

  const partyIds = [
    ...(selectedTenancy?.parties.map((party) => party.partyId) ?? []),
    ...(agreements?.flatMap((agreement) =>
      agreement.parties.map((party) => party.partyId),
    ) ?? []),
  ];
  const partyDirectory = usePartyDirectory(api, partyIds);

  useEffect(() => {
    setAmendments(null);
    setAmendmentError(null);
    if (!selectedAgreement) return;

    const controller = new AbortController();
    void api
      .get(
        agreementAmendmentsPath(selectedAgreement.id),
        leaseAmendmentListResponseSchema,
        { signal: controller.signal },
      )
      .then((response) => setAmendments(response.items))
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setAmendmentError(
          cause instanceof Error
            ? cause.message
            : 'Amendments could not be loaded.',
        );
      });

    return () => controller.abort();
  }, [api, selectedAgreement]);

  return (
    <div className="contract-stack">
      <div className="dossier-toolbar">
        <div>
          <p className="eyebrow">Contract dossier</p>
          <p className="muted">
            Tenancy and Agreement statuses are current lifecycle records.
            Effective terms are resolved separately at the workspace business date.
          </p>
        </div>
        <label className="date-control">
          Terms as of
          <input
            aria-label="Contract effective terms business date"
            onChange={(event) =>
              navigate(
                unitRoute(
                  propertyId,
                  unitId,
                  event.currentTarget.value,
                  'contracts',
                  {
                    ...(tenancyId ? { tenancyId } : {}),
                    ...(agreementId ? { agreementId } : {}),
                  },
                ),
                { replace: true },
              )
            }
            type="date"
            value={asOf}
          />
        </label>
      </div>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Step 1 · current Tenancy</p>
            <h2>Select the lifecycle record</h2>
          </div>
          <span className="section-note">One Unit-scoped read</span>
        </div>

        {tenancyError ? <p className="form-error" role="alert">{tenancyError}</p> : null}
        {!tenancyError && tenancies === null ? (
          <p className="muted" aria-live="polite">Loading Tenancies…</p>
        ) : null}
        {tenancies?.length === 0 ? (
          <p className="muted">No Tenancy records exist for this Unit.</p>
        ) : null}

        {tenancies && tenancies.length > 0 ? (
          <div className="selection-grid">
            {tenancies.map((tenancy) => (
              <WorkspaceLink
                ariaCurrent={tenancy.id === tenancyId ? 'page' : undefined}
                className={`selection-card ${tenancy.id === tenancyId ? 'selection-card-active' : ''}`}
                key={tenancy.id}
                navigate={navigate}
                route={unitRoute(
                  propertyId,
                  unitId,
                  asOf,
                  'contracts',
                  { tenancyId: tenancy.id },
                )}
              >
                <strong>{tenancy.code}</strong>
                <span>{formatDetailKey(tenancy.status)}</span>
                <small>{tenancyPeriod(tenancy)}</small>
              </WorkspaceLink>
            ))}
          </div>
        ) : null}

        {tenancySelectionInvalid ? (
          <p className="form-error" role="alert">
            The selected Tenancy does not belong to this Unit.
          </p>
        ) : null}
        {partyDirectory.error ? (
          <p className="form-error" role="alert">
            Party details unavailable: {partyDirectory.error}
          </p>
        ) : null}
      </section>

      {selectedTenancy ? (
        <>
          <TermsPanel asOf={asOf} state={termsState} />

          <section className="panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Step 2 · current Agreement records</p>
                <h2>{selectedTenancy.code}</h2>
              </div>
              <span className="section-note">
                {agreements ? `${agreements.length} Agreement records` : 'Loading…'}
              </span>
            </div>

            {agreementError ? (
              <p className="form-error" role="alert">{agreementError}</p>
            ) : null}
            {!agreementError && agreements === null ? (
              <p className="muted" aria-live="polite">Loading Agreements…</p>
            ) : null}
            {agreements?.length === 0 ? (
              <p className="muted">No Lease Agreements exist for this Tenancy.</p>
            ) : null}

            {agreements && agreements.length > 0 ? (
              <div className="agreement-grid">
                {agreements.map((agreement) => (
                  <WorkspaceLink
                    ariaCurrent={agreement.id === agreementId ? 'page' : undefined}
                    className={`agreement-card ${agreement.id === agreementId ? 'agreement-card-active' : ''}`}
                    key={agreement.id}
                    navigate={navigate}
                    route={unitRoute(
                      propertyId,
                      unitId,
                      asOf,
                      'contracts',
                      {
                        tenancyId: selectedTenancy.id,
                        agreementId: agreement.id,
                      },
                    )}
                  >
                    <div className="record-heading">
                      <div>
                        <span className="eyebrow">{agreement.code}</span>
                        <h3>{formatDetailKey(agreement.agreementType)}</h3>
                      </div>
                      <span className="status-chip">{agreement.status}</span>
                    </div>
                    <dl className="detail-list">
                      <div><dt>Effective</dt><dd>{agreement.effectiveFrom} → {agreement.effectiveTo ?? 'open'}</dd></div>
                      <div><dt>Signed</dt><dd>{agreement.signedAt ?? '—'}</dd></div>
                      <div><dt>Predecessor</dt><dd>{agreement.predecessorAgreementId ?? '—'}</dd></div>
                      <div><dt>Parties</dt><dd>{agreement.parties.length}</dd></div>
                    </dl>
                    {agreement.parties.length > 0 ? (
                      <ul className="role-list contract-party-list">
                        {agreement.parties.map((party) => (
                          <li key={party.id}>
                            <strong>
                              {partyDirectory.loading
                                ? 'Resolving Party…'
                                : partyDisplayName(
                                    partyDirectory,
                                    party.partyId,
                                  )}
                            </strong>
                            <span>{formatDetailKey(party.role)}</span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </WorkspaceLink>
                ))}
              </div>
            ) : null}

            {agreementSelectionInvalid ? (
              <p className="form-error" role="alert">
                The selected Agreement does not belong to the selected Tenancy.
              </p>
            ) : null}
          </section>
        </>
      ) : null}

      {selectedAgreement ? (
        <section className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Step 3 · Amendments</p>
              <h2>{selectedAgreement.code}</h2>
            </div>
            <span className="section-note">
              Current amendment lifecycle records
            </span>
          </div>

          {amendmentError ? (
            <p className="form-error" role="alert">{amendmentError}</p>
          ) : null}
          {!amendmentError ? <Amendments items={amendments} /> : null}
        </section>
      ) : null}
    </div>
  );
}
