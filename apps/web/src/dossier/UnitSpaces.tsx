import {
  createSpaceRequestSchema,
  spaceListResponseSchema,
  spaceResponseSchema,
  type SpaceResponse,
} from '@portfolio/contracts';
import { SPACE_TYPES } from '@portfolio/domain';
import { type FormEvent, useEffect, useState } from 'react';
import { spacesPath, unitSpacesPath } from '../api/paths.js';
import type { PortfolioApi } from '../api/portfolio-api.js';
import { useCreateSubmissionGuard } from '../admin/use-create-submission-guard.js';
import {
  contractErrorMessage,
  optionalNumber,
  requiredString,
} from '../admin/form-utils.js';
import { assertUnitSpacesOwner } from './route-owner.js';

interface UnitSpacesProps {
  readonly api: PortfolioApi;
  readonly unitId: string;
}

function label(value: string): string {
  return value.replaceAll('_', ' ');
}

function sortSpaces(values: readonly SpaceResponse[]): readonly SpaceResponse[] {
  return [...values].sort(
    (left, right) =>
      left.sortOrder - right.sortOrder ||
      left.name.localeCompare(right.name),
  );
}

export function UnitSpaces({ api, unitId }: UnitSpacesProps) {
  const [spaces, setSpaces] = useState<readonly SpaceResponse[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submission = useCreateSubmissionGuard();

  useEffect(() => {
    const controller = new AbortController();
    setSpaces(null);
    setLoadError(null);

    void api
      .get(unitSpacesPath(unitId), spaceListResponseSchema, {
        signal: controller.signal,
      })
      .then((response) => {
        assertUnitSpacesOwner(unitId, response.items);
        setSpaces(sortSpaces(response.items));
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setLoadError(
          cause instanceof Error ? cause.message : 'Spaces could not be loaded.',
        );
      });

    return () => controller.abort();
  }, [api, unitId]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (spaces === null || !submission.tryStart()) return;

    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const parsed = createSpaceRequestSchema.safeParse({
      unitId,
      code: requiredString(form, 'code'),
      name: requiredString(form, 'name'),
      spaceType: requiredString(form, 'spaceType'),
      areaM2: optionalNumber(form, 'areaM2'),
      sortOrder: optionalNumber(form, 'sortOrder'),
    });

    if (!parsed.success) {
      submission.finish();
      setCreateError(contractErrorMessage());
      return;
    }

    setSubmitting(true);
    setCreateError(null);
    try {
      const created = await api.post(
        spacesPath(),
        parsed.data,
        spaceResponseSchema,
      );
      if (created.unitId !== unitId) {
        throw new Error(
          'Created Space does not belong to the Unit encoded in the route.',
        );
      }
      if (submission.isMounted()) {
        setSpaces((current) =>
          sortSpaces([
            ...(current ?? []).filter((item) => item.id !== created.id),
            created,
          ]),
        );
        formElement.reset();
      }
    } catch (cause) {
      if (submission.isMounted()) {
        setCreateError(
          cause instanceof Error ? cause.message : 'Space could not be created.',
        );
      }
    } finally {
      submission.finish();
      if (submission.isMounted()) setSubmitting(false);
    }
  }

  return (
    <div className="dashboard-stack">
      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Core setup</p>
            <h2>Add Space</h2>
          </div>
          <span className="section-note">Room / storage / parking grain</span>
        </div>

        <form className="setup-form" onSubmit={submit}>
          <div className="setup-form-grid">
            <label>
              Code
              <input name="code" placeholder="BED-01" required />
            </label>
            <label>
              Name
              <input name="name" placeholder="Bedroom" required />
            </label>
            <label>
              Space type
              <select defaultValue="bedroom" name="spaceType">
                {SPACE_TYPES.map((value) => (
                  <option key={value} value={value}>{label(value)}</option>
                ))}
              </select>
            </label>
            <label>
              Area m²
              <input min="0.01" name="areaM2" step="0.01" type="number" />
            </label>
            <label>
              Sort order
              <input min="0" name="sortOrder" step="1" type="number" />
            </label>
          </div>

          {createError ? (
            <p className="setup-form-error" role="alert">{createError}</p>
          ) : null}

          <div className="setup-form-actions">
            <span className="setup-hint">
              Space code is unique inside this Unit.
            </span>
            <button
              className="button-primary"
              disabled={submitting || spaces === null}
              type="submit"
            >
              {spaces === null
                ? 'Loading Spaces…'
                : submitting
                  ? 'Creating…'
                  : 'Create Space'}
            </button>
          </div>
        </form>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Structure</p>
            <h2>Spaces</h2>
          </div>
          <span className="section-note">
            {spaces === null ? 'Loading…' : String(spaces.length) + ' records'}
          </span>
        </div>
        {loadError ? <p className="form-error" role="alert">{loadError}</p> : null}
        {!loadError && spaces === null ? (
          <p className="muted" aria-live="polite">Loading Spaces…</p>
        ) : null}
        {spaces?.length === 0 ? (
          <p className="muted">No Spaces defined for this Unit.</p>
        ) : null}
        {spaces && spaces.length > 0 ? (
          <div className="space-grid">
            {spaces.map((item) => (
              <article className="space-card" key={item.id}>
                <div className="space-card-header">
                  <div>
                    <span className="eyebrow">{item.code}</span>
                    <h3>{item.name}</h3>
                  </div>
                  <span className="status-chip">
                    {item.active ? 'active' : 'inactive'}
                  </span>
                </div>
                <div className="space-meta">
                  <span>{label(item.spaceType)}</span>
                  <span>
                    {item.areaM2 === null ? 'area —' : String(item.areaM2) + ' m²'}
                  </span>
                  <span>order {item.sortOrder}</span>
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}
