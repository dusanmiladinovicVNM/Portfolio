import {
  createStaffRequestSchema,
  staffListResponseSchema,
  staffResponseSchema,
  type StaffResponse,
} from '@portfolio/contracts';
import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import {
  staffInvitePath,
  staffPath,
  staffRolePath,
  staffStatusPath,
} from '../api/paths.js';
import {
  isAmbiguousWriteFailure,
  type PortfolioApi,
} from '../api/portfolio-api.js';
import {
  contractErrorMessage,
  requiredString,
} from './form-utils.js';

interface StaffAdministrationProps {
  readonly api: PortfolioApi;
  readonly currentUserId: string;
}

function sortStaff(items: readonly StaffResponse[]): readonly StaffResponse[] {
  return [...items].sort((left, right) =>
    left.displayName.localeCompare(right.displayName),
  );
}

export function StaffAdministration({
  api,
  currentUserId,
}: StaffAdministrationProps) {
  const [staff, setStaff] = useState<readonly StaffResponse[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const readGenerationRef = useRef(0);
  const writeInFlightRef = useRef(false);

  const load = useCallback(async () => {
    const generation = ++readGenerationRef.current;
    setLoadError(null);
    try {
      const response = await api.get(staffPath(), staffListResponseSchema);
      if (!mountedRef.current || readGenerationRef.current !== generation) return;
      setStaff(sortStaff(response.items));
    } catch (cause) {
      if (!mountedRef.current || readGenerationRef.current !== generation) return;
      setLoadError(
        cause instanceof Error ? cause.message : 'Staff directory could not be loaded.',
      );
    }
  }, [api]);

  useEffect(() => {
    mountedRef.current = true;
    void load();
    return () => {
      mountedRef.current = false;
      readGenerationRef.current += 1;
    };
  }, [load]);

  async function runWrite(
    label: string,
    operation: () => Promise<StaffResponse>,
  ): Promise<boolean> {
    if (writeInFlightRef.current) return false;
    writeInFlightRef.current = true;
    setBusyLabel(label);
    setActionError(null);

    try {
      await operation();
      await load();
      return true;
    } catch (cause) {
      if (isAmbiguousWriteFailure(cause)) {
        await load();
        if (mountedRef.current) {
          setActionError(
            'The write outcome was ambiguous. Portfolio reloaded canonical staff state; verify the row before retrying.',
          );
        }
      } else if (mountedRef.current) {
        setActionError(
          cause instanceof Error ? cause.message : 'Staff change failed.',
        );
      }
      return false;
    } finally {
      writeInFlightRef.current = false;
      if (mountedRef.current) setBusyLabel(null);
    }
  }

  async function createStaff(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const parsed = createStaffRequestSchema.safeParse({
      displayName: requiredString(form, 'displayName'),
      email: requiredString(form, 'email'),
      role: requiredString(form, 'role'),
    });

    if (!parsed.success) {
      setActionError(contractErrorMessage());
      return;
    }

    const created = await runWrite('Creating staff user…', () =>
      api.post(staffPath(), parsed.data, staffResponseSchema),
    );
    if (created && mountedRef.current) formElement.reset();
  }

  return (
    <>
      <header className="workspace-header">
        <div>
          <p className="eyebrow">Security administration</p>
          <h1>Staff</h1>
          <p className="header-note">
            Portfolio roles and access remain canonical here. Supabase Auth is
            used only for external identity and invitation.
          </p>
        </div>
      </header>

      <div className="party-layout">
        <section className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Provisioning</p>
              <h2>Add Staff User</h2>
            </div>
            <span className="section-note">Created inactive</span>
          </div>

          <form className="setup-form" onSubmit={createStaff}>
            <div className="setup-form-grid">
              <label>
                Display name
                <input name="displayName" required />
              </label>
              <label>
                Email
                <input inputMode="email" name="email" required type="email" />
              </label>
              <label>
                Role
                <select defaultValue="inspector" name="role">
                  <option value="inspector">Inspector</option>
                  <option value="manager">Manager</option>
                  <option value="admin">Admin</option>
                </select>
              </label>
            </div>
            <p className="setup-hint">
              Creating a staff row does not grant login access. Use Invite &amp;
              activate after verifying the email and role.
            </p>
            <div className="setup-form-actions">
              <span className="setup-hint">
                {busyLabel ?? 'One security write is applied at a time.'}
              </span>
              <button
                className="button-primary"
                disabled={busyLabel !== null || staff === null}
                type="submit"
              >
                Create Staff User
              </button>
            </div>
          </form>

          {actionError ? (
            <p className="setup-form-error" role="alert">{actionError}</p>
          ) : null}
        </section>

        <section className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Access directory</p>
              <h2>Current Staff</h2>
            </div>
            <span className="section-note">
              {staff === null ? 'Loading…' : String(staff.length) + ' users'}
            </span>
          </div>

          {loadError ? <p className="form-error" role="alert">{loadError}</p> : null}
          {!loadError && staff === null ? (
            <p className="muted" aria-live="polite">Loading staff…</p>
          ) : null}
          {staff?.length === 0 ? <p className="muted">No staff users.</p> : null}

          {staff && staff.length > 0 ? (
            <div className="party-list">
              {staff.map((item) => {
                const self = item.userId === currentUserId;
                const linked = item.identityProviders.includes('supabase');
                return (
                  <article className="party-card" key={item.userId}>
                    <div className="party-card-header">
                      <div>
                        <span className="eyebrow">
                          {self ? 'Current user' : 'Staff'}
                        </span>
                        <h3>{item.displayName}</h3>
                      </div>
                      <span className="status-chip">{item.status}</span>
                    </div>

                    <div className="party-meta">
                      <span>{item.email ?? 'No email'}</span>
                      <span>revision {item.revision}</span>
                      <span>{linked ? 'Supabase linked' : 'Not invited'}</span>
                    </div>

                    <div className="setup-form-grid">
                      <label>
                        Role
                        <select
                          disabled={busyLabel !== null || self}
                          onChange={(event) => {
                            const role = event.currentTarget.value as
                              | 'admin'
                              | 'manager'
                              | 'inspector';
                            if (role === item.role) return;
                            void runWrite('Updating role…', () =>
                              api.patch(
                                staffRolePath(item.userId),
                                { role, expectedRevision: item.revision },
                                staffResponseSchema,
                              ),
                            );
                          }}
                          value={item.role}
                        >
                          <option value="admin">Admin</option>
                          <option value="manager">Manager</option>
                          <option value="inspector">Inspector</option>
                        </select>
                      </label>
                    </div>

                    <div className="setup-form-actions">
                      {!linked && item.status === 'inactive' ? (
                        <button
                          className="button-primary"
                          disabled={busyLabel !== null}
                          onClick={() => {
                            void runWrite('Inviting staff user…', () =>
                              api.post(
                                staffInvitePath(item.userId),
                                { expectedRevision: item.revision },
                                staffResponseSchema,
                              ),
                            );
                          }}
                          type="button"
                        >
                          Invite &amp; activate
                        </button>
                      ) : null}

                      {linked && item.status === 'inactive' ? (
                        <button
                          className="button-primary"
                          disabled={busyLabel !== null}
                          onClick={() => {
                            void runWrite('Activating staff user…', () =>
                              api.patch(
                                staffStatusPath(item.userId),
                                {
                                  status: 'active',
                                  expectedRevision: item.revision,
                                },
                                staffResponseSchema,
                              ),
                            );
                          }}
                          type="button"
                        >
                          Activate
                        </button>
                      ) : null}

                      {linked ? (
                        <button
                          className="button-secondary"
                          disabled={busyLabel !== null}
                          onClick={() => {
                            void runWrite('Sending staff access email…', () =>
                              api.post(
                                staffInvitePath(item.userId),
                                { expectedRevision: item.revision },
                                staffResponseSchema,
                              ),
                            );
                          }}
                          type="button"
                        >
                          Send access email
                        </button>
                      ) : null}

                      {item.status === 'active' && !self ? (
                        <button
                          className="button-secondary"
                          disabled={busyLabel !== null}
                          onClick={() => {
                            void runWrite('Deactivating staff user…', () =>
                              api.patch(
                                staffStatusPath(item.userId),
                                {
                                  status: 'inactive',
                                  expectedRevision: item.revision,
                                },
                                staffResponseSchema,
                              ),
                            );
                          }}
                          type="button"
                        >
                          Deactivate
                        </button>
                      ) : null}

                      {self ? (
                        <span className="setup-hint">
                          Self-demotion and self-deactivation are blocked.
                        </span>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : null}
        </section>
      </div>
    </>
  );
}
