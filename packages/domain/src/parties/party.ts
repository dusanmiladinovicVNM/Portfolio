import { DomainError } from '../shared/domain-error.js';
import type {
  ContactPointId,
  PartyAddressId,
  PartyId,
} from '../shared/entity-id.js';

export const PARTY_TYPES = ['person', 'company'] as const;
export const PARTY_STATUSES = ['active', 'inactive', 'archived'] as const;
export const CONTACT_POINT_TYPES = ['email', 'phone', 'website'] as const;
export const ADDRESS_TYPES = [
  'legal',
  'residential',
  'mailing',
  'billing',
  'other',
] as const;

export type PartyType = (typeof PARTY_TYPES)[number];
export type PartyStatus = (typeof PARTY_STATUSES)[number];
export type ContactPointType = (typeof CONTACT_POINT_TYPES)[number];
export type AddressType = (typeof ADDRESS_TYPES)[number];

export interface ContactPoint {
  readonly id: ContactPointId;
  readonly partyId: PartyId;
  contactType: ContactPointType;
  value: string;
  label: string | null;
  isPrimary: boolean;
}

export interface PartyAddress {
  readonly id: PartyAddressId;
  readonly partyId: PartyId;
  addressType: AddressType;
  line1: string;
  line2: string | null;
  postalCode: string;
  city: string;
  region: string | null;
  countryCode: string;
  isPrimary: boolean;
}

interface PartyBase {
  readonly id: PartyId;
  code: string;
  displayName: string;
  status: PartyStatus;
  readonly contactPoints: readonly ContactPoint[];
  readonly addresses: readonly PartyAddress[];
}

export interface PersonParty extends PartyBase {
  partyType: 'person';
  firstName: string;
  middleName: string | null;
  lastName: string;
}

export interface CompanyParty extends PartyBase {
  partyType: 'company';
  legalName: string;
}

export type Party = PersonParty | CompanyParty;

export interface CreateContactPointInput {
  id: ContactPointId;
  contactType: ContactPointType;
  value: string;
  label?: string | null;
  isPrimary?: boolean;
}

export interface CreatePartyAddressInput {
  id: PartyAddressId;
  addressType: AddressType;
  line1: string;
  line2?: string | null;
  postalCode: string;
  city: string;
  region?: string | null;
  countryCode: string;
  isPrimary?: boolean;
}

interface CreatePartyBaseInput {
  id: PartyId;
  code: string;
  displayName?: string;
  contactPoints?: readonly CreateContactPointInput[];
  addresses?: readonly CreatePartyAddressInput[];
}

export interface CreatePersonPartyInput extends CreatePartyBaseInput {
  partyType: 'person';
  firstName: string;
  middleName?: string | null;
  lastName: string;
}

export interface CreateCompanyPartyInput extends CreatePartyBaseInput {
  partyType: 'company';
  legalName: string;
}

export type CreatePartyInput = CreatePersonPartyInput | CreateCompanyPartyInput;

function required(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new DomainError('PARTY_REQUIRED_FIELD', `${field} is required.`);
  }
  return normalized;
}

function nullableTrimmed(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const normalized = value.trim();
  return normalized || null;
}

function createContactPoints(
  partyId: PartyId,
  inputs: readonly CreateContactPointInput[],
): readonly ContactPoint[] {
  const primaryTypes = new Set<ContactPointType>();

  return inputs.map((input) => {
    const value = required(input.value, 'contact value');
    const isPrimary = input.isPrimary ?? false;

    if (isPrimary) {
      if (primaryTypes.has(input.contactType)) {
        throw new DomainError(
          'PARTY_MULTIPLE_PRIMARY_CONTACTS',
          `Only one primary ${input.contactType} contact is allowed per party.`,
        );
      }
      primaryTypes.add(input.contactType);
    }

    return {
      id: input.id,
      partyId,
      contactType: input.contactType,
      value,
      label: nullableTrimmed(input.label),
      isPrimary,
    };
  });
}

function createAddresses(
  partyId: PartyId,
  inputs: readonly CreatePartyAddressInput[],
): readonly PartyAddress[] {
  const primaryTypes = new Set<AddressType>();

  return inputs.map((input) => {
    const countryCode = required(input.countryCode, 'countryCode').toUpperCase();
    if (!/^[A-Z]{2}$/.test(countryCode)) {
      throw new DomainError(
        'PARTY_ADDRESS_INVALID_COUNTRY',
        'countryCode must be an ISO 3166-1 alpha-2 code.',
      );
    }

    const isPrimary = input.isPrimary ?? false;
    if (isPrimary) {
      if (primaryTypes.has(input.addressType)) {
        throw new DomainError(
          'PARTY_MULTIPLE_PRIMARY_ADDRESSES',
          `Only one primary ${input.addressType} address is allowed per party.`,
        );
      }
      primaryTypes.add(input.addressType);
    }

    return {
      id: input.id,
      partyId,
      addressType: input.addressType,
      line1: required(input.line1, 'line1'),
      line2: nullableTrimmed(input.line2),
      postalCode: required(input.postalCode, 'postalCode'),
      city: required(input.city, 'city'),
      region: nullableTrimmed(input.region),
      countryCode,
      isPrimary,
    };
  });
}

export function createParty(input: CreatePartyInput): Party {
  const code = required(input.code, 'code');
  const contactPoints = createContactPoints(input.id, input.contactPoints ?? []);
  const addresses = createAddresses(input.id, input.addresses ?? []);

  if (input.partyType === 'person') {
    const firstName = required(input.firstName, 'firstName');
    const lastName = required(input.lastName, 'lastName');
    const middleName = nullableTrimmed(input.middleName);
    const defaultDisplayName = [firstName, middleName, lastName].filter(Boolean).join(' ');

    return {
      id: input.id,
      code,
      partyType: 'person',
      displayName: input.displayName?.trim() || defaultDisplayName,
      firstName,
      middleName,
      lastName,
      status: 'active',
      contactPoints,
      addresses,
    };
  }

  const legalName = required(input.legalName, 'legalName');
  return {
    id: input.id,
    code,
    partyType: 'company',
    displayName: input.displayName?.trim() || legalName,
    legalName,
    status: 'active',
    contactPoints,
    addresses,
  };
}
