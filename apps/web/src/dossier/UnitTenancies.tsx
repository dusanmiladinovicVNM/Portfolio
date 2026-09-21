import {
  activateTenancyRequestSchema,
  addTenancyPartyRequestSchema,
  createTenancyRequestSchema,
  endTenancyRequestSchema,
  giveTenancyNoticeRequestSchema,
  partyListResponseSchema,
  planTenancyRequestSchema,
  tenancyListResponseSchema,
  tenancyResponseSchema,
  tenancyVersionRequestSchema,
  type PartyResponse,
  type TenancyResponse,
} from '@portfolio/contracts';
import { TENANCY_PARTY_ROLES, type TenancyPartyRole } from '@portfolio/domain';
import {
  type FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  partiesPath,
  tenancyActivatePath,
  tenancyCancelPath,
  tenancyEndPath,
  tenancyGiveNoticePath,
  tenancyMoveOutPendingPath,
  tenancyPartiesPath,
  tenancyPlanPath,
  unitTenanciesPath,
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
import { useCreateSubmissionGuard } from '../admin/use-create-submission-guard.js';
import { WorkspaceLink } from '../navigation/WorkspaceLink.js';
import { unitRoute } from '../navigation/workspace-route.js';
import type { NavigateWorkspace } from '../navigation/use-workspace-navigation.js';
import { formatDetailKey } from '../presentation/format.js';
import {
  assertTenancyMutationOwner,
  assertUnitTenanciesOwner,
} from './route-owner.js';

interface UnitTenanciesProps {
  readonly api: PortfolioApi;
  readonly propertyId: string;
  readonly unitId: string;
  readonly asOf: string;
  readonly navigate: NavigateWorkspace;
}

function period(tenancy: TenancyResponse): string {
  if (tenancy.actualStart) {
    return `${tenancy.actualStart} → ${tenancy.actualEnd ?? 'open'}`;
  }
  if (tenancy.plannedStart) {
    return `${tenancy.plannedStart} → ${tenancy.plannedEnd ?? 'open'}`;
  }
  return 'Not scheduled';
}

function partyName(
  parties: readonly PartyResponse[] | null,
  partyId: string,
): string {
  return parties?.find((party) => party.id === partyId)?.displayName ?? partyId;
}

function mutationError(cause: unknown, fallback: string): string {
  if (
    cause instanceof PortfolioApiError &&
    cause.code === 'TENANCY_VERSION_CONFLICT'
  ) {
    return 'This Tenancy changed on the server. Reload Tenancies before retrying.';
  }
  return cause instanceof Error ? cause.message : fallback;
}

function NewTenancyForm({
  disabled,
  error,
  onSubmit,
  submitting,
}: {
  readonly disabled: boolean;
  readonly error: string | null;
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  readonly submitting: boolean;
}) {
  return (
    <form
      className="setup-form"
      data-tenancy-form="create"
      onSubmit={onSubmit}
    >
      <div className="setup-form-grid">
        <label>
          Tenancy code
          <input name="code" placeholder="TEN-2026-001" required />
        </label>
      </div>
      {error ? <p className="setup-form-error" role="alert">{error}</p> : null}
      <div className="setup-form-actions">
        <span className="setup-hint">
          Creates a draft only. Parties and dates are attached through the
          lifecycle workflow below.
        </span>
        <button
          className="button-primary"
          disabled={disabled || submitting}
          type="submit"
        >
          {disabled
            ? 'Loading Tenancies…'
            : submitting
              ? 'Creating…'
              : 'Create Tenancy'}
        </button>
      </div>
    </form>
  );
}

function TenancyPartyForm({
  parties,
  pending,
  tenancy,
  onSubmit,
}: {
  readonly parties: readonly PartyResponse[] | null;
  readonly pending: boolean;
  readonly tenancy: TenancyResponse;
  readonly onSubmit: (
    event: FormEvent<HTMLFormElement>,
    tenancy: TenancyResponse,
  ) => void;
}) {
  const [role, setRole] = useState<TenancyPartyRole>('tenant');
  const activeParties = useMemo(
    () =>
      (parties ?? [])
        .filter((party) => party.status === 'active')
        .sort((left, right) =>
          left.displayName.localeCompare(right.displayName),
        ),
    [parties],
  );
  const primaryAllowed = role === 'tenant' || role === 'co_tenant';

  return (
    <form
      className="tenancy-inline-form"
      data-tenancy-form="party"
      onSubmit={(event) => onSubmit(event, tenancy)}
    >
      <div className="tenancy-form-heading">
        <strong>Attach Party</strong>
        <span>Allowed while draft or planned</span>
      </div>
      <div className="tenancy-form-grid">
        <label>
          Party
          <select
            disabled={parties === null || activeParties.length === 0 || pending}
            name="partyId"
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
          Role
          <select
            disabled={pending}
            name="role"
            onChange={(event) =>
              setRole(event.currentTarget.value as TenancyPartyRole)
            }
            value={role}
          >
            {TENANCY_PARTY_ROLES.map((value) => (
              <option key={value} value={value}>
                {formatDetailKey(value)}
              </option>
            ))}
          </select>
        </label>
        <label className="tenancy-checkbox">
          <input
            disabled={!primaryAllowed || pending}
            name="isPrimary"
            type="checkbox"
          />
          Primary tenant
        </label>
      </div>
      <button
        className="button-secondary"
        disabled={parties === null || activeParties.length === 0 || pending}
        type="submit"
      >
        {parties === null ? 'Loading Parties…' : 'Attach Party'}
      </button>
    </form>
  );
}

function PlanForm({
  pending,
  tenancy,
  onSubmit,
}: {
  readonly pending: boolean;
  readonly tenancy: TenancyResponse;
  readonly onSubmit: (
    event: FormEvent<HTMLFormElement>,
    tenancy: TenancyResponse,
  ) => void;
}) {
  return (
    <form
      className="tenancy-inline-form"
      data-tenancy-form="plan"
      onSubmit={(event) => onSubmit(event, tenancy)}
    >
      <div className="tenancy-form-heading">
        <strong>Plan occupancy</strong>
        <span>Reservation dates · server checks overlap</span>
      </div>
      <div className="tenancy-form-grid">
        <label>
          Planned start
          <input disabled={pending} name="plannedStart" required type="date" />
        </label>
        <label>
          Planned end
          <input disabled={pending} name="plannedEnd" type="date" />
        </label>
      </div>
      <button className="button-primary" disabled={pending} type="submit">
        Plan Tenancy
      </button>
    </form>
  );
}

function ActivateForm({
  pending,
  tenancy,
  onSubmit,
}: {
  readonly pending: boolean;
  readonly tenancy: TenancyResponse;
  readonly onSubmit: (
    event: FormEvent<HTMLFormElement>,
    tenancy: TenancyResponse,
  ) => void;
}) {
  return (
    <form
      className="tenancy-inline-form"
      data-tenancy-form="activate"
      onSubmit={(event) => onSubmit(event, tenancy)}
    >
      <div className="tenancy-form-heading">
        <strong>Activate</strong>
        <span>Requires tenant/co-tenant and non-overlapping actual occupancy</span>
      </div>
      <label>
        Actual start
        <input disabled={pending} name="actualStart" required type="date" />
      </label>
      <button className="button-primary" disabled={pending} type="submit">
        Activate Tenancy
      </button>
    </form>
  );
}

function NoticeForm({
  pending,
  tenancy,
  onSubmit,
}: {
  readonly pending: boolean;
  readonly tenancy: TenancyResponse;
  readonly onSubmit: (
    event: FormEvent<HTMLFormElement>,
    tenancy: TenancyResponse,
  ) => void;
}) {
  return (
    <form
      className="tenancy-inline-form"
      data-tenancy-form="notice"
      onSubmit={(event) => onSubmit(event, tenancy)}
    >
      <div className="tenancy-form-heading">
        <strong>Give notice</strong>
        <span>Records notice and termination effective dates</span>
      </div>
      <div className="tenancy-form-grid">
        <label>
          Notice given
          <input disabled={pending} name="noticeGivenAt" required type="date" />
        </label>
        <label>
          Termination effective
          <input
            disabled={pending}
            name="terminationEffectiveAt"
            required
            type="date"
          />
        </label>
      </div>
      <button className="button-primary" disabled={pending} type="submit">
        Give Notice
      </button>
    </form>
  );
}

function EndForm({
  pending,
  tenancy,
  onSubmit,
}: {
  readonly pending: boolean;
  readonly tenancy: TenancyResponse;
  readonly onSubmit: (
    event: FormEvent<HTMLFormElement>,
    tenancy: TenancyResponse,
  ) => void;
}) {
  return (
    <form
      className="tenancy-inline-form"
      data-tenancy-form="end"
      onSubmit={(event) => onSubmit(event, tenancy)}
    >
      <div className="tenancy-form-heading">
        <strong>End occupancy</strong>
        <span>Terminal actual occupancy fact</span>
      </div>
      <label>
        Actual end
        <input disabled={pending} name="actualEnd" required type="date" />
      </label>
      <button className="button-primary" disabled={pending} type="submit">
        End Tenancy
      </button>
    </form>
  );
}

export function UnitTenancies({
  api,
  propertyId,
  unitId,
  asOf,
  navigate,
}: UnitTenanciesProps) {
  const [tenancies, setTenancies] =
    useState<readonly TenancyResponse[] | null>(null);
  const [parties, setParties] =
    useState<readonly PartyResponse[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [partyLoadError, setPartyLoadError] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [actionErrors, setActionErrors] =
    useState<Readonly<Record<string, string>>>({});
  const [submittingCreate, setSubmittingCreate] = useState(false);
  const [pendingTenancies, setPendingTenancies] =
    useState<ReadonlySet<string>>(() => new Set());
  const pendingTenanciesRef = useRef<Set<string>>(new Set());
  const mountedRef = useRef(true);
  const [reloadToken, setReloadToken] = useState(0);
  const createSubmission = useCreateSubmissionGuard();

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setTenancies(null);
    setLoadError(null);

    void api
      .get(unitTenanciesPath(unitId), tenancyListResponseSchema, {
        signal: controller.signal,
      })
      .then((response) => {
        assertUnitTenanciesOwner(unitId, response.items);
        setTenancies(response.items);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setLoadError(
          cause instanceof Error
            ? cause.message
            : 'Tenancies could not be loaded.',
        );
      });

    return () => controller.abort();
  }, [api, reloadToken, unitId]);

  useEffect(() => {
    const controller = new AbortController();
    setParties(null);
    setPartyLoadError(null);

    void api
      .get(partiesPath(), partyListResponseSchema, {
        signal: controller.signal,
      })
      .then((response) => setParties(response.items))
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setPartyLoadError(
          cause instanceof Error
            ? cause.message
            : 'Party directory could not be loaded.',
        );
      });

    return () => controller.abort();
  }, [api]);

  function beginMutation(tenancyId: string): boolean {
    if (pendingTenanciesRef.current.has(tenancyId)) return false;
    pendingTenanciesRef.current.add(tenancyId);
    setPendingTenancies((current) => {
      const next = new Set(current);
      next.add(tenancyId);
      return next;
    });
    setActionErrors((current) => {
      const next = { ...current };
      delete next[tenancyId];
      return next;
    });
    return true;
  }

  function finishMutation(tenancyId: string): void {
    pendingTenanciesRef.current.delete(tenancyId);
    if (!mountedRef.current) return;
    setPendingTenancies((current) => {
      const next = new Set(current);
      next.delete(tenancyId);
      return next;
    });
  }

  function acceptMutation(
    target: TenancyResponse,
    expectedVersion: number,
    updated: TenancyResponse,
  ): void {
    assertTenancyMutationOwner(
      unitId,
      target.id,
      expectedVersion,
      updated,
    );
    if (!mountedRef.current) return;

    setTenancies((current) => {
      if (!current) return current;
      return current.map((item) =>
        item.id === target.id && item.version === expectedVersion
          ? updated
          : item,
      );
    });
  }

  function setMutationError(tenancyId: string, message: string): void {
    if (!mountedRef.current) return;
    setActionErrors((current) => ({ ...current, [tenancyId]: message }));
  }

  async function postMutation(
    tenancy: TenancyResponse,
    path: string,
    body: unknown,
    fallbackError: string,
  ): Promise<void> {
    if (!beginMutation(tenancy.id)) return;
    const expectedVersion = tenancy.version;

    try {
      const updated = await api.post(path, body, tenancyResponseSchema);
      acceptMutation(tenancy, expectedVersion, updated);
    } catch (cause) {
      setMutationError(tenancy.id, mutationError(cause, fallbackError));
    } finally {
      finishMutation(tenancy.id);
    }
  }

  async function createTenancy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (tenancies === null || !createSubmission.tryStart()) return;

    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const parsed = createTenancyRequestSchema.safeParse({
      code: requiredString(form, 'code'),
    });

    if (!parsed.success) {
      createSubmission.finish();
      setCreateError(contractErrorMessage());
      return;
    }

    setSubmittingCreate(true);
    setCreateError(null);
    try {
      const created = await api.post(
        unitTenanciesPath(unitId),
        parsed.data,
        tenancyResponseSchema,
      );
      if (created.unitId !== unitId || created.version !== 1) {
        throw new Error(
          'Created Tenancy does not match the Unit or initial lifecycle version.',
        );
      }
      if (createSubmission.isMounted()) {
        setTenancies((current) => [
          created,
          ...(current ?? []).filter((item) => item.id !== created.id),
        ]);
        formElement.reset();
      }
    } catch (cause) {
      if (createSubmission.isMounted()) {
        setCreateError(
          cause instanceof Error
            ? cause.message
            : 'Tenancy could not be created.',
        );
      }
    } finally {
      createSubmission.finish();
      if (createSubmission.isMounted()) setSubmittingCreate(false);
    }
  }

  async function addParty(
    event: FormEvent<HTMLFormElement>,
    tenancy: TenancyResponse,
  ) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const parsed = addTenancyPartyRequestSchema.safeParse({
      expectedVersion: tenancy.version,
      partyId: requiredString(form, 'partyId'),
      role: requiredString(form, 'role'),
      isPrimary: form.get('isPrimary') === 'on',
    });
    if (!parsed.success) {
      setMutationError(tenancy.id, contractErrorMessage());
      return;
    }
    await postMutation(
      tenancy,
      tenancyPartiesPath(tenancy.id),
      parsed.data,
      'Party could not be attached to the Tenancy.',
    );
  }

  async function plan(
    event: FormEvent<HTMLFormElement>,
    tenancy: TenancyResponse,
  ) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const parsed = planTenancyRequestSchema.safeParse({
      expectedVersion: tenancy.version,
      plannedStart: requiredString(form, 'plannedStart'),
      plannedEnd: optionalString(form, 'plannedEnd') ?? null,
    });
    if (!parsed.success) {
      setMutationError(tenancy.id, contractErrorMessage());
      return;
    }
    await postMutation(
      tenancy,
      tenancyPlanPath(tenancy.id),
      parsed.data,
      'Tenancy could not be planned.',
    );
  }

  async function activate(
    event: FormEvent<HTMLFormElement>,
    tenancy: TenancyResponse,
  ) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const parsed = activateTenancyRequestSchema.safeParse({
      expectedVersion: tenancy.version,
      actualStart: requiredString(form, 'actualStart'),
    });
    if (!parsed.success) {
      setMutationError(tenancy.id, contractErrorMessage());
      return;
    }
    await postMutation(
      tenancy,
      tenancyActivatePath(tenancy.id),
      parsed.data,
      'Tenancy could not be activated.',
    );
  }

  async function giveNotice(
    event: FormEvent<HTMLFormElement>,
    tenancy: TenancyResponse,
  ) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const parsed = giveTenancyNoticeRequestSchema.safeParse({
      expectedVersion: tenancy.version,
      noticeGivenAt: requiredString(form, 'noticeGivenAt'),
      terminationEffectiveAt: requiredString(
        form,
        'terminationEffectiveAt',
      ),
    });
    if (!parsed.success) {
      setMutationError(tenancy.id, contractErrorMessage());
      return;
    }
    await postMutation(
      tenancy,
      tenancyGiveNoticePath(tenancy.id),
      parsed.data,
      'Notice could not be recorded.',
    );
  }

  async function moveOutPending(tenancy: TenancyResponse) {
    const parsed = tenancyVersionRequestSchema.safeParse({
      expectedVersion: tenancy.version,
    });
    if (!parsed.success) {
      setMutationError(tenancy.id, contractErrorMessage());
      return;
    }
    await postMutation(
      tenancy,
      tenancyMoveOutPendingPath(tenancy.id),
      parsed.data,
      'Tenancy could not enter move-out pending.',
    );
  }

  async function end(
    event: FormEvent<HTMLFormElement>,
    tenancy: TenancyResponse,
  ) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const parsed = endTenancyRequestSchema.safeParse({
      expectedVersion: tenancy.version,
      actualEnd: requiredString(form, 'actualEnd'),
    });
    if (!parsed.success) {
      setMutationError(tenancy.id, contractErrorMessage());
      return;
    }
    await postMutation(
      tenancy,
      tenancyEndPath(tenancy.id),
      parsed.data,
      'Tenancy could not be ended.',
    );
  }

  async function cancel(tenancy: TenancyResponse) {
    const parsed = tenancyVersionRequestSchema.safeParse({
      expectedVersion: tenancy.version,
    });
    if (!parsed.success) {
      setMutationError(tenancy.id, contractErrorMessage());
      return;
    }
    await postMutation(
      tenancy,
      tenancyCancelPath(tenancy.id),
      parsed.data,
      'Tenancy could not be cancelled.',
    );
  }

  return (
    <div className="dashboard-stack">
      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Leasing administration</p>
            <h2>New Tenancy</h2>
          </div>
          <span className="section-note">
            Draft → parties → plan → actual occupancy
          </span>
        </div>
        <NewTenancyForm
          disabled={tenancies === null}
          error={createError}
          onSubmit={createTenancy}
          submitting={submittingCreate}
        />
      </section>

      <section className="panel page-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Current lifecycle registry</p>
            <h2>Tenancies</h2>
          </div>
          <div className="tenancy-heading-actions">
            <span className="section-note">
              Current records · reporting context {asOf} is preserved for
              drill-down
            </span>
            <button
              className="button-secondary"
              onClick={() => setReloadToken((value) => value + 1)}
              type="button"
            >
              Reload Tenancies
            </button>
          </div>
        </div>

        {loadError ? <p className="form-error" role="alert">{loadError}</p> : null}
        {partyLoadError ? (
          <p className="form-error" role="alert">
            Party directory unavailable: {partyLoadError}
          </p>
        ) : null}
        {!loadError && tenancies === null ? (
          <p className="muted" aria-live="polite">Loading Tenancies…</p>
        ) : null}
        {tenancies?.length === 0 ? (
          <p className="muted">No Tenancy records exist for this Unit.</p>
        ) : null}

        {tenancies && tenancies.length > 0 ? (
          <div className="tenancy-grid tenancy-admin-grid">
            {tenancies.map((tenancy) => {
              const pending = pendingTenancies.has(tenancy.id);
              const canAttachParty =
                tenancy.status === 'draft' || tenancy.status === 'planned';

              return (
                <article className="tenancy-card" key={tenancy.id}>
                  <div className="record-heading">
                    <div>
                      <span className="eyebrow">{tenancy.code}</span>
                      <h3>{formatDetailKey(tenancy.status)}</h3>
                    </div>
                    <span className="status-chip">{tenancy.status}</span>
                  </div>

                  <dl className="detail-list">
                    <div><dt>Lifecycle period</dt><dd>{period(tenancy)}</dd></div>
                    <div><dt>Notice given</dt><dd>{tenancy.noticeGivenAt ?? '—'}</dd></div>
                    <div><dt>Termination effective</dt><dd>{tenancy.terminationEffectiveAt ?? '—'}</dd></div>
                    <div><dt>Parties</dt><dd>{tenancy.parties.length}</dd></div>
                    <div><dt>Version</dt><dd>{tenancy.version}</dd></div>
                  </dl>

                  {tenancy.parties.length > 0 ? (
                    <ul
                      aria-label="Tenancy party roles"
                      className="role-list"
                    >
                      {tenancy.parties.map((party) => (
                        <li key={party.id}>
                          <strong>{partyName(parties, party.partyId)}</strong>
                          <span>
                            {formatDetailKey(party.role)}
                            {party.isPrimary ? ' · primary' : ''}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="muted tenancy-empty-parties">
                      No Parties attached yet.
                    </p>
                  )}

                  {actionErrors[tenancy.id] ? (
                    <p className="setup-form-error" role="alert">
                      {actionErrors[tenancy.id]}
                    </p>
                  ) : null}

                  <div className="tenancy-workflow">
                    {canAttachParty ? (
                      <TenancyPartyForm
                        onSubmit={addParty}
                        parties={parties}
                        pending={pending}
                        tenancy={tenancy}
                      />
                    ) : null}

                    {tenancy.status === 'draft' ? (
                      <>
                        <PlanForm
                          onSubmit={plan}
                          pending={pending}
                          tenancy={tenancy}
                        />
                        <button
                          className="button-secondary tenancy-terminal-action"
                          disabled={pending}
                          onClick={() => void cancel(tenancy)}
                          type="button"
                        >
                          Cancel Tenancy
                        </button>
                      </>
                    ) : null}

                    {tenancy.status === 'planned' ? (
                      <>
                        <ActivateForm
                          onSubmit={activate}
                          pending={pending}
                          tenancy={tenancy}
                        />
                        <button
                          className="button-secondary tenancy-terminal-action"
                          disabled={pending}
                          onClick={() => void cancel(tenancy)}
                          type="button"
                        >
                          Cancel Tenancy
                        </button>
                      </>
                    ) : null}

                    {tenancy.status === 'active' ? (
                      <>
                        <NoticeForm
                          onSubmit={giveNotice}
                          pending={pending}
                          tenancy={tenancy}
                        />
                        <EndForm
                          onSubmit={end}
                          pending={pending}
                          tenancy={tenancy}
                        />
                      </>
                    ) : null}

                    {tenancy.status === 'notice_given' ? (
                      <>
                        <button
                          className="button-secondary"
                          disabled={pending}
                          onClick={() => void moveOutPending(tenancy)}
                          type="button"
                        >
                          Mark Move-out Pending
                        </button>
                        <EndForm
                          onSubmit={end}
                          pending={pending}
                          tenancy={tenancy}
                        />
                      </>
                    ) : null}

                    {tenancy.status === 'move_out_pending' ? (
                      <EndForm
                        onSubmit={end}
                        pending={pending}
                        tenancy={tenancy}
                      />
                    ) : null}
                  </div>

                  <WorkspaceLink
                    className="record-action"
                    navigate={navigate}
                    route={unitRoute(
                      propertyId,
                      unitId,
                      asOf,
                      'contracts',
                      { tenancyId: tenancy.id },
                    )}
                  >
                    Open contract dossier →
                  </WorkspaceLink>
                </article>
              );
            })}
          </div>
        ) : null}
      </section>
    </div>
  );
}
