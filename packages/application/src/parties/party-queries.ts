import {
  DomainError,
  type Party,
  type PartyId,
} from '@portfolio/domain';
import { requireCapability, type Actor } from '../security/access.js';
import type { PartyRepository } from './party-repository.js';

export async function getPartyQuery(
  repository: PartyRepository,
  actor: Actor,
  id: PartyId,
): Promise<Party> {
  requireCapability(actor, 'parties:read');
  const party = await repository.getById(id);
  if (!party) throw new DomainError('PARTY_NOT_FOUND', 'Party not found.');
  return party;
}

export function listPartiesQuery(
  repository: PartyRepository,
  actor: Actor,
): Promise<readonly Party[]> {
  requireCapability(actor, 'parties:read');
  return repository.list();
}


export async function listPartiesByIdsQuery(
  repository: PartyRepository,
  actor: Actor,
  ids: readonly PartyId[],
): Promise<readonly Party[]> {
  requireCapability(actor, 'parties:read');

  const uniqueIds = [...new Set(ids)];
  if (uniqueIds.length === 0) return [];

  const parties = await repository.getByIds(uniqueIds);
  const loadedIds = new Set(parties.map((party) => party.id));
  const missing = uniqueIds.find((id) => !loadedIds.has(id));

  if (missing) {
    throw new DomainError(
      'PARTY_NOT_FOUND',
      'One or more requested Parties were not found.',
    );
  }

  return parties;
}
