import {
  createMeterRequestSchema,
  linkMeterReadingBoundaryRequestSchema,
  meterDetailResponseSchema,
  meterListResponseSchema,
  meterReadingBoundaryResponseSchema,
  meterReadingResponseSchema,
  meterResponseSchema,
  recordMeterReadingRequestSchema,
  retireMeterRequestSchema,
  spaceListResponseSchema,
  tenancyListResponseSchema,
  updateMeterRequestSchema,
  type MeterDetailResponse,
  type MeterReadingBoundaryResponse,
  type MeterReadingResponse,
  type MeterResponse,
  type SpaceResponse,
  type TenancyResponse,
} from '@portfolio/contracts';
import {
  METER_MEASUREMENT_UNITS,
  METER_READING_BOUNDARY_TYPES,
  METER_UTILITY_TYPES,
  type MeterMeasurementUnit,
  type MeterReadingBoundaryType,
  type MeterUtilityType,
} from '@portfolio/domain';
import {
  type FormEvent,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  meterPath,
  meterReadingBoundariesPath,
  meterReadingsPath,
  meterRetirePath,
  metersPath,
  unitMetersPath,
  unitSpacesPath,
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
import type {
  NavigateWorkspace,
  SetNavigationBlocker,
} from '../navigation/use-workspace-navigation.js';
import { formatDetailKey } from '../presentation/format.js';
import {
  assertCreatedMeter,
  assertMeterBoundaryMutationOwner,
  assertMeterDetailOwner,
  assertMeterLabelMutationOwner,
  assertMeterReadingMutationOwner,
  assertMeterRetirementMutationOwner,
  assertUnitMetersOwner,
  findCommittedBoundary,
  findCommittedReading,
} from './meter-owner.js';
import { assertUnitTenanciesOwner } from './route-owner.js';

interface UnitMetersProps {
  readonly api: PortfolioApi;
  readonly propertyId: string;
  readonly unitId: string;
  readonly asOf: string;
  readonly meterId?: string | undefined;
  readonly navigate: NavigateWorkspace;
  readonly setNavigationBlocker: SetNavigationBlocker;
}

interface MeterWriteGate {
  readonly pending: boolean;
  readonly tryStart: () => boolean;
  readonly finish: () => void;
}

function utilityUnits(
  utilityType: MeterUtilityType,
): readonly MeterMeasurementUnit[] {
  switch (utilityType) {
    case 'electricity':
    case 'heat':
      return ['kwh'];
    case 'water':
      return ['m3'];
    case 'gas':
      return METER_MEASUREMENT_UNITS;
  }
}

function utcInstant(date: string, time: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  if (!/^\d{2}:\d{2}$/.test(time)) return null;
  const value = `${date}T${time}:00.000Z`;
  return Number.isNaN(Date.parse(value)) ? null : value;
}

function meterError(cause: unknown, fallback: string): string {
  if (
    cause instanceof PortfolioApiError &&
    cause.code === 'METER_VERSION_CONFLICT'
  ) {
    return 'This Meter changed on the server. Canonical Meter state was reloaded.';
  }
  if (
    cause instanceof PortfolioApiError &&
    cause.code === 'METER_READING_AT_TIME_ALREADY_EXISTS'
  ) {
    return 'A Reading already exists at that exact Meter occurrence time. Canonical Meter detail was reloaded.';
  }
  if (
    cause instanceof PortfolioApiError &&
    cause.code === 'METER_READING_BOUNDARY_ALREADY_EXISTS'
  ) {
    return 'This Meter/Tenancy boundary already exists. Canonical Meter detail was reloaded.';
  }
  return cause instanceof Error ? cause.message : fallback;
}

function readingDate(reading: MeterReadingResponse): string {
  return reading.readAt.slice(0, 10);
}

function formatReadingValue(value: string, unit: string): string {
  const normalized = value.replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
  return `${normalized} ${unit}`;
}

function CreateMeterForm({
  api,
  unitId,
  spaces,
  writeGate,
  onCreated,
  onReconcile,
}: {
  readonly api: PortfolioApi;
  readonly unitId: string;
  readonly spaces: readonly SpaceResponse[];
  readonly writeGate: MeterWriteGate;
  readonly onCreated: (meter: MeterResponse) => void;
  readonly onReconcile: (expected: {
    readonly code: string;
    readonly serialNumber: string;
    readonly unitId: string;
  }) => Promise<void>;
}) {
  const localSubmission = useCreateSubmissionGuard();
  const [utilityType, setUtilityType] =
    useState<MeterUtilityType>('electricity');
  const [measurementUnit, setMeasurementUnit] =
    useState<MeterMeasurementUnit>('kwh');
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const installedAt = utcInstant(
      requiredString(form, 'installedDate'),
      requiredString(form, 'installedTime'),
    );
    const parsed = createMeterRequestSchema.safeParse({
      code: requiredString(form, 'code'),
      serialNumber: requiredString(form, 'serialNumber'),
      utilityType,
      measurementUnit,
      unitId,
      spaceId: requiredString(form, 'spaceId') || null,
      label: requiredString(form, 'label'),
      installedAt,
    });

    if (!parsed.success) {
      setError(contractErrorMessage());
      return;
    }
    if (!localSubmission.tryStart()) return;
    if (!writeGate.tryStart()) {
      localSubmission.finish();
      return;
    }

    setError(null);
    try {
      const created = await api.post(
        metersPath(),
        parsed.data,
        meterResponseSchema,
      );
      assertCreatedMeter(
        {
          code: parsed.data.code,
          serialNumber: parsed.data.serialNumber,
          utilityType: parsed.data.utilityType,
          measurementUnit: parsed.data.measurementUnit,
          unitId,
          spaceId: parsed.data.spaceId ?? null,
          label: parsed.data.label,
          installedAt: parsed.data.installedAt,
        },
        created,
      );

      if (localSubmission.isMounted()) {
        formElement.reset();
        setUtilityType('electricity');
        setMeasurementUnit('kwh');
        writeGate.finish();
        onCreated(created);
      }
    } catch (cause) {
      if (localSubmission.isMounted()) {
        await onReconcile({
          code: parsed.data.code,
          serialNumber: parsed.data.serialNumber,
          unitId,
        });
        setError(
          meterError(
            cause,
            'Meter creation outcome could not be confirmed. Canonical Unit Meter state was reloaded.',
          ),
        );
      }
    } finally {
      localSubmission.finish();
      writeGate.finish();
    }
  }

  const allowedUnits = utilityUnits(utilityType);

  return (
    <form
      className="setup-form meter-admin-form"
      data-meter-form="create"
      onSubmit={submit}
    >
      <div className="setup-form-grid">
        <label>
          Meter code
          <input disabled={writeGate.pending} name="code" required />
        </label>
        <label>
          Serial number
          <input disabled={writeGate.pending} name="serialNumber" required />
        </label>
        <label>
          Utility
          <select
            disabled={writeGate.pending}
            onChange={(event) => {
              const next = event.currentTarget.value as MeterUtilityType;
              setUtilityType(next);
              const units = utilityUnits(next);
              if (!units.includes(measurementUnit)) {
                setMeasurementUnit(units[0]!);
              }
            }}
            value={utilityType}
          >
            {METER_UTILITY_TYPES.map((value) => (
              <option key={value} value={value}>
                {formatDetailKey(value)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Measurement unit
          <select
            disabled={writeGate.pending}
            onChange={(event) =>
              setMeasurementUnit(
                event.currentTarget.value as MeterMeasurementUnit,
              )
            }
            value={measurementUnit}
          >
            {allowedUnits.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label>
          Label
          <input disabled={writeGate.pending} name="label" required />
        </label>
        <label>
          Space
          <select
            defaultValue=""
            disabled={writeGate.pending}
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
        <label>
          Installed date
          <input
            disabled={writeGate.pending}
            name="installedDate"
            required
            type="date"
          />
        </label>
        <label>
          Installed time (UTC)
          <input
            disabled={writeGate.pending}
            name="installedTime"
            required
            type="time"
          />
        </label>
      </div>

      {error ? (
        <p className="setup-form-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="setup-form-actions">
        <span className="setup-hint">
          Unit/Space placement, serial and utility identity are immutable after
          registration.
        </span>
        <button
          className="button-primary"
          disabled={writeGate.pending}
          type="submit"
        >
          {writeGate.pending ? 'Write in progress…' : 'Create Meter'}
        </button>
      </div>
    </form>
  );
}

function MeterAdministration({
  api,
  unitId,
  detail,
  tenancies,
  writeGate,
  onCanonicalWrite,
}: {
  readonly api: PortfolioApi;
  readonly unitId: string;
  readonly detail: MeterDetailResponse;
  readonly tenancies: readonly TenancyResponse[];
  readonly writeGate: MeterWriteGate;
  readonly onCanonicalWrite: () => void;
}) {
  const localSubmission = useCreateSubmissionGuard();
  const [action, setAction] = useState<
    'label' | 'reading' | 'boundary' | 'retire' | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [boundaryReadingId, setBoundaryReadingId] = useState(
    detail.readings.at(-1)?.id ?? '',
  );
  const [boundaryType, setBoundaryType] =
    useState<MeterReadingBoundaryType>('move_in');

  const meter = detail.meter;
  const selectedBoundaryReading =
    detail.readings.find((reading) => reading.id === boundaryReadingId) ?? null;

  useEffect(() => {
    if (
      boundaryReadingId &&
      detail.readings.some((reading) => reading.id === boundaryReadingId)
    ) {
      return;
    }
    setBoundaryReadingId(detail.readings.at(-1)?.id ?? '');
  }, [boundaryReadingId, detail.readings]);

  const eligibleBoundaryTenancies = useMemo(() => {
    if (!selectedBoundaryReading) return [];
    const date = readingDate(selectedBoundaryReading);

    return tenancies.filter((tenancy) => {
      if (tenancy.unitId !== unitId) return false;
      const dateMatches =
        boundaryType === 'move_in'
          ? tenancy.actualStart === date
          : tenancy.actualEnd === date;
      if (!dateMatches) return false;
      return !detail.boundaries.some(
        (boundary) =>
          boundary.tenancyId === tenancy.id &&
          boundary.type === boundaryType,
      );
    });
  }, [
    boundaryType,
    detail.boundaries,
    selectedBoundaryReading,
    tenancies,
    unitId,
  ]);

  function begin(
    next: Exclude<typeof action, null>,
  ): boolean {
    if (!localSubmission.tryStart()) return false;
    if (!writeGate.tryStart()) {
      localSubmission.finish();
      return false;
    }
    setAction(next);
    setError(null);
    setSuccess(null);
    return true;
  }

  function finish() {
    localSubmission.finish();
    writeGate.finish();
    if (localSubmission.isMounted()) setAction(null);
  }

  async function fetchCanonical(): Promise<MeterDetailResponse | null> {
    try {
      const canonical = await api.get(
        meterPath(meter.id),
        meterDetailResponseSchema,
      );
      assertMeterDetailOwner(unitId, meter.id, canonical);
      return canonical;
    } catch {
      return null;
    }
  }

  async function submitLabel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const label = requiredString(form, 'label');
    const parsed = updateMeterRequestSchema.safeParse({
      expectedVersion: meter.version,
      label,
    });
    if (!parsed.success) {
      setError(contractErrorMessage());
      return;
    }
    if (label === meter.label) {
      setError('Choose a different label before saving.');
      return;
    }
    if (!begin('label')) return;

    try {
      const updated = await api.patch(
        meterPath(meter.id),
        parsed.data,
        meterResponseSchema,
      );
      assertMeterLabelMutationOwner(meter, label, updated);
      if (localSubmission.isMounted()) {
        setSuccess('Meter label corrected.');
        onCanonicalWrite();
      }
    } catch (cause) {
      const canonical = await fetchCanonical();
      if (
        canonical &&
        canonical.meter.label === label &&
        canonical.meter.version === meter.version + 1
      ) {
        if (localSubmission.isMounted()) {
          setSuccess('Meter label correction was committed and recovered.');
          onCanonicalWrite();
        }
      } else if (localSubmission.isMounted()) {
        setError(meterError(cause, 'Meter label could not be updated.'));
        onCanonicalWrite();
      }
    } finally {
      finish();
    }
  }

  async function submitReading(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const readAt = utcInstant(
      requiredString(form, 'readDate'),
      requiredString(form, 'readTime'),
    );
    const expected = {
      value: requiredString(form, 'value'),
      readAt: readAt ?? '',
      note: optionalString(form, 'note') ?? null,
    };
    const parsed = recordMeterReadingRequestSchema.safeParse(expected);
    if (!parsed.success) {
      setError(contractErrorMessage());
      return;
    }
    if (!begin('reading')) return;

    try {
      const reading = await api.post(
        meterReadingsPath(meter.id),
        parsed.data,
        meterReadingResponseSchema,
      );
      assertMeterReadingMutationOwner(meter.id, expected, reading);
      if (localSubmission.isMounted()) {
        formElement.reset();
        setBoundaryReadingId(reading.id);
        setSuccess('Meter Reading recorded.');
        onCanonicalWrite();
      }
    } catch (cause) {
      const canonical = await fetchCanonical();
      const committed = canonical
        ? findCommittedReading(canonical, expected)
        : null;
      if (committed) {
        if (localSubmission.isMounted()) {
          formElement.reset();
          setBoundaryReadingId(committed.id);
          setSuccess('Meter Reading was committed and recovered.');
          onCanonicalWrite();
        }
      } else if (localSubmission.isMounted()) {
        setError(meterError(cause, 'Meter Reading could not be recorded.'));
        onCanonicalWrite();
      }
    } finally {
      finish();
    }
  }

  async function submitBoundary(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const reading = detail.readings.find(
      (candidate) => candidate.id === requiredString(form, 'readingId'),
    );
    if (!reading) {
      setError('Choose a canonical Meter Reading first.');
      return;
    }

    const expected = {
      tenancyId: requiredString(form, 'tenancyId'),
      type: boundaryType,
    };
    const parsed = linkMeterReadingBoundaryRequestSchema.safeParse(expected);
    if (!parsed.success) {
      setError(contractErrorMessage());
      return;
    }
    if (!begin('boundary')) return;

    try {
      const boundary = await api.post(
        meterReadingBoundariesPath(reading.id),
        parsed.data,
        meterReadingBoundaryResponseSchema,
      );
      assertMeterBoundaryMutationOwner(reading, expected, boundary);
      if (localSubmission.isMounted()) {
        setSuccess(
          `${formatDetailKey(boundary.type)} boundary linked to the exact Reading.`,
        );
        onCanonicalWrite();
      }
    } catch (cause) {
      const canonical = await fetchCanonical();
      const committed = canonical
        ? findCommittedBoundary(canonical, {
            readingId: reading.id,
            tenancyId: expected.tenancyId,
            type: expected.type,
          })
        : null;
      if (committed) {
        if (localSubmission.isMounted()) {
          setSuccess(
            `${formatDetailKey(committed.type)} boundary was committed and recovered.`,
          );
          onCanonicalWrite();
        }
      } else if (localSubmission.isMounted()) {
        setError(
          meterError(cause, 'Meter Reading boundary could not be linked.'),
        );
        onCanonicalWrite();
      }
    } finally {
      finish();
    }
  }

  async function submitRetirement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const retiredAt = utcInstant(
      requiredString(form, 'retiredDate'),
      requiredString(form, 'retiredTime'),
    );
    const expected = {
      retiredAt: retiredAt ?? '',
      retirementReason: requiredString(form, 'retirementReason'),
    };
    const parsed = retireMeterRequestSchema.safeParse({
      expectedVersion: meter.version,
      ...expected,
    });
    if (!parsed.success) {
      setError(contractErrorMessage());
      return;
    }
    if (!begin('retire')) return;

    try {
      const retired = await api.post(
        meterRetirePath(meter.id),
        parsed.data,
        meterResponseSchema,
      );
      assertMeterRetirementMutationOwner(meter, expected, retired);
      if (localSubmission.isMounted()) {
        setSuccess('Meter retired. Physical lifecycle is now terminal.');
        onCanonicalWrite();
      }
    } catch (cause) {
      const canonical = await fetchCanonical();
      if (
        canonical &&
        canonical.meter.status === 'retired' &&
        canonical.meter.retiredAt === expected.retiredAt &&
        canonical.meter.retirementReason === expected.retirementReason
      ) {
        if (localSubmission.isMounted()) {
          setSuccess('Meter retirement was committed and recovered.');
          onCanonicalWrite();
        }
      } else if (localSubmission.isMounted()) {
        setError(meterError(cause, 'Meter could not be retired.'));
        onCanonicalWrite();
      }
    } finally {
      finish();
    }
  }

  const boundaryByReading = new Map<string, MeterReadingBoundaryResponse[]>();
  for (const boundary of detail.boundaries) {
    const current = boundaryByReading.get(boundary.readingId) ?? [];
    current.push(boundary);
    boundaryByReading.set(boundary.readingId, current);
  }

  return (
    <section className="panel meter-admin-panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Selected Meter · v{meter.version}</p>
          <h2>{meter.code} · {meter.label}</h2>
        </div>
        <span className={'status-chip status-' + meter.status}>
          {meter.status}
        </span>
      </div>

      {error ? (
        <p className="setup-form-error" role="alert">
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="setup-form-success" aria-live="polite">
          {success}
        </p>
      ) : null}

      <dl className="detail-list meter-identity-grid">
        <div><dt>Serial</dt><dd>{meter.serialNumber}</dd></div>
        <div><dt>Utility</dt><dd>{formatDetailKey(meter.utilityType)}</dd></div>
        <div><dt>Unit</dt><dd>{meter.measurementUnit}</dd></div>
        <div><dt>Space</dt><dd>{meter.spaceId ?? 'Unit level'}</dd></div>
        <div><dt>Installed</dt><dd>{meter.installedAt}</dd></div>
        <div><dt>Recorded</dt><dd>{meter.recordedAt}</dd></div>
      </dl>

      <div className="meter-admin-grid">
        <form
          className="setup-form meter-admin-form"
          data-meter-form="label"
          onSubmit={submitLabel}
        >
          <div className="tenancy-form-heading">
            <strong>Label correction</strong>
            <span>Identity, placement and utility facts stay immutable</span>
          </div>
          <label>
            Label
            <input
              defaultValue={meter.label}
              disabled={writeGate.pending}
              name="label"
              required
            />
          </label>
          <button
            className="button-primary"
            disabled={writeGate.pending}
            type="submit"
          >
            {action === 'label' ? 'Saving…' : 'Save label'}
          </button>
        </form>

        <form
          className="setup-form meter-admin-form"
          data-meter-form="reading"
          onSubmit={submitReading}
        >
          <div className="tenancy-form-heading">
            <strong>Record Reading</strong>
            <span>Append-only physical observation</span>
          </div>
          <label>
            Value ({meter.measurementUnit})
            <input
              disabled={writeGate.pending}
              inputMode="decimal"
              name="value"
              required
            />
          </label>
          <div className="setup-form-grid">
            <label>
              Read date
              <input
                disabled={writeGate.pending}
                name="readDate"
                required
                type="date"
              />
            </label>
            <label>
              Read time (UTC)
              <input
                disabled={writeGate.pending}
                name="readTime"
                required
                type="time"
              />
            </label>
          </div>
          <label>
            Note
            <input disabled={writeGate.pending} name="note" />
          </label>
          {meter.status === 'retired' ? (
            <p className="setup-hint">
              Historical backfill remains allowed only at or before the
              retirement occurrence.
            </p>
          ) : null}
          <button
            className="button-primary"
            disabled={writeGate.pending}
            type="submit"
          >
            {action === 'reading' ? 'Recording…' : 'Record Reading'}
          </button>
        </form>

        {meter.status === 'active' ? (
          <form
            className="setup-form meter-admin-form"
            data-meter-form="retire"
            onSubmit={submitRetirement}
          >
            <div className="tenancy-form-heading">
              <strong>Retire Meter</strong>
              <span>Terminal physical lifecycle fact</span>
            </div>
            <div className="setup-form-grid">
              <label>
                Retired date
                <input
                  disabled={writeGate.pending}
                  name="retiredDate"
                  required
                  type="date"
                />
              </label>
              <label>
                Retired time (UTC)
                <input
                  disabled={writeGate.pending}
                  name="retiredTime"
                  required
                  type="time"
                />
              </label>
            </div>
            <label>
              Reason
              <input
                disabled={writeGate.pending}
                name="retirementReason"
                required
              />
            </label>
            <button
              className="button-primary"
              disabled={writeGate.pending}
              type="submit"
            >
              {action === 'retire' ? 'Retiring…' : 'Retire Meter'}
            </button>
          </form>
        ) : (
          <div className="setup-form meter-admin-form">
            <div className="tenancy-form-heading">
              <strong>Retirement provenance</strong>
              <span>Terminal and immutable</span>
            </div>
            <dl className="detail-list compact-detail-list">
              <div><dt>Retired at</dt><dd>{meter.retiredAt}</dd></div>
              <div><dt>Reason</dt><dd>{meter.retirementReason}</dd></div>
              <div>
                <dt>Recorded at</dt>
                <dd>{meter.retirementRecordedAt}</dd>
              </div>
            </dl>
          </div>
        )}
      </div>

      <div className="meter-admin-section">
        <div className="legal-documents-heading">
          <div>
            <p className="eyebrow">Physical observations</p>
            <h3>Readings and consumption</h3>
          </div>
          <span className="section-note">
            Decrease is surfaced as continuity break, never negative usage
          </span>
        </div>

        {detail.readings.length === 0 ? (
          <p className="muted">No Meter Readings recorded yet.</p>
        ) : (
          <div className="meter-reading-list">
            {detail.readings.map((reading) => (
              <article className="meter-reading-card" key={reading.id}>
                <div className="record-heading">
                  <div>
                    <span className="eyebrow">{reading.readAt}</span>
                    <h4>
                      {formatReadingValue(
                        reading.value,
                        meter.measurementUnit,
                      )}
                    </h4>
                  </div>
                  <span className="section-note">
                    recorded {reading.recordedAt}
                  </span>
                </div>
                <p className="muted">{reading.note ?? 'No note'}</p>
                {(boundaryByReading.get(reading.id) ?? []).length > 0 ? (
                  <ul className="meter-boundary-tags">
                    {(boundaryByReading.get(reading.id) ?? []).map(
                      (boundary) => (
                        <li key={boundary.id}>
                          {formatDetailKey(boundary.type)} ·{' '}
                          {tenancies.find(
                            (tenancy) => tenancy.id === boundary.tenancyId,
                          )?.code ?? boundary.tenancyId}
                        </li>
                      ),
                    )}
                  </ul>
                ) : null}
              </article>
            ))}
          </div>
        )}

        {detail.consumptionIntervals.length > 0 ? (
          <div className="table-shell">
            <table>
              <thead>
                <tr>
                  <th>From</th>
                  <th>To</th>
                  <th>Consumption</th>
                  <th>Continuity</th>
                </tr>
              </thead>
              <tbody>
                {detail.consumptionIntervals.map((interval) => (
                  <tr
                    key={`${interval.fromReadingId}:${interval.toReadingId}`}
                  >
                    <td>{interval.fromValue}</td>
                    <td>{interval.toValue}</td>
                    <td>
                      {interval.consumption === null
                        ? '—'
                        : formatReadingValue(
                            interval.consumption,
                            meter.measurementUnit,
                          )}
                    </td>
                    <td>{formatDetailKey(interval.continuity)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>

      <form
        className="setup-form meter-admin-form meter-boundary-form"
        data-meter-form="boundary"
        onSubmit={submitBoundary}
      >
        <div className="tenancy-form-heading">
          <strong>Link occupancy boundary</strong>
          <span>
            Boundary role is separate from the physical Reading itself
          </span>
        </div>
        <div className="setup-form-grid">
          <label>
            Reading
            <select
              disabled={writeGate.pending || detail.readings.length === 0}
              name="readingId"
              onChange={(event) =>
                setBoundaryReadingId(event.currentTarget.value)
              }
              value={boundaryReadingId}
            >
              {detail.readings.map((reading) => (
                <option key={reading.id} value={reading.id}>
                  {reading.readAt} ·{' '}
                  {formatReadingValue(
                    reading.value,
                    meter.measurementUnit,
                  )}
                </option>
              ))}
            </select>
          </label>
          <label>
            Boundary type
            <select
              disabled={writeGate.pending}
              onChange={(event) =>
                setBoundaryType(
                  event.currentTarget.value as MeterReadingBoundaryType,
                )
              }
              value={boundaryType}
            >
              {METER_READING_BOUNDARY_TYPES.map((type) => (
                <option key={type} value={type}>
                  {formatDetailKey(type)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Compatible Tenancy
            <select
              disabled={
                writeGate.pending ||
                selectedBoundaryReading === null ||
                eligibleBoundaryTenancies.length === 0
              }
              key={`${boundaryReadingId}:${boundaryType}`}
              name="tenancyId"
              defaultValue=""
              required
            >
              <option value="">Select Tenancy…</option>
              {eligibleBoundaryTenancies.map((tenancy) => (
                <option key={tenancy.id} value={tenancy.id}>
                  {tenancy.code} ·{' '}
                  {boundaryType === 'move_in'
                    ? tenancy.actualStart
                    : tenancy.actualEnd}
                </option>
              ))}
            </select>
          </label>
        </div>
        {selectedBoundaryReading &&
        eligibleBoundaryTenancies.length === 0 ? (
          <p className="setup-hint">
            No same-Unit Tenancy has a matching{' '}
            {formatDetailKey(boundaryType)} date for this Reading, or that
            boundary already exists.
          </p>
        ) : null}
        <button
          className="button-primary"
          disabled={
            writeGate.pending ||
            selectedBoundaryReading === null ||
            eligibleBoundaryTenancies.length === 0
          }
          type="submit"
        >
          {action === 'boundary' ? 'Linking…' : 'Link boundary'}
        </button>
      </form>
    </section>
  );
}

export function UnitMeters({
  api,
  propertyId,
  unitId,
  asOf,
  meterId,
  navigate,
  setNavigationBlocker,
}: UnitMetersProps) {
  const [meters, setMeters] = useState<readonly MeterResponse[] | null>(null);
  const [spaces, setSpaces] = useState<readonly SpaceResponse[] | null>(null);
  const [tenancies, setTenancies] =
    useState<readonly TenancyResponse[] | null>(null);
  const [detail, setDetail] = useState<MeterDetailResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [listRevision, setListRevision] = useState(0);
  const [detailRevision, setDetailRevision] = useState(0);
  const [writePending, setWritePending] = useState(false);
  const writeSubmission = useCreateSubmissionGuard();

  const writeGate: MeterWriteGate = {
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
    setMeters(null);
    setSpaces(null);
    setTenancies(null);
    setLoadError(null);

    void Promise.all([
      api.get(unitMetersPath(unitId), meterListResponseSchema, {
        signal: controller.signal,
      }),
      api.get(unitSpacesPath(unitId), spaceListResponseSchema, {
        signal: controller.signal,
      }),
      api.get(unitTenanciesPath(unitId), tenancyListResponseSchema, {
        signal: controller.signal,
      }),
    ])
      .then(([meterResponse, spaceResponse, tenancyResponse]) => {
        assertUnitMetersOwner(unitId, meterResponse.meters);
        if (
          spaceResponse.items.some((space) => space.unitId !== unitId)
        ) {
          throw new Error(
            'Unit Meter workspace contains a Space owned by another Unit.',
          );
        }
        assertUnitTenanciesOwner(unitId, tenancyResponse.items);
        setMeters(meterResponse.meters);
        setSpaces(spaceResponse.items);
        setTenancies(tenancyResponse.items);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setLoadError(
          cause instanceof Error
            ? cause.message
            : 'Meter workspace could not be loaded.',
        );
      });

    return () => controller.abort();
  }, [api, listRevision, unitId]);

  useEffect(() => {
    setDetail(null);
    setDetailError(null);
    if (!meterId) return;

    const controller = new AbortController();
    void api
      .get(meterPath(meterId), meterDetailResponseSchema, {
        signal: controller.signal,
      })
      .then((response) => {
        assertMeterDetailOwner(unitId, meterId, response);
        setDetail(response);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setDetailError(
          cause instanceof Error
            ? cause.message
            : 'Meter detail could not be loaded.',
        );
      });

    return () => controller.abort();
  }, [api, detailRevision, meterId, unitId]);

  const selectedListMeter = useMemo(
    () => meters?.find((meter) => meter.id === meterId) ?? null,
    [meterId, meters],
  );
  const invalidSelection =
    meters !== null && meterId !== undefined && selectedListMeter === null;

  function refreshCanonical() {
    setListRevision((revision) => revision + 1);
    setDetailRevision((revision) => revision + 1);
  }

  async function reconcileCreate(expected: {
    readonly code: string;
    readonly serialNumber: string;
    readonly unitId: string;
  }) {
    try {
      const response = await api.get(
        unitMetersPath(unitId),
        meterListResponseSchema,
      );
      assertUnitMetersOwner(unitId, response.meters);
      setMeters(response.meters);
      const committed = response.meters.find(
        (meter) =>
          meter.code === expected.code &&
          meter.serialNumber === expected.serialNumber &&
          meter.unitId === expected.unitId,
      );
      if (committed) {
        writeGate.finish();
        navigate(
          unitRoute(propertyId, unitId, asOf, 'meters', {
            meterId: committed.id,
          }),
        );
      }
    } catch {
      setListRevision((revision) => revision + 1);
    }
  }

  return (
    <div className="dashboard-stack">
      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Meters + Utilities</p>
            <h2>Register Meter</h2>
          </div>
          <span className="section-note">
            Physical identity and placement are immutable
          </span>
        </div>

        {loadError ? (
          <p className="form-error" role="alert">{loadError}</p>
        ) : null}
        {spaces ? (
          <CreateMeterForm
            api={api}
            onCreated={(created) => {
              refreshCanonical();
              navigate(
                unitRoute(propertyId, unitId, asOf, 'meters', {
                  meterId: created.id,
                }),
              );
            }}
            onReconcile={reconcileCreate}
            spaces={spaces}
            unitId={unitId}
            writeGate={writeGate}
          />
        ) : (
          <p className="muted" aria-live="polite">
            Loading Meter setup…
          </p>
        )}
      </section>

      <section className="panel page-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Unit Meter registry</p>
            <h2>Meters</h2>
          </div>
          <span className="section-note">
            Current physical registry · reporting date {asOf} preserved
          </span>
        </div>

        {!loadError && meters === null ? (
          <p className="muted" aria-live="polite">Loading Meters…</p>
        ) : null}
        {meters?.length === 0 ? (
          <p className="muted">No Meters are registered for this Unit.</p>
        ) : null}

        {meters && spaces && meters.length > 0 ? (
          <div className="meter-grid">
            {meters.map((meter) => (
              <WorkspaceLink
                ariaCurrent={meter.id === meterId ? 'page' : undefined}
                className={
                  'meter-card meter-card-link ' +
                  (meter.id === meterId ? 'meter-card-active' : '')
                }
                key={meter.id}
                navigate={navigate}
                route={unitRoute(propertyId, unitId, asOf, 'meters', {
                  meterId: meter.id,
                })}
              >
                <div className="record-heading">
                  <div>
                    <span className="eyebrow">{meter.code}</span>
                    <h3>{meter.label}</h3>
                  </div>
                  <span className={'status-chip status-' + meter.status}>
                    {meter.status}
                  </span>
                </div>
                <dl className="detail-list compact-detail-list">
                  <div><dt>Serial</dt><dd>{meter.serialNumber}</dd></div>
                  <div>
                    <dt>Utility</dt>
                    <dd>{formatDetailKey(meter.utilityType)}</dd>
                  </div>
                  <div><dt>Unit</dt><dd>{meter.measurementUnit}</dd></div>
                  <div>
                    <dt>Space</dt>
                    <dd>
                      {spaces.find((space) => space.id === meter.spaceId)?.name ??
                        (meter.spaceId ? meter.spaceId : 'Unit level')}
                    </dd>
                  </div>
                  <div><dt>Version</dt><dd>{meter.version}</dd></div>
                </dl>
              </WorkspaceLink>
            ))}
          </div>
        ) : null}

        {invalidSelection ? (
          <p className="form-error" role="alert">
            The selected Meter does not belong to this Unit.
          </p>
        ) : null}
      </section>

      {detailError ? (
        <section className="panel state-panel" role="alert">
          <p className="eyebrow">Meter identity failed</p>
          <h2>Meter unavailable</h2>
          <p>{detailError}</p>
        </section>
      ) : null}

      {meterId && selectedListMeter && !detail && !detailError ? (
        <section className="panel state-panel" aria-live="polite">
          <p className="eyebrow">Canonical Meter</p>
          <h2>Restoring Meter detail…</h2>
        </section>
      ) : null}

      {detail && tenancies ? (
        <MeterAdministration
          api={api}
          detail={detail}
          key={`${detail.meter.id}:${detail.meter.version}:${detail.readings.length}:${detail.boundaries.length}`}
          onCanonicalWrite={refreshCanonical}
          tenancies={tenancies}
          unitId={unitId}
          writeGate={writeGate}
        />
      ) : null}
    </div>
  );
}
