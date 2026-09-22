import {
  changeServicePlanStatusRequestSchema,
  createServicePlanRequestSchema,
  createWarrantyClaimRequestSchema,
  createWarrantyRequestSchema,
  partyListResponseSchema,
  recordServiceEventRequestSchema,
  resolveWarrantyClaimRequestSchema,
  serviceEventListResponseSchema,
  serviceEventResponseSchema,
  servicePlanListResponseSchema,
  servicePlanResponseSchema,
  submitWarrantyClaimRequestSchema,
  warrantyClaimListResponseSchema,
  warrantyClaimResponseSchema,
  warrantyClaimVersionRequestSchema,
  warrantyListResponseSchema,
  warrantyResponseSchema,
  type PartyResponse,
  type ServiceEventResponse,
  type ServicePlanResponse,
  type WarrantyClaimResponse,
  type WarrantyResponse,
} from '@portfolio/contracts';
import {
  SERVICE_EVENT_TYPES,
  SERVICE_PLAN_KINDS,
  WARRANTY_TYPES,
  type ServiceEventType,
  type ServicePlanKind,
  type WarrantyType,
} from '@portfolio/domain';
import {
  type FormEvent,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  assetServiceEventsPath,
  assetServicePlansPath,
  assetWarrantiesPath,
  partiesPath,
  servicePlanStatusPath,
  warrantyClaimCancelPath,
  warrantyClaimClosePath,
  warrantyClaimResolvePath,
  warrantyClaimsPath,
  warrantyClaimSubmitPath,
} from '../api/paths.js';
import {
  isAmbiguousWriteFailure,
  type PortfolioApi,
} from '../api/portfolio-api.js';
import {
  contractErrorMessage,
  requiredString,
} from '../admin/form-utils.js';
import { formatDetailKey } from '../presentation/format.js';
import {
  assertAssetServiceEventsOwner,
  assertAssetServicePlansOwner,
  assertAssetWarrantiesOwner,
  assertCreatedServicePlan,
  assertCreatedStandaloneServiceEvent,
  assertCreatedWarranty,
  assertCreatedWarrantyClaim,
  assertServicePlanTransition,
  assertWarrantyClaimsOwner,
  assertWarrantyClaimTransition,
} from './asset-service-owner.js';

interface SharedWriteGate {
  readonly pending: boolean;
  readonly tryStart: () => boolean;
  readonly finish: () => void;
}

interface AssetServiceAdministrationProps {
  readonly api: PortfolioApi;
  readonly assetId: string;
  readonly assetStatus: 'active' | 'inactive' | 'retired' | 'replaced';
  readonly writeGate: SharedWriteGate;
}

type ClaimMap = ReadonlyMap<string, readonly WarrantyClaimResponse[]>;

function nullableString(form: FormData, name: string): string | null {
  const value = String(form.get(name) ?? '').trim();
  return value === '' ? null : value;
}

function optionalPositiveInt(form: FormData, name: string): number | null {
  const value = String(form.get(name) ?? '').trim();
  if (value === '') return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : Number.NaN;
}

function utcInstant(date: string, time: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
    return null;
  }
  const value = new Date(`${date}T${time}:00.000Z`);
  return Number.isNaN(value.getTime()) ? null : value.toISOString();
}

function errorMessage(cause: unknown, fallback: string): string {
  return cause instanceof Error ? cause.message : fallback;
}

function sortedParties(parties: readonly PartyResponse[]) {
  return [...parties].sort((a, b) =>
    a.displayName.localeCompare(b.displayName),
  );
}

function allClaims(claimsByWarranty: ClaimMap): readonly WarrantyClaimResponse[] {
  return [...claimsByWarranty.values()].flat();
}

function claimLabel(claim: WarrantyClaimResponse): string {
  return `${claim.incidentOn} · ${claim.status} · ${claim.description}`;
}

export function AssetServiceAdministration({
  api,
  assetId,
  assetStatus,
  writeGate,
}: AssetServiceAdministrationProps) {
  const [warranties, setWarranties] =
    useState<readonly WarrantyResponse[] | null>(null);
  const [claimsByWarranty, setClaimsByWarranty] =
    useState<ClaimMap>(() => new Map());
  const [plans, setPlans] =
    useState<readonly ServicePlanResponse[] | null>(null);
  const [events, setEvents] =
    useState<readonly ServiceEventResponse[] | null>(null);
  const [parties, setParties] =
    useState<readonly PartyResponse[] | null>(null);
  const [revision, setRevision] = useState(0);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [planKind, setPlanKind] = useState<ServicePlanKind>('one_time');

  const providers = useMemo(
    () => sortedParties(parties ?? []),
    [parties],
  );
  const activeProviders = useMemo(
    () => providers.filter((party) => party.status === 'active'),
    [providers],
  );
  const claims = useMemo(
    () => allClaims(claimsByWarranty),
    [claimsByWarranty],
  );

  useEffect(() => {
    const controller = new AbortController();
    setWarranties(null);
    setPlans(null);
    setEvents(null);
    setParties(null);
    setClaimsByWarranty(new Map());
    setLoadError(null);

    void Promise.all([
      api.get(assetWarrantiesPath(assetId), warrantyListResponseSchema, {
        signal: controller.signal,
      }),
      api.get(assetServicePlansPath(assetId), servicePlanListResponseSchema, {
        signal: controller.signal,
      }),
      api.get(assetServiceEventsPath(assetId), serviceEventListResponseSchema, {
        signal: controller.signal,
      }),
      api.get(partiesPath(), partyListResponseSchema, {
        signal: controller.signal,
      }),
    ])
      .then(async ([warrantyResponse, planResponse, eventResponse, partyResponse]) => {
        if (controller.signal.aborted) return;
        assertAssetWarrantiesOwner(assetId, warrantyResponse.items);
        assertAssetServicePlansOwner(assetId, planResponse.items);
        assertAssetServiceEventsOwner(assetId, eventResponse.items);

        const claimEntries = await Promise.all(
          warrantyResponse.items.map(async (warranty) => {
            const response = await api.get(
              warrantyClaimsPath(warranty.id),
              warrantyClaimListResponseSchema,
              { signal: controller.signal },
            );
            assertWarrantyClaimsOwner(warranty.id, response.items);
            return [warranty.id, response.items] as const;
          }),
        );
        if (controller.signal.aborted) return;

        const planIds = new Set(planResponse.items.map((plan) => plan.id));
        const claimIds = new Set(
          claimEntries.flatMap(([, warrantyClaims]) =>
            warrantyClaims.map((claim) => claim.id),
          ),
        );
        if (
          eventResponse.items.some(
            (event) =>
              (event.servicePlanId !== null &&
                !planIds.has(event.servicePlanId)) ||
              (event.warrantyClaimId !== null &&
                !claimIds.has(event.warrantyClaimId)),
          )
        ) {
          throw new Error(
            'Asset ServiceEvent history references a Plan or Claim outside the selected Asset.',
          );
        }

        setWarranties(warrantyResponse.items);
        setPlans(planResponse.items);
        setEvents(eventResponse.items);
        setParties(partyResponse.items);
        setClaimsByWarranty(new Map(claimEntries));
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setLoadError(
          errorMessage(cause, 'Asset warranty/service workspace could not be loaded.'),
        );
      });

    return () => controller.abort();
  }, [api, assetId, revision]);

  function refresh(): void {
    setRevision((value) => value + 1);
  }

  function begin(key: string): boolean {
    if (!writeGate.tryStart()) return false;
    setPendingKey(key);
    setActionError(null);
    setSuccess(null);
    return true;
  }

  function finish(): void {
    writeGate.finish();
    setPendingKey(null);
  }

  async function canonicalClaims(
    warrantyId: string,
  ): Promise<readonly WarrantyClaimResponse[]> {
    const response = await api.get(
      warrantyClaimsPath(warrantyId),
      warrantyClaimListResponseSchema,
    );
    assertWarrantyClaimsOwner(warrantyId, response.items);
    return response.items;
  }

  async function canonicalPlans(): Promise<readonly ServicePlanResponse[]> {
    const response = await api.get(
      assetServicePlansPath(assetId),
      servicePlanListResponseSchema,
    );
    assertAssetServicePlansOwner(assetId, response.items);
    return response.items;
  }

  async function createWarranty(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const element = event.currentTarget;
    const form = new FormData(element);
    const expected = {
      warrantyType: requiredString(form, 'warrantyType') as WarrantyType,
      providerPartyId: nullableString(form, 'providerPartyId'),
      reference: nullableString(form, 'reference'),
      validFrom: requiredString(form, 'validFrom'),
      validTo: nullableString(form, 'validTo'),
      terms: nullableString(form, 'terms'),
    };
    const parsed = createWarrantyRequestSchema.safeParse(expected);
    if (!parsed.success) {
      setActionError(contractErrorMessage());
      return;
    }
    if (!begin('warranty-create')) return;

    try {
      const created = await api.post(
        assetWarrantiesPath(assetId),
        parsed.data,
        warrantyResponseSchema,
      );
      assertCreatedWarranty(assetId, expected, created);
      element.reset();
      setSuccess('Warranty coverage recorded.');
      refresh();
    } catch (cause) {
      refresh();
      setActionError(
        isAmbiguousWriteFailure(cause)
          ? 'Warranty creation outcome is unconfirmed. Canonical coverage is being reloaded; inspect the Warranty list before retrying.'
          : errorMessage(cause, 'Warranty could not be recorded.'),
      );
    } finally {
      finish();
    }
  }

  async function createClaim(
    event: FormEvent<HTMLFormElement>,
    warranty: WarrantyResponse,
  ) {
    event.preventDefault();
    const element = event.currentTarget;
    const form = new FormData(element);
    const expected = {
      incidentOn: requiredString(form, 'incidentOn'),
      description: requiredString(form, 'description'),
    };
    const parsed = createWarrantyClaimRequestSchema.safeParse(expected);
    if (!parsed.success) {
      setActionError(contractErrorMessage());
      return;
    }
    if (!begin(`claim-create:${warranty.id}`)) return;

    try {
      const created = await api.post(
        warrantyClaimsPath(warranty.id),
        parsed.data,
        warrantyClaimResponseSchema,
      );
      assertCreatedWarrantyClaim(warranty.id, expected, created);
      element.reset();
      setSuccess('Warranty Claim recorded as draft.');
      refresh();
    } catch (cause) {
      refresh();
      setActionError(
        isAmbiguousWriteFailure(cause)
          ? 'Warranty Claim creation outcome is unconfirmed. Canonical claims are being reloaded; inspect the Claim list before retrying.'
          : errorMessage(cause, 'Warranty Claim could not be recorded.'),
      );
    } finally {
      finish();
    }
  }

  async function transitionClaim(
    claim: WarrantyClaimResponse,
    action: 'submit' | 'approve' | 'reject' | 'close' | 'cancel',
    providerReference?: string | null,
  ) {
    const expectedStatus: WarrantyClaimResponse['status'] =
      action === 'submit'
        ? 'submitted'
        : action === 'approve'
          ? 'approved'
          : action === 'reject'
            ? 'rejected'
            : action === 'close'
              ? 'closed'
              : 'cancelled';

    let path: string;
    let body: unknown;
    if (action === 'submit') {
      const parsed = submitWarrantyClaimRequestSchema.safeParse({
        expectedVersion: claim.version,
        providerReference: providerReference ?? null,
      });
      if (!parsed.success) {
        setActionError(contractErrorMessage());
        return;
      }
      path = warrantyClaimSubmitPath(claim.id);
      body = parsed.data;
    } else if (action === 'approve' || action === 'reject') {
      const parsed = resolveWarrantyClaimRequestSchema.safeParse({
        expectedVersion: claim.version,
        decision: action === 'approve' ? 'approved' : 'rejected',
      });
      if (!parsed.success) {
        setActionError(contractErrorMessage());
        return;
      }
      path = warrantyClaimResolvePath(claim.id);
      body = parsed.data;
    } else {
      const parsed = warrantyClaimVersionRequestSchema.safeParse({
        expectedVersion: claim.version,
      });
      if (!parsed.success) {
        setActionError(contractErrorMessage());
        return;
      }
      path =
        action === 'close'
          ? warrantyClaimClosePath(claim.id)
          : warrantyClaimCancelPath(claim.id);
      body = parsed.data;
    }

    if (!begin(`claim:${claim.id}:${action}`)) return;
    let ambiguous = false;
    try {
      let updated: WarrantyClaimResponse;
      try {
        updated = await api.post(path, body, warrantyClaimResponseSchema);
      } catch (cause) {
        if (!isAmbiguousWriteFailure(cause)) throw cause;
        ambiguous = true;
        const canonical = await canonicalClaims(claim.warrantyId);
        const recovered = canonical.find((item) => item.id === claim.id);
        if (!recovered) throw cause;
        updated = recovered;
      }

      assertWarrantyClaimTransition(
        claim,
        updated,
        action === 'submit'
          ? {
              status: expectedStatus,
              providerReference: providerReference ?? null,
            }
          : { status: expectedStatus },
      );
      setSuccess(
        ambiguous
          ? `Warranty Claim ${expectedStatus} transition recovered from canonical state.`
          : `Warranty Claim is now ${expectedStatus}.`,
      );
      refresh();
    } catch (cause) {
      refresh();
      setActionError(
        ambiguous
          ? 'Warranty Claim outcome remains unconfirmed after canonical reread. Do not retry until the Claim state is checked.'
          : errorMessage(cause, 'Warranty Claim lifecycle change failed.'),
      );
    } finally {
      finish();
    }
  }

  async function submitClaimForm(
    event: FormEvent<HTMLFormElement>,
    claim: WarrantyClaimResponse,
  ) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await transitionClaim(
      claim,
      'submit',
      nullableString(form, 'providerReference'),
    );
  }

  async function createPlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const element = event.currentTarget;
    const form = new FormData(element);
    const intervalMonths = optionalPositiveInt(form, 'intervalMonths');
    const expected = {
      name: requiredString(form, 'name'),
      scheduleKind: requiredString(form, 'scheduleKind') as ServicePlanKind,
      firstDueOn: requiredString(form, 'firstDueOn'),
      intervalMonths:
        requiredString(form, 'scheduleKind') === 'recurring'
          ? intervalMonths
          : null,
      providerPartyId: nullableString(form, 'providerPartyId'),
      notes: nullableString(form, 'notes'),
    };
    const parsed = createServicePlanRequestSchema.safeParse(expected);
    if (!parsed.success) {
      setActionError(contractErrorMessage());
      return;
    }
    if (!begin('plan-create')) return;

    try {
      const created = await api.post(
        assetServicePlansPath(assetId),
        parsed.data,
        servicePlanResponseSchema,
      );
      assertCreatedServicePlan(assetId, expected, created);
      element.reset();
      setPlanKind('one_time');
      setSuccess('ServicePlan created.');
      refresh();
    } catch (cause) {
      refresh();
      setActionError(
        isAmbiguousWriteFailure(cause)
          ? 'ServicePlan creation outcome is unconfirmed. Canonical plans are being reloaded; inspect the Plan list before retrying.'
          : errorMessage(cause, 'ServicePlan could not be created.'),
      );
    } finally {
      finish();
    }
  }

  async function transitionPlan(
    plan: ServicePlanResponse,
    status: ServicePlanResponse['status'],
  ) {
    const parsed = changeServicePlanStatusRequestSchema.safeParse({
      expectedVersion: plan.version,
      status,
    });
    if (!parsed.success || !begin(`plan:${plan.id}:${status}`)) return;
    let ambiguous = false;

    try {
      let updated: ServicePlanResponse;
      try {
        updated = await api.post(
          servicePlanStatusPath(plan.id),
          parsed.data,
          servicePlanResponseSchema,
        );
      } catch (cause) {
        if (!isAmbiguousWriteFailure(cause)) throw cause;
        ambiguous = true;
        const canonical = await canonicalPlans();
        const recovered = canonical.find((item) => item.id === plan.id);
        if (!recovered) throw cause;
        updated = recovered;
      }

      assertServicePlanTransition(plan, updated, status);
      setSuccess(
        ambiguous
          ? `ServicePlan ${status} transition recovered from canonical state.`
          : `ServicePlan is now ${status}.`,
      );
      refresh();
    } catch (cause) {
      refresh();
      setActionError(
        ambiguous
          ? 'ServicePlan outcome remains unconfirmed after canonical reread. Do not retry until the Plan state is checked.'
          : errorMessage(cause, 'ServicePlan lifecycle change failed.'),
      );
    } finally {
      finish();
    }
  }

  async function recordServiceEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const element = event.currentTarget;
    const form = new FormData(element);
    const performedAt = utcInstant(
      requiredString(form, 'performedDate'),
      requiredString(form, 'performedTime'),
    );
    const expected = {
      servicePlanId: nullableString(form, 'servicePlanId'),
      warrantyClaimId: nullableString(form, 'warrantyClaimId'),
      eventType: requiredString(form, 'eventType') as ServiceEventType,
      performedAt: performedAt ?? '',
      providerPartyId: nullableString(form, 'providerPartyId'),
      description: requiredString(form, 'description'),
      reference: nullableString(form, 'reference'),
    };
    const parsed = recordServiceEventRequestSchema.safeParse({
      ...expected,
      parts: [],
    });
    if (!parsed.success) {
      setActionError(contractErrorMessage());
      return;
    }
    if (!begin('event-create')) return;

    try {
      const created = await api.post(
        assetServiceEventsPath(assetId),
        parsed.data,
        serviceEventResponseSchema,
      );
      assertCreatedStandaloneServiceEvent(assetId, expected, created);
      element.reset();
      setSuccess('ServiceEvent recorded as immutable Asset history.');
      refresh();
    } catch (cause) {
      refresh();
      setActionError(
        isAmbiguousWriteFailure(cause)
          ? 'ServiceEvent creation outcome is unconfirmed. Canonical history is being reloaded; inspect the Event list before retrying.'
          : errorMessage(cause, 'ServiceEvent could not be recorded.'),
      );
    } finally {
      finish();
    }
  }

  const loading =
    warranties === null ||
    plans === null ||
    events === null ||
    parties === null;
  const pending = writeGate.pending || pendingKey !== null;
  const futurePolicyAllowed =
    assetStatus === 'active' || assetStatus === 'inactive';

  return (
    <div className="asset-service-workspace">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Warranty + Service</p>
          <h3>Coverage, expected work and completed history</h3>
        </div>
        <span className="section-note">
          Exact physical Asset identity · no Maintenance surrogate
        </span>
      </div>

      {loadError ? <p className="form-error" role="alert">{loadError}</p> : null}
      {actionError ? (
        <p className="setup-form-error" role="alert">{actionError}</p>
      ) : null}
      {success ? (
        <p className="setup-form-success" aria-live="polite">{success}</p>
      ) : null}

      {loading ? (
        <p className="muted" aria-live="polite">
          Loading Warranty and Service history…
        </p>
      ) : (
        <>
          <div className="asset-service-grid">
            <form
              className="setup-form asset-service-form"
              data-asset-service-form="warranty-create"
              onSubmit={createWarranty}
            >
              <div className="tenancy-form-heading">
                <strong>Record Warranty</strong>
                <span>Coverage fact for this physical Asset</span>
              </div>
              <label>
                Type
                <select defaultValue={WARRANTY_TYPES[0]} disabled={pending} name="warrantyType">
                  {WARRANTY_TYPES.map((value) => (
                    <option key={value} value={value}>{formatDetailKey(value)}</option>
                  ))}
                </select>
              </label>
              <label>
                Provider Party
                <select defaultValue="" disabled={pending} name="providerPartyId">
                  <option value="">No provider</option>
                  {providers.map((party) => (
                    <option key={party.id} value={party.id}>
                      {party.displayName} · {party.code}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Reference
                <input disabled={pending} name="reference" />
              </label>
              <div className="setup-form-grid">
                <label>
                  Valid from
                  <input disabled={pending} name="validFrom" required type="date" />
                </label>
                <label>
                  Valid to
                  <input disabled={pending} name="validTo" type="date" />
                </label>
              </div>
              <label>
                Terms
                <textarea disabled={pending} name="terms" rows={3} />
              </label>
              <button className="button-primary" disabled={pending} type="submit">
                {pendingKey === 'warranty-create' ? 'Recording…' : 'Record Warranty'}
              </button>
            </form>

            <form
              className="setup-form asset-service-form"
              data-asset-service-form="plan-create"
              onSubmit={createPlan}
            >
              <div className="tenancy-form-heading">
                <strong>Create ServicePlan</strong>
                <span>Expected future work, not proof of service</span>
              </div>
              <label>
                Name
                <input disabled={pending} name="name" required />
              </label>
              <label>
                Schedule
                <select
                  disabled={pending}
                  name="scheduleKind"
                  onChange={(event) =>
                    setPlanKind(event.currentTarget.value as ServicePlanKind)
                  }
                  value={planKind}
                >
                  {SERVICE_PLAN_KINDS.map((value) => (
                    <option key={value} value={value}>{formatDetailKey(value)}</option>
                  ))}
                </select>
              </label>
              <label>
                First due
                <input disabled={pending} name="firstDueOn" required type="date" />
              </label>
              {planKind === 'recurring' ? (
                <label>
                  Interval months
                  <input disabled={pending} min="1" name="intervalMonths" required type="number" />
                </label>
              ) : null}
              <label>
                Provider Party
                <select defaultValue="" disabled={pending} name="providerPartyId">
                  <option value="">No provider</option>
                  {activeProviders.map((party) => (
                    <option key={party.id} value={party.id}>
                      {party.displayName} · {party.code}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Notes
                <textarea disabled={pending} name="notes" rows={3} />
              </label>
              {!futurePolicyAllowed ? (
                <p className="setup-hint">
                  Retired/replaced Assets cannot start future service policy.
                </p>
              ) : null}
              <button
                className="button-primary"
                disabled={pending || !futurePolicyAllowed}
                type="submit"
              >
                {pendingKey === 'plan-create' ? 'Creating…' : 'Create ServicePlan'}
              </button>
            </form>

            <form
              className="setup-form asset-service-form"
              data-asset-service-form="event-create"
              onSubmit={recordServiceEvent}
            >
              <div className="tenancy-form-heading">
                <strong>Record ServiceEvent</strong>
                <span>Immutable completed-work occurrence</span>
              </div>
              <label>
                Event type
                <select defaultValue={SERVICE_EVENT_TYPES[0]} disabled={pending} name="eventType">
                  {SERVICE_EVENT_TYPES.map((value) => (
                    <option key={value} value={value}>{formatDetailKey(value)}</option>
                  ))}
                </select>
              </label>
              <div className="setup-form-grid">
                <label>
                  Performed date
                  <input disabled={pending} name="performedDate" required type="date" />
                </label>
                <label>
                  Performed time (UTC)
                  <input disabled={pending} name="performedTime" required type="time" />
                </label>
              </div>
              <label>
                ServicePlan
                <select defaultValue="" disabled={pending} name="servicePlanId">
                  <option value="">No ServicePlan</option>
                  {(plans ?? []).map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.name} · {plan.status}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Warranty Claim
                <select defaultValue="" disabled={pending} name="warrantyClaimId">
                  <option value="">No Warranty Claim</option>
                  {claims.map((claim) => (
                    <option key={claim.id} value={claim.id}>{claimLabel(claim)}</option>
                  ))}
                </select>
              </label>
              <label>
                Provider Party
                <select defaultValue="" disabled={pending} name="providerPartyId">
                  <option value="">No provider</option>
                  {providers.map((party) => (
                    <option key={party.id} value={party.id}>
                      {party.displayName} · {party.code}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Description
                <textarea disabled={pending} name="description" required rows={3} />
              </label>
              <label>
                Reference
                <input disabled={pending} name="reference" />
              </label>
              <button className="button-primary" disabled={pending} type="submit">
                {pendingKey === 'event-create' ? 'Recording…' : 'Record ServiceEvent'}
              </button>
            </form>
          </div>

          <div className="asset-service-history-grid">
            <div className="asset-service-register">
              <div className="record-heading">
                <div>
                  <p className="eyebrow">Coverage register</p>
                  <h3>Warranties + Claims</h3>
                </div>
                <span>{warranties?.length ?? 0} warranties</span>
              </div>
              {warranties?.length === 0 ? (
                <p className="muted">No Warranty coverage recorded.</p>
              ) : (
                warranties?.map((warranty) => (
                  <article className="asset-service-card" key={warranty.id}>
                    <div className="record-heading">
                      <div>
                        <strong>{formatDetailKey(warranty.warrantyType)}</strong>
                        <span>{warranty.reference ?? 'No reference'}</span>
                      </div>
                      <span>{warranty.validFrom} → {warranty.validTo ?? 'open'}</span>
                    </div>
                    <p className="muted">{warranty.terms ?? 'No terms recorded.'}</p>

                    <form
                      className="setup-form compact-service-form"
                      data-asset-service-form="claim-create"
                      onSubmit={(event) => void createClaim(event, warranty)}
                    >
                      <div className="setup-form-grid">
                        <label>
                          Incident date
                          <input disabled={pending} name="incidentOn" required type="date" />
                        </label>
                        <label>
                          Description
                          <input disabled={pending} name="description" required />
                        </label>
                      </div>
                      <button className="button-secondary" disabled={pending} type="submit">
                        Create Claim draft
                      </button>
                    </form>

                    {(claimsByWarranty.get(warranty.id) ?? []).map((claim) => (
                      <div className="asset-service-claim" key={claim.id}>
                        <div className="record-heading">
                          <div>
                            <strong>{claim.incidentOn} · {claim.description}</strong>
                            <span>CAS v{claim.version}</span>
                          </div>
                          <span className={'status-chip status-' + claim.status}>
                            {claim.status}
                          </span>
                        </div>
                        {claim.status === 'draft' ? (
                          <div className="asset-service-actions">
                            <form
                              className="compact-service-form"
                              data-asset-service-form="claim-submit"
                              onSubmit={(event) => void submitClaimForm(event, claim)}
                            >
                              <label>
                                Provider reference
                                <input disabled={pending} name="providerReference" />
                              </label>
                              <button className="button-primary" disabled={pending} type="submit">
                                Submit Claim
                              </button>
                            </form>
                            <button
                              className="button-secondary"
                              disabled={pending}
                              onClick={() => void transitionClaim(claim, 'cancel')}
                              type="button"
                            >
                              Cancel Claim
                            </button>
                          </div>
                        ) : null}
                        {claim.status === 'submitted' ? (
                          <div className="asset-service-actions">
                            <button
                              className="button-primary"
                              disabled={pending}
                              onClick={() => void transitionClaim(claim, 'approve')}
                              type="button"
                            >
                              Approve Claim
                            </button>
                            <button
                              className="button-secondary"
                              disabled={pending}
                              onClick={() => void transitionClaim(claim, 'reject')}
                              type="button"
                            >
                              Reject Claim
                            </button>
                            <button
                              className="button-secondary"
                              disabled={pending}
                              onClick={() => void transitionClaim(claim, 'cancel')}
                              type="button"
                            >
                              Cancel Claim
                            </button>
                          </div>
                        ) : null}
                        {claim.status === 'approved' ? (
                          <button
                            className="button-primary"
                            disabled={pending}
                            onClick={() => void transitionClaim(claim, 'close')}
                            type="button"
                          >
                            Close Claim
                          </button>
                        ) : null}
                      </div>
                    ))}
                  </article>
                ))
              )}
            </div>

            <div className="asset-service-register">
              <div className="record-heading">
                <div>
                  <p className="eyebrow">Future policy</p>
                  <h3>ServicePlans</h3>
                </div>
                <span>{plans?.length ?? 0} plans</span>
              </div>
              {plans?.length === 0 ? (
                <p className="muted">No ServicePlans configured.</p>
              ) : (
                plans?.map((plan) => (
                  <article className="asset-service-card" key={plan.id}>
                    <div className="record-heading">
                      <div>
                        <strong>{plan.name}</strong>
                        <span>
                          {formatDetailKey(plan.scheduleKind)} · due {plan.firstDueOn}
                          {plan.intervalMonths ? ` · every ${plan.intervalMonths} months` : ''}
                        </span>
                      </div>
                      <span className={'status-chip status-' + plan.status}>
                        {plan.status}
                      </span>
                    </div>
                    <div className="asset-service-actions">
                      {plan.status === 'active' ? (
                        <button
                          className="button-secondary"
                          disabled={pending}
                          onClick={() => void transitionPlan(plan, 'paused')}
                          type="button"
                        >
                          Pause Plan
                        </button>
                      ) : null}
                      {plan.status === 'paused' ? (
                        <button
                          className="button-primary"
                          disabled={pending || !futurePolicyAllowed}
                          onClick={() => void transitionPlan(plan, 'active')}
                          type="button"
                        >
                          Reactivate Plan
                        </button>
                      ) : null}
                      {(plan.status === 'active' || plan.status === 'paused') ? (
                        <>
                          <button
                            className="button-secondary"
                            disabled={pending}
                            onClick={() => void transitionPlan(plan, 'ended')}
                            type="button"
                          >
                            End Plan
                          </button>
                          <button
                            className="button-secondary"
                            disabled={pending}
                            onClick={() => void transitionPlan(plan, 'cancelled')}
                            type="button"
                          >
                            Cancel Plan
                          </button>
                        </>
                      ) : null}
                    </div>
                  </article>
                ))
              )}
            </div>
          </div>

          <div className="asset-service-register">
            <div className="record-heading">
              <div>
                <p className="eyebrow">Immutable occurrence history</p>
                <h3>ServiceEvents</h3>
              </div>
              <span>{events?.length ?? 0} events</span>
            </div>
            {events?.length === 0 ? (
              <p className="muted">No ServiceEvents recorded.</p>
            ) : (
              <div className="maintenance-service-list">
                {events?.map((serviceEvent) => (
                  <article className="maintenance-service-card" key={serviceEvent.id}>
                    <div className="record-heading">
                      <strong>{formatDetailKey(serviceEvent.eventType)}</strong>
                      <span>{serviceEvent.performedAt}</span>
                    </div>
                    <p>{serviceEvent.description}</p>
                    <small>
                      {serviceEvent.reference ?? 'No reference'}
                      {serviceEvent.servicePlanId ? ` · plan ${serviceEvent.servicePlanId}` : ''}
                      {serviceEvent.warrantyClaimId ? ` · claim ${serviceEvent.warrantyClaimId}` : ''}
                    </small>
                  </article>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
