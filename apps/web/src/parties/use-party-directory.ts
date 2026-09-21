import {
  partyListResponseSchema,
  type PartyResponse,
} from '@portfolio/contracts';
import { useEffect, useMemo, useState } from 'react';
import { partiesByIdsPath } from '../api/paths.js';
import type { PortfolioApi } from '../api/portfolio-api.js';

export interface PartyDirectoryState {
  readonly loading: boolean;
  readonly error: string | null;
  readonly byId: ReadonlyMap<string, PartyResponse>;
}

export function usePartyDirectory(
  api: PortfolioApi,
  ids: readonly string[],
): PartyDirectoryState {
  const key = [...new Set(ids)].sort().join(',');
  const normalizedIds = useMemo(
    () => (key ? key.split(',') : []),
    [key],
  );
  const [byId, setById] = useState<ReadonlyMap<string, PartyResponse>>(
    () => new Map(),
  );
  const [loading, setLoading] = useState(normalizedIds.length > 0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setError(null);

    if (normalizedIds.length === 0) {
      setById(new Map());
      setLoading(false);
      return () => controller.abort();
    }

    setLoading(true);
    setById(new Map());

    void api
      .get(partiesByIdsPath(normalizedIds), partyListResponseSchema, {
        signal: controller.signal,
      })
      .then((response) => {
        setById(new Map(response.items.map((party) => [party.id, party])));
        setLoading(false);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(
          cause instanceof Error
            ? cause.message
            : 'Party identities could not be resolved.',
        );
        setLoading(false);
      });

    return () => controller.abort();
  }, [api, key, normalizedIds]);

  return { loading, error, byId };
}

export function partyDisplayName(
  directory: PartyDirectoryState,
  partyId: string,
): string {
  return directory.byId.get(partyId)?.displayName ?? partyId;
}
