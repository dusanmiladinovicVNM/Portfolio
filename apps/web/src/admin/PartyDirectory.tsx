import {
  partyListResponseSchema,
  type PartyResponse,
} from '@portfolio/contracts';
import { useEffect, useState } from 'react';
import { partiesPath } from '../api/paths.js';
import type { PortfolioApi } from '../api/portfolio-api.js';

interface PartyDirectoryProps {
  readonly api: PortfolioApi;
  readonly asOf: string;
}

export function PartyDirectory({ api, asOf }: PartyDirectoryProps) {
  const [parties, setParties] = useState<readonly PartyResponse[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setParties(null);
    setError(null);

    void api
      .get(partiesPath(), partyListResponseSchema, { signal: controller.signal })
      .then((response) =>
        setParties(
          [...response.items].sort((left, right) =>
            left.displayName.localeCompare(right.displayName),
          ),
        ),
      )
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(
          cause instanceof Error ? cause.message : 'Parties could not be loaded.',
        );
      });

    return () => controller.abort();
  }, [api]);

  return (
    <>
      <header className="workspace-header">
        <div>
          <p className="eyebrow">Master data</p>
          <h1>Parties</h1>
          <p className="header-note">
            People and companies used by Tenancies, agreements, service,
            ownership and other Portfolio workflows. Reporting context remains
            {' ' + asOf}.
          </p>
        </div>
      </header>

      <div className="party-layout">
        <section className="panel">
          <p className="eyebrow">Core setup</p>
          <h2>Party creation</h2>
          <p className="muted">
            Create Person and Company records here. The write form is added in
            the next commit on this Draft PR.
          </p>
        </section>

        <section className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Directory</p>
              <h2>Current Parties</h2>
            </div>
            <span className="section-note">
              {parties === null ? 'Loading…' : String(parties.length) + ' records'}
            </span>
          </div>
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          {!error && parties === null ? (
            <p className="muted" aria-live="polite">Loading Parties…</p>
          ) : null}
          {parties?.length === 0 ? (
            <p className="muted">No Parties created yet.</p>
          ) : null}
          {parties && parties.length > 0 ? (
            <div className="party-list">
              {parties.map((party) => (
                <article className="party-card" key={party.id}>
                  <div className="party-card-header">
                    <div>
                      <span className="eyebrow">{party.code}</span>
                      <h3>{party.displayName}</h3>
                    </div>
                    <span className="status-chip">{party.status}</span>
                  </div>
                  <div className="party-meta">
                    <span>{party.partyType}</span>
                    <span>{party.contactPoints.length} contacts</span>
                    <span>{party.addresses.length} addresses</span>
                  </div>
                </article>
              ))}
            </div>
          ) : null}
        </section>
      </div>
    </>
  );
}
