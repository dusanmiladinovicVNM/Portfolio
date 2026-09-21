import {
  type PortfolioDashboardResponse,
  type UnitResponse,
} from '@portfolio/contracts';
import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { createPortfolioApi } from './api/portfolio-api.js';
import type { AuthSession, SessionGateway } from './auth/session-gateway.js';
import { PortfolioDashboard } from './dashboard/PortfolioDashboard.js';
import { PropertyUnits } from './dossier/PropertyUnits.js';
import { UnitDossier } from './dossier/UnitDossier.js';

type PropertySummary = PortfolioDashboardResponse['properties'][number];

type WorkspaceView =
  | { readonly kind: 'dashboard' }
  | { readonly kind: 'property'; readonly property: PropertySummary }
  | {
      readonly kind: 'unit';
      readonly property: PropertySummary;
      readonly unit: UnitResponse;
    };

interface AppProps {
  readonly apiBaseUrl: string;
  readonly sessionGateway: SessionGateway;
}

function Login({ sessionGateway }: Pick<AppProps, 'sessionGateway'>) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await sessionGateway.signInWithPassword(email, password);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Sign in failed.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login-layout">
      <section className="login-panel" aria-labelledby="login-title">
        <p className="eyebrow">Portfolio · internal workspace</p>
        <h1 id="login-title">Property lifecycle, in one place.</h1>
        <p className="lede">
          Sign in with your company account. Business permissions are resolved
          by Portfolio on the server, independently of the external auth role.
        </p>
        <form className="login-form" onSubmit={submit}>
          <label>Email<input autoComplete="email" inputMode="email" onChange={(event) => setEmail(event.currentTarget.value)} required type="email" value={email} /></label>
          <label>Password<input autoComplete="current-password" onChange={(event) => setPassword(event.currentTarget.value)} required type="password" value={password} /></label>
          {error ? <p className="form-error">{error}</p> : null}
          <button disabled={submitting} type="submit">{submitting ? 'Signing in…' : 'Sign in'}</button>
        </form>
      </section>
    </main>
  );
}

function AuthenticatedShell({
  apiBaseUrl,
  session,
  sessionGateway,
}: {
  readonly apiBaseUrl: string;
  readonly session: AuthSession;
  readonly sessionGateway: SessionGateway;
}) {
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const [view, setView] = useState<WorkspaceView>({ kind: 'dashboard' });
  const api = useMemo(
    () => createPortfolioApi({
      baseUrl: apiBaseUrl,
      getAccessToken: () => session.accessToken,
    }),
    [apiBaseUrl, session.accessToken],
  );

  async function signOut() {
    setSignOutError(null);
    try {
      await sessionGateway.signOut();
    } catch (cause) {
      setSignOutError(cause instanceof Error ? cause.message : 'Sign out failed.');
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div><p className="brand">Portfolio</p><p className="eyebrow">Property lifecycle</p></div>
        <nav aria-label="Primary">
          <button
            className={`nav-item ${view.kind === 'dashboard' ? 'nav-item-active' : ''}`}
            onClick={() => setView({ kind: 'dashboard' })}
            type="button"
          >
            Overview
          </button>
          <span className={`nav-item ${view.kind === 'property' ? 'nav-item-active' : ''}`}>
            Property
          </span>
          <span className={`nav-item ${view.kind === 'unit' ? 'nav-item-active' : ''}`}>
            Unit dossier
          </span>
        </nav>
        <div className="session-card">
          <span>{session.email ?? 'Authenticated user'}</span>
          <button className="button-secondary" onClick={signOut} type="button">Sign out</button>
          {signOutError ? <p className="form-error">{signOutError}</p> : null}
        </div>
      </aside>
      <main className="workspace">
        {view.kind === 'dashboard' ? (
          <PortfolioDashboard
            api={api}
            onSelectProperty={(property) => setView({ kind: 'property', property })}
          />
        ) : null}
        {view.kind === 'property' ? (
          <PropertyUnits
            api={api}
            property={view.property}
            onBack={() => setView({ kind: 'dashboard' })}
            onSelectUnit={(unit) =>
              setView({ kind: 'unit', property: view.property, unit })
            }
          />
        ) : null}
        {view.kind === 'unit' ? (
          <UnitDossier
            api={api}
            unit={view.unit}
            onBack={() => setView({ kind: 'property', property: view.property })}
          />
        ) : null}
      </main>
    </div>
  );
}

export function App({ apiBaseUrl, sessionGateway }: AppProps) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void sessionGateway.getSession()
      .then((current) => { if (active) setSession(current); })
      .catch((cause: unknown) => {
        if (active) {
          setBootstrapError(cause instanceof Error ? cause.message : 'Authentication bootstrap failed.');
        }
      })
      .finally(() => { if (active) setLoading(false); });

    const unsubscribe = sessionGateway.subscribe((current) => {
      if (active) {
        setSession(current);
        setBootstrapError(null);
        setLoading(false);
      }
    });

    return () => { active = false; unsubscribe(); };
  }, [sessionGateway]);

  if (loading) return <main className="status-page">Opening Portfolio…</main>;
  if (bootstrapError) {
    return <main className="status-page" role="alert"><strong>Portfolio could not start.</strong><span>{bootstrapError}</span></main>;
  }

  return session ? (
    <AuthenticatedShell apiBaseUrl={apiBaseUrl} session={session} sessionGateway={sessionGateway} />
  ) : (
    <Login sessionGateway={sessionGateway} />
  );
}
