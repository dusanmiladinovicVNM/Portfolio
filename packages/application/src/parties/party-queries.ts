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
