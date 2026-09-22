import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { createPortfolioApi } from './api/portfolio-api.js';
import type { AuthSession, SessionGateway } from './auth/session-gateway.js';
import { PartyDirectory } from './admin/PartyDirectory.js';
import { PortfolioDashboard } from './dashboard/PortfolioDashboard.js';
import { PropertyUnits } from './dossier/PropertyUnits.js';
import { UnitDossier } from './dossier/UnitDossier.js';
import { WorkspaceLink } from './navigation/WorkspaceLink.js';
import {
  dashboardRoute,
  partiesRoute,
  propertyRoute,
  unitRoute,
  workspaceRouteOwnerKey,
} from './navigation/workspace-route.js';
import { useWorkspaceNavigation } from './navigation/use-workspace-navigation.js';

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
          <label>
            Email
            <input
              autoComplete="email"
              inputMode="email"
              onChange={(event) => setEmail(event.currentTarget.value)}
              required
              type="email"
              value={email}
            />
          </label>
          <label>
            Password
            <input
              autoComplete="current-password"
              onChange={(event) => setPassword(event.currentTarget.value)}
              required
              type="password"
              value={password}
            />
          </label>
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          <button disabled={submitting} type="submit">
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
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
  const { route, navigate, setNavigationBlocker } =
    useWorkspaceNavigation();
  const mainRef = useRef<HTMLElement>(null);
  const focusKey =
    route.kind === 'dashboard'
      ? 'dashboard'
      : route.kind === 'parties'
        ? 'parties'
        : route.kind === 'property'
          ? 'property:' + route.propertyId
          : 'unit:' + route.propertyId + ':' + route.unitId + ':' + route.tab;
  const api = useMemo(
    () =>
      createPortfolioApi({
        baseUrl: apiBaseUrl,
        getAccessToken: () => session.accessToken,
      }),
    [apiBaseUrl, session.accessToken],
  );

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const heading = mainRef.current?.querySelector('h1');
      if (!(heading instanceof HTMLElement)) return;
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [focusKey]);

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
      <a className="skip-link" href="#workspace-main">
        Skip to main content
      </a>
      <aside className="sidebar">
        <div>
          <p className="brand">Portfolio</p>
          <p className="eyebrow">Property lifecycle</p>
        </div>
        <nav aria-label="Primary">
          <WorkspaceLink
            ariaCurrent={route.kind === 'dashboard' ? 'page' : undefined}
            className={`nav-item ${route.kind === 'dashboard' ? 'nav-item-active' : ''}`}
            navigate={navigate}
            route={dashboardRoute(route.asOf)}
          >
            Overview
          </WorkspaceLink>
          <WorkspaceLink
            ariaCurrent={route.kind === 'parties' ? 'page' : undefined}
            className={'nav-item ' + (route.kind === 'parties' ? 'nav-item-active' : '')}
            navigate={navigate}
            route={partiesRoute(route.asOf)}
          >
            Parties
          </WorkspaceLink>
          {route.kind === 'property' || route.kind === 'unit' ? (
            <WorkspaceLink
              ariaCurrent={route.kind === 'property' ? 'page' : undefined}
              className={`nav-item ${route.kind === 'property' ? 'nav-item-active' : ''}`}
              navigate={navigate}
              route={propertyRoute(route.propertyId, route.asOf)}
            >
              Property
            </WorkspaceLink>
          ) : (
            <span className="nav-item nav-item-disabled">Property</span>
          )}
          {route.kind === 'unit' ? (
            <WorkspaceLink
              ariaCurrent="page"
              className="nav-item nav-item-active"
              navigate={navigate}
              route={unitRoute(
                route.propertyId,
                route.unitId,
                route.asOf,
                route.tab,
                {
                  ...(route.tenancyId ? { tenancyId: route.tenancyId } : {}),
                  ...(route.agreementId
                    ? { agreementId: route.agreementId }
                    : {}),
                  ...(route.amendmentId
                    ? { amendmentId: route.amendmentId }
                    : {}),
                  ...(route.inspectionId
                    ? { inspectionId: route.inspectionId }
                    : {}),
                  ...(route.inspectionSectionId
                    ? { inspectionSectionId: route.inspectionSectionId }
                    : {}),
                  ...(route.assetId ? { assetId: route.assetId } : {}),
                },
              )}
            >
              Unit dossier
            </WorkspaceLink>
          ) : (
            <span className="nav-item nav-item-disabled">Unit dossier</span>
          )}
        </nav>
        <div className="session-card">
          <span>{session.email ?? 'Authenticated user'}</span>
          <button className="button-secondary" onClick={signOut} type="button">
            Sign out
          </button>
          {signOutError ? <p className="form-error" role="alert">{signOutError}</p> : null}
        </div>
      </aside>

      <main
        className="workspace"
        id="workspace-main"
        ref={mainRef}
        tabIndex={-1}
      >
        {route.kind === 'dashboard' ? (
          <PortfolioDashboard api={api} asOf={route.asOf} navigate={navigate} />
        ) : null}

        {route.kind === 'parties' ? (
          <PartyDirectory api={api} asOf={route.asOf} />
        ) : null}

        {route.kind === 'property' ? (
          <PropertyUnits
            key={workspaceRouteOwnerKey(route)}
            api={api}
            asOf={route.asOf}
            navigate={navigate}
            propertyId={route.propertyId}
          />
        ) : null}

        {route.kind === 'unit' ? (
          <UnitDossier
            key={workspaceRouteOwnerKey(route)}
            api={api}
            asOf={route.asOf}
            navigate={navigate}
            propertyId={route.propertyId}
            tab={route.tab}
            tenancyId={route.tenancyId}
            agreementId={route.agreementId}
            amendmentId={route.amendmentId}
            inspectionId={route.inspectionId}
            inspectionSectionId={route.inspectionSectionId}
            assetId={route.assetId}
            setNavigationBlocker={setNavigationBlocker}
            unitId={route.unitId}
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

    void sessionGateway
      .getSession()
      .then((current) => {
        if (active) setSession(current);
      })
      .catch((cause: unknown) => {
        if (active) {
          setBootstrapError(
            cause instanceof Error
              ? cause.message
              : 'Authentication bootstrap failed.',
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    const unsubscribe = sessionGateway.subscribe((current) => {
      if (active) {
        setSession(current);
        setBootstrapError(null);
        setLoading(false);
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [sessionGateway]);

  if (loading) return <main className="status-page">Opening Portfolio…</main>;

  if (bootstrapError) {
    return (
      <main className="status-page" role="alert">
        <strong>Portfolio could not start.</strong>
        <span>{bootstrapError}</span>
      </main>
    );
  }

  return session ? (
    <AuthenticatedShell
      apiBaseUrl={apiBaseUrl}
      session={session}
      sessionGateway={sessionGateway}
    />
  ) : (
    <Login sessionGateway={sessionGateway} />
  );
}
