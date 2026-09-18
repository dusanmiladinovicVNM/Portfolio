import {
  DomainError,
  asContactPointId,
  asPartyAddressId,
  asPartyId,
  createParty,
  type AddressType,
  type ContactPointType,
  type Party,
  type PartyType,
} from '@portfolio/domain';
import { requireCapability, type Actor } from '../security/access.js';
import type { IdGenerator } from '../shared/id-generator.js';
import type { PartyRepository } from './party-repository.js';

export interface CreatePartyContactInput {
  contactType: ContactPointType;
  value: string;
  label?: string | null;
  isPrimary?: boolean;
}

export interface CreatePartyAddressCommandInput {
  addressType: AddressType;
  line1: string;
  line2?: string | null;
  postalCode: string;
  city: string;
  region?: string | null;
  countryCode: string;
  isPrimary?: boolean;
}

interface CreatePartyBaseCommandInput {
  code: string;
  partyType: PartyType;
  displayName?: string;
  contactPoints?: readonly CreatePartyContactInput[];
  addresses?: readonly CreatePartyAddressCommandInput[];
}

export interface CreatePersonPartyCommandInput extends CreatePartyBaseCommandInput {
  partyType: 'person';
  firstName: string;
  middleName?: string | null;
  lastName: string;
}

export interface CreateCompanyPartyCommandInput extends CreatePartyBaseCommandInput {
  partyType: 'company';
  legalName: string;
}

export type CreatePartyCommandInput =
  | CreatePersonPartyCommandInput
  | CreateCompanyPartyCommandInput;

export interface CreatePartyDependencies {
  partyRepository: PartyRepository;
  idGenerator: IdGenerator;
}

export async function createPartyCommand(
  deps: CreatePartyDependencies,
  actor: Actor,
  input: CreatePartyCommandInput,
): Promise<Party> {
  requireCapability(actor, 'parties:write');

  const common = {
    id: asPartyId(deps.idGenerator.next()),
    code: input.code,
    ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
    contactPoints: (input.contactPoints ?? []).map((contact) => ({
      id: asContactPointId(deps.idGenerator.next()),
      contactType: contact.contactType,
      value: contact.value,
      ...(contact.label !== undefined ? { label: contact.label } : {}),
      ...(contact.isPrimary !== undefined ? { isPrimary: contact.isPrimary } : {}),
    })),
    addresses: (input.addresses ?? []).map((address) => ({
      id: asPartyAddressId(deps.idGenerator.next()),
      addressType: address.addressType,
      line1: address.line1,
      ...(address.line2 !== undefined ? { line2: address.line2 } : {}),
      postalCode: address.postalCode,
      city: address.city,
      ...(address.region !== undefined ? { region: address.region } : {}),
      countryCode: address.countryCode,
      ...(address.isPrimary !== undefined ? { isPrimary: address.isPrimary } : {}),
    })),
  };

  const party =
    input.partyType === 'person'
      ? createParty({
          ...common,
          partyType: 'person',
          firstName: input.firstName,
          ...(input.middleName !== undefined ? { middleName: input.middleName } : {}),
          lastName: input.lastName,
        })
      : createParty({
          ...common,
          partyType: 'company',
          legalName: input.legalName,
        });

  if (await deps.partyRepository.codeExists(party.code)) {
    throw new DomainError(
      'PARTY_CODE_ALREADY_EXISTS',
      `Party code '${party.code}' already exists.`,
    );
  }

  await deps.partyRepository.insert(party);
  return party;
}
