import type { Party, PartyId } from '@portfolio/domain';

export interface PartyRepository {
  getById(id: PartyId): Promise<Party | null>;
  getByIds(ids: readonly PartyId[]): Promise<readonly Party[]>;
  list(): Promise<readonly Party[]>;
  codeExists(code: string): Promise<boolean>;
  insert(party: Party): Promise<void>;
}
