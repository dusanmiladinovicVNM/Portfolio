import {
  accessItemCustodyEventRequestSchema,
  accessItemListResponseSchema,
  accessItemResponseSchema,
  accessItemTransactionResponseSchema,
  createAccessItemRequestSchema,
  issueAccessItemRequestSchema,
  retireAccessItemRequestSchema,
  spaceListResponseSchema,
  tenancyListResponseSchema,
  updateAccessItemRequestSchema,
  type AccessItemEntryResponse,
  type AccessItemResponse,
  type SpaceResponse,
  type TenancyResponse,
} from '@portfolio/contracts';
import { ACCESS_ITEM_KINDS, type AccessItemKind } from '@portfolio/domain';
import { type FormEvent, useEffect, useMemo, useState } from 'react';
import {
  accessItemIssuePath,
  accessItemLossPath,
  accessItemPath,
  accessItemRetirePath,
  accessItemReturnPath,
  accessItemsPath,
  unitAccessItemsPath,
  unitSpacesPath,
  unitTenanciesPath,
} from '../api/paths.js';
import {
  PortfolioApiError,
  isAmbiguousWriteFailure,
  type PortfolioApi,
} from '../api/portfolio-api.js';
import {
  contractErrorMessage,
  optionalString,
  requiredString,
} from '../admin/form-utils.js';
import { useCreateSubmissionGuard } from '../admin/use-create-submission-guard.js';
import type { SetNavigationBlocker } from '../navigation/use-workspace-navigation.js';
import {
  formatDetailKey,
  formatSwissDateTime,
  swissLocalDateTimeToInstant,
} from '../presentation/format.js';
import {
  assertAccessItemLabelMutationOwner,
  assertAccessItemReferences,
  assertAccessItemRetirementOwner,
  assertAccessItemTransactionOwner,
  assertCreatedAccessItem,
  assertUnitAccessItemsOwner,
} from './access-item-owner.js';
import {
  assertUnitSpacesOwner,
  assertUnitTenanciesOwner,
} from './route-owner.js';

interface UnitKeysProps {
  readonly api: PortfolioApi;
  readonly propertyId: string;
  readonly unitId: string;
  readonly setNavigationBlocker: SetNavigationBlocker;
}

interface WriteGate {
  readonly pending: boolean;
  readonly tryStart: () => boolean;
  readonly finish: () => void;
}

function accessItemError(cause: unknown, fallback: string): string {
  if (
    cause instanceof PortfolioApiError &&
    (cause.code === 'ACCESS_ITEM_VERSION_CONFLICT' ||
      cause.code === 'ACCESS_ITEM_TRANSACTION_CONFLICT')
  ) {
    return 'This AccessItem changed on the server. Canonical Keys state was reloaded.';
  }
  return cause instanceof Error ? cause.message : fallback;
}

function CreateAccessItemForm({
  api,
  propertyId,
  unitId,
  spaces,
  writeGate,
  onCommitted,
}: {
  readonly api: PortfolioApi;
  readonly propertyId: string;
  readonly unitId: string;
  readonly spaces: readonly SpaceResponse[];
  readonly writeGate: WriteGate;
  readonly onCommitted: () => void;
}) {
  const localSubmission = useCreateSubmissionGuard();
  const [kind, setKind] = useState<AccessItemKind>('key');
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const spaceId = optionalString(form, 'spaceId') ?? null;
    const parsed = createAccessItemRequestSchema.safeParse({
      code: requiredString(form, 'code'),
      kind,
      propertyId,
      unitId,
      spaceId,
      label: requiredString(form, 'label'),
    });
    if (!parsed.success) {
      setError(contractErrorMessage());
      return;
    }
    if (!localSubmission.tryStart() || !writeGate.tryStart()) {
      localSubmission.finish();
      return;
    }

    setError(null);
    try {
      const item = await api.post(
        accessItemsPath(),
        parsed.data,
        accessItemResponseSchema,
      );
      assertCreatedAccessItem(
        {
          code: parsed.data.code,
          kind: parsed.data.kind,
          propertyId,
          unitId,
          spaceId,
          label: parsed.data.label,
        },
        item,
      );
      formElement.reset();
      setKind('key');
      onCommitted();
    } catch (cause) {
      if (isAmbiguousWriteFailure(cause)) {
        try {
          const canonical = await api.get(
            unitAccessItemsPath(unitId),
            accessItemListResponseSchema,
          );
          assertUnitAccessItemsOwner(propertyId, unitId, canonical.items);
          const matches = canonical.items.filter(
            (entry) =>
              entry.item.code.toLowerCase() ===
              parsed.data.code.toLowerCase(),
          );
          if (matches.length === 1) {
            assertCreatedAccessItem(
              {
                code: parsed.data.code,
                kind: parsed.data.kind,
                propertyId,
                unitId,
                spaceId,
                label: parsed.data.label,
              },
              matches[0]!.item,
            );
            setError(null);
            formElement.reset();
            setKind('key');
            onCommitted();
            return;
          }
        } catch {
          // Preserve the ambiguous outcome when canonical reconciliation fails.
        }
        setError(
          'AccessItem creation outcome is unconfirmed. Canonical Keys state was reloaded.',
        );
      } else {
        setError(accessItemError(cause, 'AccessItem could not be created.'));
      }
      onCommitted();
    } finally {
      localSubmission.finish();
      writeGate.finish();
    }
  }

  return (
    <form className="setup-form" data-access-item-form="create" onSubmit={(event) => void submit(event)}>
      <div className="setup-grid">
        <label>
          Code
          <input name="code" required />
        </label>
        <label>
          Kind
          <select
            name="kind"
            onChange={(event) => setKind(event.currentTarget.value as AccessItemKind)}
            value={kind}
          >
            {ACCESS_ITEM_KINDS.map((value) => (
              <option key={value} value={value}>
                {formatDetailKey(value)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Label
          <input name="label" required />
        </label>
        <label>
          Space (optional)
          <select name="spaceId" defaultValue="">
            <option value="">Unit-wide</option>
            {spaces.map((space) => (
              <option key={space.id} value={space.id}>
                {space.name} · {space.code}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <button className="button-primary" disabled={writeGate.pending} type="submit">
        Create AccessItem
      </button>
    </form>
  );
}

function EventFields() {
  return (
    <>
      <label>
        Date
        <input name="date" required type="date" />
      </label>
      <label>
        Time
        <input name="time" required type="time" />
      </label>
      <label>
        Note
        <input name="note" />
      </label>
    </>
  );
}

export function UnitKeys({
  api,
  propertyId,
  unitId,
  setNavigationBlocker,
}: UnitKeysProps) {
  const [entries, setEntries] =
    useState<readonly AccessItemEntryResponse[] | null>(null);
  const [spaces, setSpaces] = useState<readonly SpaceResponse[] | null>(null);
  const [tenancies, setTenancies] =
    useState<readonly TenancyResponse[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [writeError, setWriteError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [writePending, setWritePending] = useState(false);
  const writeSubmission = useCreateSubmissionGuard();

  const writeGate: WriteGate = {
    pending: writePending,
    tryStart: () => {
      if (!writeSubmission.tryStart()) return false;
      setNavigationBlocker(() => false);
      setWritePending(true);
      return true;
    },
    finish: () => {
      writeSubmission.finish();
      setNavigationBlocker(null);
      if (writeSubmission.isMounted()) setWritePending(false);
    },
  };

  useEffect(
    () => () => setNavigationBlocker(null),
    [setNavigationBlocker],
  );

  useEffect(() => {
    const controller = new AbortController();
    setEntries(null);
    setSpaces(null);
    setTenancies(null);
    setLoadError(null);

    void Promise.all([
      api.get(unitAccessItemsPath(unitId), accessItemListResponseSchema, {
        signal: controller.signal,
      }),
      api.get(unitSpacesPath(unitId), spaceListResponseSchema, {
        signal: controller.signal,
      }),
      api.get(unitTenanciesPath(unitId), tenancyListResponseSchema, {
        signal: controller.signal,
      }),
    ])
      .then(([accessResponse, spaceResponse, tenancyResponse]) => {
        if (controller.signal.aborted) return;
        assertUnitAccessItemsOwner(propertyId, unitId, accessResponse.items);
        assertUnitSpacesOwner(unitId, spaceResponse.items);
        assertUnitTenanciesOwner(unitId, tenancyResponse.items);
        assertAccessItemReferences(
          accessResponse.items,
          spaceResponse.items,
          tenancyResponse.items,
        );
        setEntries(accessResponse.items);
        setSpaces(spaceResponse.items);
        setTenancies(tenancyResponse.items);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setLoadError(
          cause instanceof Error
            ? cause.message
            : 'Keys workspace could not be loaded.',
        );
      });

    return () => controller.abort();
  }, [api, propertyId, revision, unitId]);

  const eligibleTenancies = useMemo(
    () =>
      (tenancies ?? []).filter(
        (tenancy) =>
          tenancy.actualStart !== null &&
          ['active', 'notice_given', 'move_out_pending'].includes(
            tenancy.status,
          ),
      ),
    [tenancies],
  );
  const tenancyById = useMemo(
    () => new Map((tenancies ?? []).map((tenancy) => [tenancy.id, tenancy] as const)),
    [tenancies],
  );
  const spaceById = useMemo(
    () => new Map((spaces ?? []).map((space) => [space.id, space] as const)),
    [spaces],
  );

  function refreshCanonical() {
    setRevision((value) => value + 1);
  }

  async function runItemWrite(
    action: () => Promise<void>,
    fallback: string,
  ) {
    if (!writeGate.tryStart()) return;
    setWriteError(null);
    try {
      await action();
    } catch (cause) {
      setWriteError(accessItemError(cause, fallback));
    } finally {
      refreshCanonical();
      writeGate.finish();
    }
  }

  async function updateLabel(
    entry: AccessItemEntryResponse,
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const parsed = updateAccessItemRequestSchema.safeParse({
      expectedVersion: entry.item.version,
      label: requiredString(form, 'label'),
    });
    if (!parsed.success) {
      setWriteError(contractErrorMessage());
      return;
    }
    await runItemWrite(async () => {
      const response = await api.patch(
        accessItemPath(entry.item.id),
        parsed.data,
        accessItemResponseSchema,
      );
      assertAccessItemLabelMutationOwner(
        entry.item,
        parsed.data.label,
        response,
      );
    }, 'AccessItem label could not be saved.');
  }

  async function issue(
    entry: AccessItemEntryResponse,
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const occurredAt = swissLocalDateTimeToInstant(
      requiredString(form, 'date'),
      requiredString(form, 'time'),
    );
    const note = optionalString(form, 'note') ?? null;
    const parsed = issueAccessItemRequestSchema.safeParse({
      tenancyId: requiredString(form, 'tenancyId'),
      expectedLastTransactionId: entry.state.lastTransaction?.id ?? null,
      occurredAt,
      note,
    });
    if (!parsed.success) {
      setWriteError(contractErrorMessage());
      return;
    }
    await runItemWrite(async () => {
      const response = await api.post(
        accessItemIssuePath(entry.item.id),
        parsed.data,
        accessItemTransactionResponseSchema,
      );
      assertAccessItemTransactionOwner(
        entry.item.id,
        {
          tenancyId: parsed.data.tenancyId,
          type: 'issued',
          occurredAt: parsed.data.occurredAt,
          note,
        },
        response,
      );
    }, 'AccessItem could not be issued.');
  }

  async function custodyEvent(
    entry: AccessItemEntryResponse,
    type: 'returned' | 'lost',
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    if (entry.state.tenancyId === null) {
      setWriteError('AccessItem is not currently held by a Tenancy.');
      return;
    }
    const form = new FormData(event.currentTarget);
    const occurredAt = swissLocalDateTimeToInstant(
      requiredString(form, 'date'),
      requiredString(form, 'time'),
    );
    const note = optionalString(form, 'note') ?? null;
    const parsed = accessItemCustodyEventRequestSchema.safeParse({
      expectedLastTransactionId: entry.state.lastTransaction?.id ?? null,
      occurredAt,
      note,
    });
    if (!parsed.success) {
      setWriteError(contractErrorMessage());
      return;
    }
    await runItemWrite(async () => {
      const response = await api.post(
        type === 'returned'
          ? accessItemReturnPath(entry.item.id)
          : accessItemLossPath(entry.item.id),
        parsed.data,
        accessItemTransactionResponseSchema,
      );
      assertAccessItemTransactionOwner(
        entry.item.id,
        {
          tenancyId: entry.state.tenancyId!,
          type,
          occurredAt: parsed.data.occurredAt,
          note,
        },
        response,
      );
    }, type === 'returned'
      ? 'AccessItem return could not be recorded.'
      : 'AccessItem loss could not be recorded.');
  }

  async function retire(
    entry: AccessItemEntryResponse,
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const parsed = retireAccessItemRequestSchema.safeParse({
      expectedVersion: entry.item.version,
      retirementReason: requiredString(form, 'retirementReason'),
    });
    if (!parsed.success) {
      setWriteError(contractErrorMessage());
      return;
    }
    await runItemWrite(async () => {
      const response = await api.post(
        accessItemRetirePath(entry.item.id),
        parsed.data,
        accessItemResponseSchema,
      );
      assertAccessItemRetirementOwner(
        entry.item,
        parsed.data.retirementReason,
        response,
      );
    }, 'AccessItem could not be retired.');
  }

  if (loadError) {
    return (
      <section className="panel state-panel" role="alert">
        <p className="eyebrow">Keys & access items</p>
        <h2>Keys workspace unavailable</h2>
        <p>{loadError}</p>
      </section>
    );
  }

  if (entries === null || spaces === null || tenancies === null) {
    return (
      <section className="panel state-panel" aria-live="polite">
        <p className="eyebrow">Keys & access items</p>
        <h2>Restoring canonical custody state…</h2>
      </section>
    );
  }

  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Keys & access items</p>
          <h2>Physical access inventory and custody</h2>
        </div>
        <span className="section-note">
          Unit/Space inventory scope · Tenancy custody ledger
        </span>
      </div>

      <CreateAccessItemForm
        api={api}
        onCommitted={refreshCanonical}
        propertyId={propertyId}
        spaces={spaces}
        unitId={unitId}
        writeGate={writeGate}
      />

      {writeError ? (
        <p className="form-error" role="alert">{writeError}</p>
      ) : null}

      {entries.length === 0 ? (
        <p>No AccessItems defined for this Unit.</p>
      ) : (
        <div className="selection-list">
          {entries.map((entry) => {
            const item = entry.item;
            const holder =
              entry.state.tenancyId === null
                ? null
                : tenancyById.get(entry.state.tenancyId) ?? null;
            const space =
              item.spaceId === null ? null : spaceById.get(item.spaceId) ?? null;
            return (
              <article
                className="selection-card access-item-card"
                data-access-item-code={item.code}
                key={item.id}
              >
                <div className="selection-card-heading">
                  <div>
                    <span className="eyebrow">{item.code} · {formatDetailKey(item.kind)}</span>
                    <h3>{item.label}</h3>
                  </div>
                  <span className="status-chip">{item.status}</span>
                  <span className="status-chip">{entry.state.kind}</span>
                </div>
                <p>
                  Scope: {space ? `${space.name} · ${space.code}` : 'Unit-wide'}
                </p>
                <p>
                  Custody: {holder ? holder.code : 'Available'}
                  {entry.state.lastTransaction
                    ? ` · ${formatSwissDateTime(entry.state.lastTransaction.occurredAt)}`
                    : ''}
                </p>

                <form
                  className="setup-form"
                  data-access-item-form="label"
                  data-access-item-id={item.id}
                  onSubmit={(event) => void updateLabel(entry, event)}
                >
                  <label>
                    Label
                    <input defaultValue={item.label} name="label" required />
                  </label>
                  <button disabled={writeGate.pending} type="submit">
                    Save label
                  </button>
                </form>

                {item.status === 'active' &&
                entry.state.kind === 'available' ? (
                  <form
                    className="setup-form"
                    data-access-item-form="issue"
                    data-access-item-id={item.id}
                    onSubmit={(event) => void issue(entry, event)}
                  >
                    <div className="setup-grid">
                      <label>
                        Tenancy
                        <select
                          defaultValue=""
                          disabled={eligibleTenancies.length === 0}
                          name="tenancyId"
                          required
                        >
                          <option value="">Select Tenancy…</option>
                          {eligibleTenancies.map((tenancy) => (
                            <option key={tenancy.id} value={tenancy.id}>
                              {tenancy.code}
                            </option>
                          ))}
                        </select>
                      </label>
                      <EventFields />
                    </div>
                    <button
                      disabled={
                        writeGate.pending || eligibleTenancies.length === 0
                      }
                      type="submit"
                    >
                      Issue AccessItem
                    </button>
                  </form>
                ) : null}

                {entry.state.kind === 'issued' ? (
                  <form
                    className="setup-form"
                    data-access-item-form="loss"
                    data-access-item-id={item.id}
                    onSubmit={(event) => void custodyEvent(entry, 'lost', event)}
                  >
                    <div className="setup-grid">
                      <EventFields />
                    </div>
                    <button disabled={writeGate.pending} type="submit">
                      Report lost
                    </button>
                  </form>
                ) : null}

                {entry.state.kind === 'issued' ||
                entry.state.kind === 'lost' ? (
                  <form
                    className="setup-form"
                    data-access-item-form="return"
                    data-access-item-id={item.id}
                    onSubmit={(event) =>
                      void custodyEvent(entry, 'returned', event)
                    }
                  >
                    <div className="setup-grid">
                      <EventFields />
                    </div>
                    <button disabled={writeGate.pending} type="submit">
                      Record return
                    </button>
                  </form>
                ) : null}

                {item.status === 'active' ? (
                  <form
                    className="setup-form"
                    data-access-item-form="retire"
                    data-access-item-id={item.id}
                    onSubmit={(event) => void retire(entry, event)}
                  >
                    <label>
                      Retirement reason
                      <input name="retirementReason" required />
                    </label>
                    <button disabled={writeGate.pending} type="submit">
                      Retire AccessItem
                    </button>
                  </form>
                ) : (
                  <p>
                    Retired: {item.retiredAt ? formatSwissDateTime(item.retiredAt) : '—'}
                    {item.retirementReason ? ` · ${item.retirementReason}` : ''}
                  </p>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
