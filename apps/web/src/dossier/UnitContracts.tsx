import {
  leaseAgreementDocumentListResponseSchema,
  leaseAgreementListResponseSchema,
  leaseAmendmentDocumentListResponseSchema,
  leaseAmendmentListResponseSchema,
  tenancyListResponseSchema,
  tenancyTermVersionResponseSchema,
  type LeaseAgreementDocumentReferenceResponse,
  type LeaseAgreementResponse,
  type LeaseAmendmentDocumentReferenceResponse,
  type LeaseAmendmentResponse,
  type TenancyResponse,
  type TenancyTermVersionResponse,
} from '@portfolio/contracts';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  agreementAmendmentsPath,
  agreementDocumentsPath,
  amendmentDocumentsPath,
  tenancyAgreementsPath,
  tenancyTermsPath,
  unitTenanciesPath,
} from '../api/paths.js';
import {
  PortfolioApiError,
  type PortfolioApi,
} from '../api/portfolio-api.js';
import { WorkspaceLink } from '../navigation/WorkspaceLink.js';
import {
  isWorkspaceAsOf,
  unitRoute,
} from '../navigation/workspace-route.js';
import type { NavigateWorkspace } from '../navigation/use-workspace-navigation.js';
import { DocumentBinaryActions } from '../documents/DocumentBinaryActions.js';
import { SignedDocumentAdministration } from '../documents/SignedDocumentAdministration.js';
import {
  assertAgreementDocumentReferencesOwner,
  assertAmendmentDocumentReferencesOwner,
} from '../documents/signed-document-owner.js';
import {
  formatDetailKey,
  formatExactMoney,
  formatSwissDate,
} from '../presentation/format.js';
import {
  partyDisplayName,
  usePartyDirectory,
} from '../parties/use-party-directory.js';
import {
  assertAgreementAmendmentsOwner,
  assertContractTenanciesOwner,
  assertTenancyAgreementsOwner,
} from './contract-owner.js';
import { LeaseAdministration } from './LeaseAdministration.js';
import { LuzernerLeaseFormEditor } from './LuzernerLeaseFormEditor.js';

interface UnitContractsProps {
  readonly api: PortfolioApi;
  readonly propertyId: string;
  readonly unitId: string;
  readonly asOf: string;
  readonly tenancyId?: string | undefined;
  readonly agreementId?: string | undefined;
  readonly amendmentId?: string | undefined;
  readonly navigate: NavigateWorkspace;
}

type TermsState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'missing' }
  | { readonly kind: 'ready'; readonly value: TenancyTermVersionResponse }
  | { readonly kind: 'error'; readonly message: string };

type LegalDocumentReference =
  | LeaseAgreementDocumentReferenceResponse
  | LeaseAmendmentDocumentReferenceResponse;

function tenancyPeriod(tenancy: TenancyResponse): string {
  if (tenancy.actualStart) {
    return `${formatSwissDate(tenancy.actualStart)} → ${
      tenancy.actualEnd ? formatSwissDate(tenancy.actualEnd) : 'open'
    }`;
  }
  if (tenancy.plannedStart) {
    return `${formatSwissDate(tenancy.plannedStart)} → ${
      tenancy.plannedEnd ? formatSwissDate(tenancy.plannedEnd) : 'open'
    }`;
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
        <p className="eyebrow">Effective terms · {formatSwissDate(asOf)}</p>
        <p className="muted">Loading effective terms…</p>
      </section>
    );
  }

  if (state.kind === 'missing') {
    return (
      <section className="panel contract-terms-panel">
        <p className="eyebrow">Effective terms · {formatSwissDate(asOf)}</p>
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
        <p className="eyebrow">Effective terms · {formatSwissDate(asOf)}</p>
        <p className="form-error">{state.message}</p>
      </section>
    );
  }

  const terms = state.value;
  return (
    <section className="panel contract-terms-panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Effective terms · {formatSwissDate(asOf)}</p>
          <h3>
            {formatDetailKey(terms.sourceType)} terms from{' '}
            {formatSwissDate(terms.effectiveFrom)}
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
          <dt>Source</dt>
          <dd>{formatDetailKey(terms.sourceType)}</dd>
        </div>
      </dl>
    </section>
  );
}

function LegalDocuments({
  api,
  label,
  items,
  error,
}: {
  readonly api: PortfolioApi;
  readonly label: string;
  readonly items: readonly LegalDocumentReference[] | null;
  readonly error: string | null;
}) {
  return (
    <div className="legal-documents">
      <div className="legal-documents-heading">
        <div>
          <p className="eyebrow">{label}</p>
          <h3>Linked Documents</h3>
        </div>
        <span className="section-note">
          Binary access uses authorized Portfolio HTTP · storage stays private
        </span>
      </div>

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {!error && items === null ? (
        <p className="muted" aria-live="polite">
          Loading linked Documents…
        </p>
      ) : null}
      {items?.length === 0 ? (
        <p className="muted">No Documents are linked to this legal record.</p>
      ) : null}

      {items && items.length > 0 ? (
        <div className="legal-document-list">
          {items.map((reference) => (
            <article className="legal-document-card" key={reference.link.id}>
              <div>
                <span className="legal-document-relation">
                  {reference.link.relation === 'signed_original'
                    ? 'Signed original'
                    : formatDetailKey(reference.link.relation)}
                </span>
                <strong>
                  {reference.linkedVersion?.fileName ?? reference.document.title}
                </strong>
                <small>
                  {reference.document.code} · {reference.document.title}
                </small>
              </div>
              <div className="legal-document-version">
                {reference.linkedVersion ? (
                  <>
                    <strong>
                      v{reference.linkedVersion.versionNumber} ·{' '}
                      {reference.linkedVersion.status}
                    </strong>
                    <small>{reference.linkedVersion.mimeType}</small>
                    <DocumentBinaryActions
                      api={api}
                      fileName={reference.linkedVersion.fileName}
                      mimeType={reference.linkedVersion.mimeType}
                      versionId={reference.linkedVersion.id}
                    />
                  </>
                ) : (
                  <>
                    <strong>Document-level link</strong>
                    <small>
                      Latest registered version:{' '}
                      {reference.document.latestVersionNumber}
                    </small>
                  </>
                )}
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Amendments({
  items,
  propertyId,
  unitId,
  asOf,
  tenancyId,
  agreementId,
  amendmentId,
  navigate,
}: {
  readonly items: readonly LeaseAmendmentResponse[] | null;
  readonly propertyId: string;
  readonly unitId: string;
  readonly asOf: string;
  readonly tenancyId: string;
  readonly agreementId: string;
  readonly amendmentId?: string | undefined;
  readonly navigate: NavigateWorkspace;
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
        <WorkspaceLink
          ariaCurrent={amendment.id === amendmentId ? 'page' : undefined}
          className={`amendment-card ${
            amendment.id === amendmentId ? 'amendment-card-active' : ''
          }`}
          key={amendment.id}
          navigate={navigate}
          route={unitRoute(propertyId, unitId, asOf, 'contracts', {
            tenancyId,
            agreementId,
            amendmentId: amendment.id,
          })}
        >
          <div>
            <strong>{amendment.code}</strong>
            <span>{amendment.title}</span>
          </div>
          <dl className="detail-list">
            <div><dt>Status</dt><dd>{formatDetailKey(amendment.status)}</dd></div>
            <div><dt>Effective</dt><dd>{formatSwissDate(amendment.effectiveFrom)}</dd></div>
            <div><dt>Signed</dt><dd>{formatSwissDate(amendment.signedAt)}</dd></div>
          </dl>
        </WorkspaceLink>
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
  amendmentId,
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
  const [agreementDocuments, setAgreementDocuments] =
    useState<readonly LeaseAgreementDocumentReferenceResponse[] | null>(null);
  const [agreementDocumentsError, setAgreementDocumentsError] =
    useState<string | null>(null);
  const [amendmentDocuments, setAmendmentDocuments] =
    useState<readonly LeaseAmendmentDocumentReferenceResponse[] | null>(null);
  const [amendmentDocumentsError, setAmendmentDocumentsError] =
    useState<string | null>(null);
  const [termsState, setTermsState] = useState<TermsState>({ kind: 'idle' });
  const [contractRevision, setContractRevision] = useState(0);
  const [documentRevision, setDocumentRevision] = useState(0);
  const agreementDocumentsOwnerRef = useRef<string | null>(null);
  const amendmentDocumentsOwnerRef = useRef<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setTenancies(null);
    setTenancyError(null);

    void api
      .get(unitTenanciesPath(unitId), tenancyListResponseSchema, {
        signal: controller.signal,
      })
      .then((response) => {
        assertContractTenanciesOwner(unitId, response.items);
        setTenancies(response.items);
      })
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

    if (!selectedTenancy) return;

    const controller = new AbortController();

    void api
      .get(
        tenancyAgreementsPath(selectedTenancy.id),
        leaseAgreementListResponseSchema,
        { signal: controller.signal },
      )
      .then((response) => {
        assertTenancyAgreementsOwner(selectedTenancy.id, response.items);
        setAgreements(response.items);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setAgreementError(
          cause instanceof Error ? cause.message : 'Agreements could not be loaded.',
        );
      });

    return () => controller.abort();
  }, [api, contractRevision, selectedTenancy]);

  useEffect(() => {
    setTermsState({ kind: 'idle' });

    if (!selectedTenancy) return;

    const controller = new AbortController();

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
  }, [api, asOf, contractRevision, selectedTenancy]);

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
      .then((response) => {
        assertAgreementAmendmentsOwner(selectedAgreement.id, response.items);
        setAmendments(response.items);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setAmendmentError(
          cause instanceof Error
            ? cause.message
            : 'Amendments could not be loaded.',
        );
      });

    return () => controller.abort();
  }, [api, contractRevision, selectedAgreement]);

  useEffect(() => {
    setAgreementDocumentsError(null);

    if (!selectedAgreement) {
      agreementDocumentsOwnerRef.current = null;
      setAgreementDocuments(null);
      return;
    }

    if (agreementDocumentsOwnerRef.current !== selectedAgreement.id) {
      agreementDocumentsOwnerRef.current = selectedAgreement.id;
      setAgreementDocuments(null);
    }

    const controller = new AbortController();
    void api
      .get(
        agreementDocumentsPath(selectedAgreement.id),
        leaseAgreementDocumentListResponseSchema,
        { signal: controller.signal },
      )
      .then((response) => {
        assertAgreementDocumentReferencesOwner(
          selectedAgreement.id,
          response.items,
        );
        setAgreementDocuments(response.items);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setAgreementDocumentsError(
          cause instanceof Error
            ? cause.message
            : 'Agreement Documents could not be loaded.',
        );
      });

    return () => controller.abort();
  }, [api, documentRevision, selectedAgreement]);

  const selectedAmendment = useMemo(
    () => amendments?.find((item) => item.id === amendmentId) ?? null,
    [amendments, amendmentId],
  );
  const amendmentSelectionInvalid =
    amendments !== null &&
    amendmentId !== undefined &&
    selectedAmendment === null;

  useEffect(() => {
    setAmendmentDocumentsError(null);

    if (!selectedAmendment) {
      amendmentDocumentsOwnerRef.current = null;
      setAmendmentDocuments(null);
      return;
    }

    if (amendmentDocumentsOwnerRef.current !== selectedAmendment.id) {
      amendmentDocumentsOwnerRef.current = selectedAmendment.id;
      setAmendmentDocuments(null);
    }

    const controller = new AbortController();
    void api
      .get(
        amendmentDocumentsPath(selectedAmendment.id),
        leaseAmendmentDocumentListResponseSchema,
        { signal: controller.signal },
      )
      .then((response) => {
        assertAmendmentDocumentReferencesOwner(
          selectedAmendment.id,
          response.items,
        );
        setAmendmentDocuments(response.items);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setAmendmentDocumentsError(
          cause instanceof Error
            ? cause.message
            : 'Amendment Documents could not be loaded.',
        );
      });

    return () => controller.abort();
  }, [api, documentRevision, selectedAmendment]);

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
            onChange={(event) => {
              const nextAsOf = event.currentTarget.value;
              if (!isWorkspaceAsOf(nextAsOf)) return;

              navigate(
                unitRoute(
                  propertyId,
                  unitId,
                  nextAsOf,
                  'contracts',
                  {
                    ...(tenancyId ? { tenancyId } : {}),
                    ...(agreementId ? { agreementId } : {}),
                    ...(amendmentId ? { amendmentId } : {}),
                  },
                ),
                { replace: true },
              );
            }}
            required
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

          {agreements ? (
            <LeaseAdministration
              agreement={selectedAgreement}
              agreements={agreements}
              amendment={selectedAmendment}
              amendments={amendments}
              api={api}
              asOf={asOf}
              navigate={navigate}
              onCanonicalWrite={() =>
                setContractRevision((revision) => revision + 1)
              }
              propertyId={propertyId}
              tenancy={selectedTenancy}
              unitId={unitId}
            />
          ) : null}

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
                      <div>
                        <dt>Effective</dt>
                        <dd>
                          {formatSwissDate(agreement.effectiveFrom)} →{' '}
                          {agreement.effectiveTo
                            ? formatSwissDate(agreement.effectiveTo)
                            : 'open'}
                        </dd>
                      </div>
                      <div><dt>Signed</dt><dd>{formatSwissDate(agreement.signedAt)}</dd></div>
                      <div>
                        <dt>Predecessor</dt>
                        <dd>
                          {agreement.predecessorAgreementId
                            ? agreements?.find(
                                (candidate) =>
                                  candidate.id === agreement.predecessorAgreementId,
                              )?.code ?? 'Previous agreement'
                            : '—'}
                        </dd>
                      </div>
                      <div><dt>Parties</dt><dd>{agreement.parties.length}</dd></div>
                    </dl>
                    {agreement.parties.length > 0 ? (
                      <ul
                        aria-label="Agreement party roles"
                        aria-live="polite"
                        className="role-list contract-party-list"
                      >
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
        <>
          <LuzernerLeaseFormEditor
            agreement={selectedAgreement}
            api={api}
          />

          <section className="panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Step 4 · Agreement Documents</p>
                <h2>{selectedAgreement.code}</h2>
              </div>
              <span className="section-note">
                Canonical links targeted to this Agreement
              </span>
            </div>
            <LegalDocuments
              api={api}
              error={agreementDocumentsError}
              items={agreementDocuments}
              label="Agreement legal record"
            />
            {agreementDocuments !== null &&
            agreementDocumentsError === null &&
            ['signed', 'superseded', 'terminated'].includes(
              selectedAgreement.status,
            ) &&
            !agreementDocuments.some(
              (reference) => reference.link.relation === 'signed_original',
            ) ? (
              <SignedDocumentAdministration
                api={api}
                key={`signed-document:agreement:${selectedAgreement.id}`}
                onCanonicalWrite={() =>
                  setDocumentRevision((revision) => revision + 1)
                }
                target={{
                  targetType: 'lease_agreement',
                  targetId: selectedAgreement.id,
                  code: selectedAgreement.code,
                }}
              />
            ) : null}
          </section>

          <section className="panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Step 5 · Amendments</p>
                <h2>{selectedAgreement.code}</h2>
              </div>
              <span className="section-note">
                Select an Amendment to inspect its own Documents
              </span>
            </div>

            {amendmentError ? (
              <p className="form-error" role="alert">{amendmentError}</p>
            ) : null}
            {!amendmentError ? (
              <Amendments
                agreementId={selectedAgreement.id}
                amendmentId={amendmentId}
                asOf={asOf}
                items={amendments}
                navigate={navigate}
                propertyId={propertyId}
                tenancyId={selectedTenancy!.id}
                unitId={unitId}
              />
            ) : null}
            {amendmentSelectionInvalid ? (
              <p className="form-error" role="alert">
                The selected Amendment does not belong to the selected Agreement.
              </p>
            ) : null}
          </section>
        </>
      ) : null}

      {selectedAmendment ? (
        <section className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Step 6 · Amendment Documents</p>
              <h2>{selectedAmendment.code}</h2>
            </div>
            <span className="section-note">
              Canonical links targeted to this Amendment
            </span>
          </div>
          <LegalDocuments
            api={api}
            error={amendmentDocumentsError}
            items={amendmentDocuments}
            label="Amendment legal record"
          />
          {amendmentDocuments !== null &&
          amendmentDocumentsError === null &&
          selectedAmendment.status === 'signed' &&
          !amendmentDocuments.some(
            (reference) => reference.link.relation === 'signed_original',
          ) ? (
            <SignedDocumentAdministration
              api={api}
              key={`signed-document:amendment:${selectedAmendment.id}`}
              onCanonicalWrite={() =>
                setDocumentRevision((revision) => revision + 1)
              }
              target={{
                targetType: 'lease_amendment',
                targetId: selectedAmendment.id,
                code: selectedAmendment.code,
              }}
            />
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
