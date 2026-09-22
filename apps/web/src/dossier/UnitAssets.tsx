import {
  assetListResponseSchema,
  assetLocationHistoryListResponseSchema,
  assetReplacementLinksResponseSchema,
  assetResponseSchema,
  changeAssetStatusRequestSchema,
  createAssetRequestSchema,
  moveAssetRequestSchema,
  replaceAssetRequestSchema,
  replaceAssetResponseSchema,
  spaceListResponseSchema,
  unitListResponseSchema,
  updateAssetMetadataRequestSchema,
  type AssetLocationHistoryResponse,
  type AssetResponse,
  type SpaceResponse,
  type UnitResponse,
} from '@portfolio/contracts';
import {
  ASSET_IDENTIFIER_TYPES,
  type AssetIdentifierType,
} from '@portfolio/domain';
import {
  type FormEvent,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  assetLocationHistoryPath,
  assetMetadataPath,
  assetMovePath,
  assetReplacementLinksPath,
  assetReplacementPath,
  assetsPath,
  assetStatusPath,
  propertyUnitsPath,
  unitAssetsPath,
  unitSpacesPath,
} from '../api/paths.js';
import {
  PortfolioApiError,
  type PortfolioApi,
} from '../api/portfolio-api.js';
import {
  contractErrorMessage,
  requiredString,
} from '../admin/form-utils.js';
import { useCreateSubmissionGuard } from '../admin/use-create-submission-guard.js';
import { WorkspaceLink } from '../navigation/WorkspaceLink.js';
import { unitRoute } from '../navigation/workspace-route.js';
import type {
  NavigateWorkspace,
  SetNavigationBlocker,
} from '../navigation/use-workspace-navigation.js';
import { formatDetailKey } from '../presentation/format.js';
import {
  assertAssetDestinationSpacesOwner,
  assertAssetDestinationUnitsOwner,
  assertAssetLocationHistoryOwner,
  assertAssetMetadataMutationOwner,
  assertAssetMoveMutationOwner,
  assertAssetReplacementLinksOwner,
  assertAssetReplacementMutationOwner,
  assertAssetStatusMutationOwner,
  assertCreatedAsset,
  assertUnitAssetsOwner,
} from './asset-owner.js';

interface UnitAssetsProps {
  readonly api: PortfolioApi;
  readonly propertyId: string;
  readonly unitId: string;
  readonly asOf: string;
  readonly assetId?: string | undefined;
  readonly navigate: NavigateWorkspace;
  readonly setNavigationBlocker: SetNavigationBlocker;
}

interface AssetWriteGate {
  readonly pending: boolean;
  readonly tryStart: () => boolean;
  readonly finish: () => void;
}

interface IdentifierRow {
  readonly key: number;
  readonly identifierType: AssetIdentifierType;
  readonly value: string;
  readonly label: string;
}

type PendingAction =
  | 'metadata'
  | 'move'
  | 'status'
  | 'replace'
  | null;

function nullableFormString(form: FormData, name: string): string | null {
  const value = String(form.get(name) ?? '').trim();
  return value === '' ? null : value;
}

function optionalFormString(form: FormData, name: string): string | undefined {
  const value = String(form.get(name) ?? '').trim();
  return value === '' ? undefined : value;
}

function assetError(cause: unknown, fallback: string): string {
  if (
    cause instanceof PortfolioApiError &&
    (cause.code === 'ASSET_VERSION_CONFLICT' ||
      cause.code === 'ASSET_LOCATION_VERSION_CONFLICT')
  ) {
    return 'This Asset changed on the server. Canonical Asset state is being reloaded.';
  }
  return cause instanceof Error ? cause.message : fallback;
}

function identifierInputs(rows: readonly IdentifierRow[]) {
  return rows
    .map((row) => ({
      identifierType: row.identifierType,
      value: row.value.trim(),
      label: row.label.trim() || null,
    }))
    .filter((row) => row.value !== '');
}

function IdentifierEditor({
  disabled,
  rows,
  onChange,
}: {
  readonly disabled: boolean;
  readonly rows: readonly IdentifierRow[];
  readonly onChange: (rows: readonly IdentifierRow[]) => void;
}) {
  function updateRow(
    key: number,
    patch: Partial<Omit<IdentifierRow, 'key'>>,
  ) {
    onChange(
      rows.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    );
  }

  function addRow() {
    const nextKey =
      rows.reduce((max, row) => Math.max(max, row.key), 0) + 1;
    onChange([
      ...rows,
      {
        key: nextKey,
        identifierType: 'serial_number',
        value: '',
        label: '',
      },
    ]);
  }

  return (
    <div className="asset-identifier-editor">
      <div className="tenancy-form-heading">
        <strong>Structured identifiers</strong>
        <span>Identity data is append-only after Asset creation</span>
      </div>
      {rows.map((row) => (
        <div className="asset-identifier-row" key={row.key}>
          <label>
            Type
            <select
              disabled={disabled}
              onChange={(event) =>
                updateRow(row.key, {
                  identifierType: event.currentTarget
                    .value as AssetIdentifierType,
                })
              }
              value={row.identifierType}
            >
              {ASSET_IDENTIFIER_TYPES.map((value) => (
                <option key={value} value={value}>
                  {formatDetailKey(value)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Value
            <input
              disabled={disabled}
              onChange={(event) =>
                updateRow(row.key, { value: event.currentTarget.value })
              }
              placeholder="Serial / inventory tag"
              value={row.value}
            />
          </label>
          <label>
            Label
            <input
              disabled={disabled}
              onChange={(event) =>
                updateRow(row.key, { label: event.currentTarget.value })
              }
              placeholder="Optional"
              value={row.label}
            />
          </label>
          {rows.length > 1 ? (
            <button
              className="button-secondary"
              disabled={disabled}
              onClick={() => onChange(rows.filter((item) => item.key !== row.key))}
              type="button"
            >
              Remove
            </button>
          ) : null}
        </div>
      ))}
      <button
        className="button-secondary"
        disabled={disabled}
        onClick={addRow}
        type="button"
      >
        Add identifier
      </button>
    </div>
  );
}

function AssetIdentifiers({
  identifiers,
}: {
  readonly identifiers: AssetResponse['identifiers'];
}) {
  if (identifiers.length === 0) {
    return <p className="muted asset-empty-detail">No identifiers recorded.</p>;
  }

  return (
    <dl className="identifier-list">
      {identifiers.map((identifier) => (
        <div key={identifier.id}>
          <dt>{identifier.label ?? formatDetailKey(identifier.identifierType)}</dt>
          <dd>{identifier.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function CreateAssetForm({
  api,
  propertyId,
  unitId,
  spaces,
  onCreated,
  onReconcile,
  writeGate,
}: {
  readonly api: PortfolioApi;
  readonly propertyId: string;
  readonly unitId: string;
  readonly spaces: readonly SpaceResponse[];
  readonly onCreated: (asset: AssetResponse) => void;
  readonly onReconcile: () => void;
  readonly writeGate: AssetWriteGate;
}) {
  const submission = useCreateSubmissionGuard();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<readonly IdentifierRow[]>([
    {
      key: 1,
      identifierType: 'serial_number',
      value: '',
      label: '',
    },
  ]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const identifiers = identifierInputs(rows);
    const spaceId = requiredString(form, 'spaceId') || null;
    const parsed = createAssetRequestSchema.safeParse({
      code: requiredString(form, 'code'),
      name: requiredString(form, 'name'),
      propertyId,
      unitId,
      spaceId,
      manufacturer: nullableFormString(form, 'manufacturer'),
      model: nullableFormString(form, 'model'),
      ...(identifiers.length > 0 ? { identifiers } : {}),
    });

    if (!parsed.success) {
      setError(contractErrorMessage());
      return;
    }

    if (!submission.tryStart()) return;
    if (!writeGate.tryStart()) {
      submission.finish();
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const created = await api.post(
        assetsPath(),
        parsed.data,
        assetResponseSchema,
      );
      assertCreatedAsset(
        {
          code: parsed.data.code,
          name: parsed.data.name,
          propertyId,
          unitId,
          spaceId: parsed.data.spaceId ?? null,
          manufacturer: parsed.data.manufacturer ?? null,
          model: parsed.data.model ?? null,
          identifiers: (parsed.data.identifiers ?? []).map((identifier) => ({
            identifierType: identifier.identifierType,
            value: identifier.value,
            label: identifier.label ?? null,
          })),
        },
        created,
      );
      if (submission.isMounted()) {
        formElement.reset();
        setRows([
          {
            key: 1,
            identifierType: 'serial_number',
            value: '',
            label: '',
          },
        ]);
        writeGate.finish();
        onCreated(created);
      }
    } catch (cause) {
      if (submission.isMounted()) {
        onReconcile();
        setError(
          assetError(
            cause,
            'Asset creation outcome could not be confirmed. Canonical Unit Asset state was reloaded.',
          ),
        );
      }
    } finally {
      submission.finish();
      writeGate.finish();
      if (submission.isMounted()) setSubmitting(false);
    }
  }

  return (
    <form
      className="setup-form asset-admin-form"
      data-asset-form="create"
      onSubmit={submit}
    >
      <div className="setup-form-grid">
        <label>
          Code
          <input disabled={submitting || writeGate.pending} name="code" required />
        </label>
        <label>
          Name
          <input disabled={submitting || writeGate.pending} name="name" required />
        </label>
        <label>
          Manufacturer
          <input disabled={submitting || writeGate.pending} name="manufacturer" />
        </label>
        <label>
          Model
          <input disabled={submitting || writeGate.pending} name="model" />
        </label>
        <label>
          Initial Space
          <select
            defaultValue=""
            disabled={submitting || writeGate.pending}
            name="spaceId"
          >
            <option value="">Unit level</option>
            {spaces.map((space) => (
              <option key={space.id} value={space.id}>
                {space.code} · {space.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <IdentifierEditor
        disabled={submitting || writeGate.pending}
        onChange={setRows}
        rows={rows}
      />

      {error ? (
        <p className="setup-form-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="setup-form-actions">
        <span className="setup-hint">
          Creation also appends the first authoritative location interval.
        </span>
        <button
          className="button-primary"
          disabled={submitting || writeGate.pending}
          type="submit"
        >
          {submitting ? 'Creating…' : 'Create Asset'}
        </button>
      </div>
    </form>
  );
}

function LocationHistory({
  history,
}: {
  readonly history: readonly AssetLocationHistoryResponse[] | null;
}) {
  if (history === null) {
    return <p className="muted" aria-live="polite">Loading location history…</p>;
  }

  return (
    <div className="asset-history-list">
      {history.map((item) => (
        <article className="asset-history-card" key={item.id}>
          <div>
            <strong>{formatDetailKey(item.changeType)}</strong>
            <span>
              {item.validFrom} → {item.validTo ?? 'current'}
            </span>
          </div>
          <dl className="detail-list compact-detail-list">
            <div><dt>Property</dt><dd>{item.propertyId}</dd></div>
            <div><dt>Unit</dt><dd>{item.unitId ?? '—'}</dd></div>
            <div><dt>Space</dt><dd>{item.spaceId ?? 'Unit level'}</dd></div>
            <div><dt>Reason</dt><dd>{item.reason ?? '—'}</dd></div>
          </dl>
        </article>
      ))}
    </div>
  );
}

function AssetAdministration({
  api,
  propertyId,
  unitId,
  asOf,
  asset,
  units,
  navigate,
  onCanonicalWrite,
  writeGate,
}: {
  readonly api: PortfolioApi;
  readonly propertyId: string;
  readonly unitId: string;
  readonly asOf: string;
  readonly asset: AssetResponse;
  readonly units: readonly UnitResponse[];
  readonly navigate: NavigateWorkspace;
  readonly onCanonicalWrite: () => void;
  readonly writeGate: AssetWriteGate;
}) {
  const guard = useCreateSubmissionGuard();
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] =
    useState<readonly AssetLocationHistoryResponse[] | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [replacementLinks, setReplacementLinks] = useState<{
    predecessor: { replacedAssetId: string; replacementAssetId: string; replacedAt: string } | null;
    successor: { replacedAssetId: string; replacementAssetId: string; replacedAt: string } | null;
  } | null>(null);
  const [linksError, setLinksError] = useState<string | null>(null);
  const [targetUnitId, setTargetUnitId] = useState(asset.unitId ?? unitId);
  const [targetSpaces, setTargetSpaces] =
    useState<readonly SpaceResponse[] | null>(null);
  const [targetSpacesError, setTargetSpacesError] = useState<string | null>(null);
  const [replacementIdentifiers, setReplacementIdentifiers] =
    useState<readonly IdentifierRow[]>([
      {
        key: 1,
        identifierType: 'serial_number',
        value: '',
        label: '',
      },
    ]);

  useEffect(() => {
    const controller = new AbortController();
    setHistory(null);
    setHistoryError(null);
    setReplacementLinks(null);
    setLinksError(null);

    void Promise.all([
      api.get(
        assetLocationHistoryPath(asset.id),
        assetLocationHistoryListResponseSchema,
        { signal: controller.signal },
      ),
      api.get(
        assetReplacementLinksPath(asset.id),
        assetReplacementLinksResponseSchema,
        { signal: controller.signal },
      ),
    ])
      .then(([historyResponse, links]) => {
        assertAssetLocationHistoryOwner(asset, historyResponse.items);
        assertAssetReplacementLinksOwner(asset.id, links);
        setHistory(historyResponse.items);
        setReplacementLinks(links);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        const message =
          cause instanceof Error
            ? cause.message
            : 'Asset history could not be loaded.';
        setHistoryError(message);
        setLinksError(message);
      });

    return () => controller.abort();
  }, [api, asset]);

  useEffect(() => {
    const controller = new AbortController();
    setTargetSpaces(null);
    setTargetSpacesError(null);

    void api
      .get(unitSpacesPath(targetUnitId), spaceListResponseSchema, {
        signal: controller.signal,
      })
      .then((response) => {
        assertAssetDestinationSpacesOwner(targetUnitId, response.items);
        setTargetSpaces(response.items);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setTargetSpacesError(
          cause instanceof Error
            ? cause.message
            : 'Destination Spaces could not be loaded.',
        );
      });

    return () => controller.abort();
  }, [api, targetUnitId]);

  function begin(action: Exclude<PendingAction, null>): boolean {
    if (!guard.tryStart()) return false;
    if (!writeGate.tryStart()) {
      guard.finish();
      return false;
    }
    setPendingAction(action);
    setError(null);
    return true;
  }

  function finish() {
    guard.finish();
    writeGate.finish();
    if (guard.isMounted()) setPendingAction(null);
  }

  function reconcile(cause: unknown, fallback: string) {
    if (!guard.isMounted()) return;
    onCanonicalWrite();
    setError(assetError(cause, fallback));
  }

  async function submitMetadata(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const expected = {
      name: requiredString(form, 'name'),
      manufacturer: nullableFormString(form, 'manufacturer'),
      model: nullableFormString(form, 'model'),
    };

    if (
      expected.name === asset.name &&
      expected.manufacturer === asset.manufacturer &&
      expected.model === asset.model
    ) {
      setError('No metadata changes to save.');
      return;
    }

    const parsed = updateAssetMetadataRequestSchema.safeParse({
      expectedVersion: asset.version,
      ...expected,
    });
    if (!parsed.success) {
      setError(contractErrorMessage());
      return;
    }
    if (!begin('metadata')) return;

    try {
      const response = await api.patch(
        assetMetadataPath(asset.id),
        parsed.data,
        assetResponseSchema,
      );
      assertAssetMetadataMutationOwner(asset, expected, response);
      if (guard.isMounted()) onCanonicalWrite();
    } catch (cause) {
      reconcile(cause, 'Asset metadata could not be updated.');
    } finally {
      finish();
    }
  }

  async function submitMove(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const target = {
      propertyId,
      unitId: requiredString(form, 'unitId'),
      spaceId: requiredString(form, 'spaceId') || null,
    };
    if (
      target.unitId === asset.unitId &&
      target.spaceId === asset.spaceId
    ) {
      setError('Choose a different Unit or Space for this move.');
      return;
    }

    const parsed = moveAssetRequestSchema.safeParse({
      expectedVersion: asset.version,
      ...target,
      reason: optionalFormString(form, 'reason'),
    });
    if (!parsed.success) {
      setError(contractErrorMessage());
      return;
    }
    if (!begin('move')) return;

    try {
      const response = await api.post(
        assetMovePath(asset.id),
        parsed.data,
        assetResponseSchema,
      );
      assertAssetMoveMutationOwner(asset, target, response);
      if (!guard.isMounted()) return;

      if (response.unitId !== unitId) {
        writeGate.finish();
        navigate(
          unitRoute(
            propertyId,
            response.unitId!,
            asOf,
            'assets',
            { assetId: response.id },
          ),
        );
      } else {
        onCanonicalWrite();
      }
    } catch (cause) {
      reconcile(cause, 'Asset could not be moved.');
    } finally {
      finish();
    }
  }

  async function changeStatus(status: 'active' | 'inactive' | 'retired') {
    const parsed = changeAssetStatusRequestSchema.safeParse({
      expectedVersion: asset.version,
      status,
    });
    if (!parsed.success || !begin('status')) return;

    try {
      const response = await api.post(
        assetStatusPath(asset.id),
        parsed.data,
        assetResponseSchema,
      );
      assertAssetStatusMutationOwner(asset, status, response);
      if (guard.isMounted()) onCanonicalWrite();
    } catch (cause) {
      reconcile(cause, 'Asset lifecycle could not be changed.');
    } finally {
      finish();
    }
  }

  async function submitReplacement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const identifiers = identifierInputs(replacementIdentifiers);
    const expected = {
      code: requiredString(form, 'code'),
      name: requiredString(form, 'name'),
      manufacturer: nullableFormString(form, 'manufacturer'),
      model: nullableFormString(form, 'model'),
      identifiers,
    };
    const parsed = replaceAssetRequestSchema.safeParse({
      expectedVersion: asset.version,
      code: expected.code,
      name: expected.name,
      manufacturer: expected.manufacturer,
      model: expected.model,
      ...(identifiers.length > 0 ? { identifiers } : {}),
    });
    if (!parsed.success) {
      setError(contractErrorMessage());
      return;
    }
    if (!begin('replace')) return;

    try {
      const response = await api.post(
        assetReplacementPath(asset.id),
        parsed.data,
        replaceAssetResponseSchema,
      );
      assertAssetReplacementMutationOwner(asset, expected, response);
      if (!guard.isMounted()) return;

      const successorUnitId = response.replacementAsset.unitId;
      if (!successorUnitId) {
        throw new Error(
          'Unit Asset replacement unexpectedly produced an unowned successor.',
        );
      }
      onCanonicalWrite();
      writeGate.finish();
      navigate(
        unitRoute(
          propertyId,
          successorUnitId,
          asOf,
          'assets',
          { assetId: response.replacementAsset.id },
        ),
      );
    } catch (cause) {
      reconcile(cause, 'Asset replacement could not be completed.');
    } finally {
      finish();
    }
  }

  const pending = pendingAction !== null;
  const canReplace = asset.status === 'active' || asset.status === 'inactive';

  return (
    <section className="panel asset-admin-panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Selected physical Asset · v{asset.version}</p>
          <h2>{asset.code} · {asset.name}</h2>
        </div>
        <span className={'status-chip status-' + asset.status}>
          {asset.status}
        </span>
      </div>

      {error ? (
        <p className="setup-form-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="asset-admin-grid">
        <form
          className="setup-form asset-admin-form"
          data-asset-form="metadata"
          onSubmit={submitMetadata}
        >
          <div className="tenancy-form-heading">
            <strong>Metadata correction</strong>
            <span>Code and structured identifiers stay immutable</span>
          </div>
          <label>
            Name
            <input
              defaultValue={asset.name}
              disabled={pending}
              name="name"
              required
            />
          </label>
          <label>
            Manufacturer
            <input
              defaultValue={asset.manufacturer ?? ''}
              disabled={pending}
              name="manufacturer"
            />
          </label>
          <label>
            Model
            <input
              defaultValue={asset.model ?? ''}
              disabled={pending}
              name="model"
            />
          </label>
          <button className="button-primary" disabled={pending} type="submit">
            {pendingAction === 'metadata' ? 'Saving…' : 'Save metadata'}
          </button>
        </form>

        <form
          className="setup-form asset-admin-form"
          data-asset-form="move"
          onSubmit={submitMove}
        >
          <div className="tenancy-form-heading">
            <strong>Move Asset</strong>
            <span>Close current interval + append next interval atomically</span>
          </div>
          <label>
            Destination Unit
            <select
              disabled={pending}
              name="unitId"
              onChange={(event) => setTargetUnitId(event.currentTarget.value)}
              value={targetUnitId}
            >
              {units.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.code} · Unit {unit.unitNumber}
                </option>
              ))}
            </select>
          </label>
          <label>
            Destination Space
            <select
              disabled={pending || targetSpaces === null}
              key={targetUnitId}
              name="spaceId"
              defaultValue={
                targetUnitId === asset.unitId ? asset.spaceId ?? '' : ''
              }
            >
              <option value="">Unit level</option>
              {(targetSpaces ?? []).map((space) => (
                <option key={space.id} value={space.id}>
                  {space.code} · {space.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Reason
            <input disabled={pending} name="reason" placeholder="Optional" />
          </label>
          {targetSpacesError ? (
            <p className="form-error" role="alert">{targetSpacesError}</p>
          ) : null}
          <button
            className="button-primary"
            disabled={pending || targetSpaces === null}
            type="submit"
          >
            {pendingAction === 'move' ? 'Moving…' : 'Move Asset'}
          </button>
        </form>

        <div className="setup-form asset-admin-form">
          <div className="tenancy-form-heading">
            <strong>Lifecycle</strong>
            <span>Replacement is a separate physical-identity workflow</span>
          </div>
          <div className="asset-lifecycle-actions">
            {asset.status === 'active' ? (
              <button
                className="button-secondary"
                disabled={pending}
                onClick={() => void changeStatus('inactive')}
                type="button"
              >
                {pendingAction === 'status' ? 'Updating…' : 'Mark inactive'}
              </button>
            ) : null}
            {asset.status === 'inactive' ? (
              <button
                className="button-secondary"
                disabled={pending}
                onClick={() => void changeStatus('active')}
                type="button"
              >
                {pendingAction === 'status' ? 'Updating…' : 'Reactivate'}
              </button>
            ) : null}
            {asset.status === 'active' || asset.status === 'inactive' ? (
              <button
                className="button-secondary"
                disabled={pending}
                onClick={() => void changeStatus('retired')}
                type="button"
              >
                {pendingAction === 'status' ? 'Updating…' : 'Retire Asset'}
              </button>
            ) : null}
            {asset.status === 'retired' ? (
              <p className="muted">
                Retired is terminal for lifecycle transitions.
              </p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="asset-admin-section">
        <div className="legal-documents-heading">
          <div>
            <p className="eyebrow">Authoritative placement</p>
            <h3>Location history</h3>
          </div>
          <span className="section-note">
            assets.* is only the current projection
          </span>
        </div>
        {historyError ? (
          <p className="form-error" role="alert">{historyError}</p>
        ) : (
          <LocationHistory history={history} />
        )}
      </div>

      <div className="asset-admin-section">
        <div className="legal-documents-heading">
          <div>
            <p className="eyebrow">Physical lineage</p>
            <h3>Replacement links</h3>
          </div>
        </div>
        {linksError ? (
          <p className="form-error" role="alert">{linksError}</p>
        ) : replacementLinks === null ? (
          <p className="muted" aria-live="polite">Loading replacement lineage…</p>
        ) : (
          <dl className="detail-list compact-detail-list">
            <div>
              <dt>Predecessor</dt>
              <dd>
                {replacementLinks.predecessor?.replacedAssetId ?? '—'}
              </dd>
            </div>
            <div>
              <dt>Successor</dt>
              <dd>
                {replacementLinks.successor?.replacementAssetId ?? '—'}
              </dd>
            </div>
          </dl>
        )}
      </div>

      {canReplace ? (
        <form
          className="setup-form asset-admin-form asset-replacement-form"
          data-asset-form="replace"
          onSubmit={submitReplacement}
        >
          <div className="tenancy-form-heading">
            <strong>Replace physical Asset</strong>
            <span>
              Successor inherits the exact authoritative current placement
            </span>
          </div>
          <div className="setup-form-grid">
            <label>
              Successor code
              <input disabled={pending} name="code" required />
            </label>
            <label>
              Successor name
              <input disabled={pending} name="name" required />
            </label>
            <label>
              Manufacturer
              <input disabled={pending} name="manufacturer" />
            </label>
            <label>
              Model
              <input disabled={pending} name="model" />
            </label>
          </div>
          <IdentifierEditor
            disabled={pending}
            onChange={setReplacementIdentifiers}
            rows={replacementIdentifiers}
          />
          <button className="button-primary" disabled={pending} type="submit">
            {pendingAction === 'replace'
              ? 'Replacing…'
              : 'Create replacement Asset'}
          </button>
        </form>
      ) : null}
    </section>
  );
}

export function UnitAssets({
  api,
  propertyId,
  unitId,
  asOf,
  assetId,
  navigate,
  setNavigationBlocker,
}: UnitAssetsProps) {
  const [assets, setAssets] = useState<readonly AssetResponse[] | null>(null);
  const [units, setUnits] = useState<readonly UnitResponse[] | null>(null);
  const [spaces, setSpaces] = useState<readonly SpaceResponse[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [assetRevision, setAssetRevision] = useState(0);
  const [writePending, setWritePending] = useState(false);
  const writeSubmission = useCreateSubmissionGuard();

  const writeGate: AssetWriteGate = {
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
    setAssets(null);
    setUnits(null);
    setSpaces(null);
    setError(null);

    void Promise.all([
      api.get(unitAssetsPath(unitId), assetListResponseSchema, {
        signal: controller.signal,
      }),
      api.get(propertyUnitsPath(propertyId), unitListResponseSchema, {
        signal: controller.signal,
      }),
      api.get(unitSpacesPath(unitId), spaceListResponseSchema, {
        signal: controller.signal,
      }),
    ])
      .then(([assetResponse, unitResponse, spaceResponse]) => {
        assertUnitAssetsOwner(unitId, assetResponse.items);
        assertAssetDestinationUnitsOwner(propertyId, unitResponse.items);
        assertAssetDestinationSpacesOwner(unitId, spaceResponse.items);
        setAssets(assetResponse.items);
        setUnits(unitResponse.items);
        setSpaces(spaceResponse.items);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(
          cause instanceof Error ? cause.message : 'Assets could not be loaded.',
        );
      });

    return () => controller.abort();
  }, [api, assetRevision, propertyId, unitId]);

  const selectedAsset = useMemo(
    () => assets?.find((asset) => asset.id === assetId) ?? null,
    [assetId, assets],
  );
  const selectionInvalid =
    assets !== null && assetId !== undefined && selectedAsset === null;

  function refresh() {
    setAssetRevision((revision) => revision + 1);
  }

  return (
    <div className="dashboard-stack">
      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Asset Registry</p>
            <h2>Create Asset</h2>
          </div>
          <span className="section-note">
            Physical identity + first location interval
          </span>
        </div>

        {spaces ? (
          <CreateAssetForm
            api={api}
            onCreated={(created) => {
              refresh();
              navigate(
                unitRoute(propertyId, unitId, asOf, 'assets', {
                  assetId: created.id,
                }),
              );
            }}
            onReconcile={refresh}
            propertyId={propertyId}
            spaces={spaces}
            unitId={unitId}
            writeGate={writeGate}
          />
        ) : null}
      </section>

      <section className="panel page-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Current registry</p>
            <h2>Assets located in this Unit</h2>
          </div>
          <span className="section-note">
            Current Asset location · not an as-of projection
          </span>
        </div>

        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        {!error && assets === null ? (
          <p className="muted" aria-live="polite">
            Loading Assets…
          </p>
        ) : null}
        {assets?.length === 0 ? (
          <p className="muted">No Assets are currently located in this Unit.</p>
        ) : null}

        {assets && assets.length > 0 ? (
          <div className="asset-grid">
            {assets.map((asset) => (
              <WorkspaceLink
                ariaCurrent={asset.id === assetId ? 'page' : undefined}
                className={
                  'asset-card asset-card-link ' +
                  (asset.id === assetId ? 'asset-card-active' : '')
                }
                key={asset.id}
                navigate={navigate}
                route={unitRoute(propertyId, unitId, asOf, 'assets', {
                  assetId: asset.id,
                })}
              >
                <div className="asset-heading">
                  <div>
                    <span className="eyebrow">{asset.code}</span>
                    <h3>{asset.name}</h3>
                  </div>
                  <span className={'status-chip status-' + asset.status}>
                    {asset.status}
                  </span>
                </div>
                <dl className="detail-list">
                  <div>
                    <dt>Manufacturer</dt>
                    <dd>{asset.manufacturer ?? '—'}</dd>
                  </div>
                  <div>
                    <dt>Model</dt>
                    <dd>{asset.model ?? '—'}</dd>
                  </div>
                  <div>
                    <dt>Space</dt>
                    <dd>
                      {spaces?.find((space) => space.id === asset.spaceId)?.name ??
                        (asset.spaceId ? asset.spaceId : 'Unit level')}
                    </dd>
                  </div>
                  <div>
                    <dt>Version</dt>
                    <dd>{asset.version}</dd>
                  </div>
                </dl>
                <AssetIdentifiers identifiers={asset.identifiers} />
              </WorkspaceLink>
            ))}
          </div>
        ) : null}

        {selectionInvalid ? (
          <p className="form-error" role="alert">
            The selected Asset is not currently located in this Unit.
          </p>
        ) : null}
      </section>

      {selectedAsset && units ? (
        <AssetAdministration
          api={api}
          asOf={asOf}
          asset={selectedAsset}
          key={selectedAsset.id + ':' + selectedAsset.version}
          navigate={navigate}
          onCanonicalWrite={refresh}
          propertyId={propertyId}
          unitId={unitId}
          units={units}
          writeGate={writeGate}
        />
      ) : null}
    </div>
  );
}
