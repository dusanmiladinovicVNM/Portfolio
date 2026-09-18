import type postgres from 'postgres';
import type { PartyRepository } from '@portfolio/application';
import {
  DomainError,
  asContactPointId,
  asPartyAddressId,
  asPartyId,
  type AddressType,
  type CompanyParty,
  type ContactPointType,
  type Party,
  type PartyId,
  type PartyStatus,
  type PersonParty,
} from '@portfolio/domain';

type Sql = ReturnType<typeof postgres>;

interface PostgresErrorLike {
  code?: string;
  constraint_name?: string;
}

interface ContactPointJson {
  id: string;
  partyId: string;
  contactType: ContactPointType;
  value: string;
  label: string | null;
  isPrimary: boolean;
}

interface AddressJson {
  id: string;
  partyId: string;
  addressType: AddressType;
  line1: string;
  line2: string | null;
  postalCode: string;
  city: string;
  region: string | null;
  countryCode: string;
  isPrimary: boolean;
}

interface PartyRow {
  id: string;
  code: string;
  party_type: 'person' | 'company';
  display_name: string;
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
  legal_name: string | null;
  status: PartyStatus;
  contact_points: ContactPointJson[];
  addresses: AddressJson[];
}

const basePartySelect = `
  select
    p.id,
    p.code,
    p.party_type,
    p.display_name,
    p.first_name,
    p.middle_name,
    p.last_name,
    p.legal_name,
    p.status,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', cp.id,
            'partyId', cp.party_id,
            'contactType', cp.contact_type,
            'value', cp.value,
            'label', cp.label,
            'isPrimary', cp.is_primary
          )
          order by cp.created_at, cp.id
        )
        from public.party_contact_points cp
        where cp.party_id = p.id
      ),
      '[]'::jsonb
    ) as contact_points,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', a.id,
            'partyId', a.party_id,
            'addressType', a.address_type,
            'line1', a.line1,
            'line2', a.line2,
            'postalCode', a.postal_code,
            'city', a.city,
            'region', a.region,
            'countryCode', a.country_code,
            'isPrimary', a.is_primary
          )
          order by a.created_at, a.id
        )
        from public.party_addresses a
        where a.party_id = p.id
      ),
      '[]'::jsonb
    ) as addresses
  from public.parties p
`;

function mapParty(row: PartyRow): Party {
  const common = {
    id: asPartyId(row.id),
    code: row.code,
    displayName: row.display_name,
    status: row.status,
    contactPoints: row.contact_points.map((contact) => ({
      id: asContactPointId(contact.id),
      partyId: asPartyId(contact.partyId),
      contactType: contact.contactType,
      value: contact.value,
      label: contact.label,
      isPrimary: contact.isPrimary,
    })),
    addresses: row.addresses.map((address) => ({
      id: asPartyAddressId(address.id),
      partyId: asPartyId(address.partyId),
      addressType: address.addressType,
      line1: address.line1,
      line2: address.line2,
      postalCode: address.postalCode,
      city: address.city,
      region: address.region,
      countryCode: address.countryCode,
      isPrimary: address.isPrimary,
    })),
  };

  if (row.party_type === 'person') {
    if (row.first_name === null || row.last_name === null) {
      throw new Error('Persisted person party is missing required name fields.');
    }

    const party: PersonParty = {
      ...common,
      partyType: 'person',
      firstName: row.first_name,
      middleName: row.middle_name,
      lastName: row.last_name,
    };
    return party;
  }

  if (row.legal_name === null) {
    throw new Error('Persisted company party is missing legal name.');
  }

  const party: CompanyParty = {
    ...common,
    partyType: 'company',
    legalName: row.legal_name,
  };
  return party;
}

function translatePartyError(error: unknown): DomainError | null {
  const pg = error as PostgresErrorLike;
  if (pg.code !== '23505') return null;

  if (pg.constraint_name === 'parties_code_uq') {
    return new DomainError('PARTY_CODE_ALREADY_EXISTS', 'Party code already exists.');
  }

  return null;
}

export class PostgresPartyRepository implements PartyRepository {
  constructor(private readonly sql: Sql) {}

  async getById(id: PartyId): Promise<Party | null> {
    const rows = await this.sql<PartyRow[]>`
      ${this.sql.unsafe(basePartySelect)}
      where p.id = ${id}
      limit 1
    `;
    return rows.length === 0 ? null : mapParty(rows[0]!);
  }

  async getByIds(ids: readonly PartyId[]): Promise<readonly Party[]> {
    if (ids.length === 0) return [];

    const rows = await this.sql<PartyRow[]>`
      ${this.sql.unsafe(basePartySelect)}
      where p.id = any(${[...ids]}::uuid[])
      order by lower(p.display_name), p.id
    `;
    return rows.map(mapParty);
  }

  async list(): Promise<readonly Party[]> {
    const rows = await this.sql<PartyRow[]>`
      ${this.sql.unsafe(basePartySelect)}
      order by lower(p.display_name), p.id
    `;
    return rows.map(mapParty);
  }

  async codeExists(code: string): Promise<boolean> {
    const rows = await this.sql<{ exists: boolean }[]>`
      select exists(
        select 1 from public.parties where lower(code) = lower(${code})
      ) as exists
    `;
    return rows[0]?.exists ?? false;
  }

  async insert(party: Party): Promise<void> {
    try {
      await this.sql.begin(async (tx) => {
        await tx`
          insert into public.parties (
            id, code, party_type, display_name,
            first_name, middle_name, last_name, legal_name, status
          ) values (
            ${party.id},
            ${party.code},
            ${party.partyType},
            ${party.displayName},
            ${party.partyType === 'person' ? party.firstName : null},
            ${party.partyType === 'person' ? party.middleName : null},
            ${party.partyType === 'person' ? party.lastName : null},
            ${party.partyType === 'company' ? party.legalName : null},
            ${party.status}
          )
        `;

        for (const contact of party.contactPoints) {
          await tx`
            insert into public.party_contact_points (
              id, party_id, contact_type, value, label, is_primary
            ) values (
              ${contact.id}, ${contact.partyId}, ${contact.contactType},
              ${contact.value}, ${contact.label}, ${contact.isPrimary}
            )
          `;
        }

        for (const address of party.addresses) {
          await tx`
            insert into public.party_addresses (
              id, party_id, address_type, line1, line2,
              postal_code, city, region, country_code, is_primary
            ) values (
              ${address.id}, ${address.partyId}, ${address.addressType},
              ${address.line1}, ${address.line2}, ${address.postalCode},
              ${address.city}, ${address.region}, ${address.countryCode},
              ${address.isPrimary}
            )
          `;
        }
      });
    } catch (error) {
      const translated = translatePartyError(error);
      if (translated) throw translated;
      throw error;
    }
  }
}
