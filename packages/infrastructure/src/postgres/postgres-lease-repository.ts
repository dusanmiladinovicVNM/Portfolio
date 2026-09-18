import type postgres from 'postgres';
import type { LeaseRepository } from '@portfolio/application';
import {
  DomainError,
  asCurrencyCode,
  asDateOnly,
  asLeaseAgreementId,
  asLeaseAgreementPartyId,
  asLeaseAmendmentId,
  asMoneyAmount,
  asPartyId,
  asTenancyId,
  asTenancyTermVersionId,
  type BillingFrequency,
  type DateOnly,
  type LeaseAgreement,
  type LeaseAgreementPartyRole,
  type LeaseAgreementStatus,
  type LeaseAgreementType,
  type LeaseAgreementId,
  type LeaseAmendment,
  type LeaseAmendmentId,
  type LeaseAmendmentStatus,
  type TenancyId,
  type TenancyTermVersion,
  type TermSourceType,
} from '@portfolio/domain';

type Sql = ReturnType<typeof postgres>;

interface PostgresErrorLike {
  code?: string;
  constraint_name?: string;
}

interface AgreementPartyJson {
  id: string;
  agreementId: string;
  partyId: string;
  role: LeaseAgreementPartyRole;
}

interface AgreementRow {
  id: string;
  tenancy_id: string;
  code: string;
  agreement_type: LeaseAgreementType;
  effective_from: string | Date;
  effective_to: string | Date | null;
  status: LeaseAgreementStatus;
  signed_at: string | Date | null;
  version: number;
  parties: AgreementPartyJson[];
}

interface AmendmentRow {
  id: string;
  agreement_id: string;
  code: string;
  title: string;
  description: string | null;
  effective_from: string | Date;
  status: LeaseAmendmentStatus;
  signed_at: string | Date | null;
  version: number;
}

interface TermRow {
  id: string;
  tenancy_id: string;
  source_type: TermSourceType;
  source_agreement_id: string | null;
  source_amendment_id: string | null;
  effective_from: string | Date;
  currency: string;
  base_rent: string | number;
  service_charge: string | number;
  utilities_advance: string | number;
  parking_rent: string | number;
  other_recurring_charge: string | number;
  deposit_required: string | number;
  billing_frequency: BillingFrequency;
  notice_period_tenant_days: number;
  notice_period_landlord_days: number;
}

const agreementSelect = `
  select
    a.id,
    a.tenancy_id,
    a.code,
    a.agreement_type,
    a.effective_from,
    a.effective_to,
    a.status,
    a.signed_at,
    a.version,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', ap.id,
            'agreementId', ap.agreement_id,
            'partyId', ap.party_id,
            'role', ap.role
          )
          order by ap.created_at, ap.id
        )
        from public.lease_agreement_parties ap
        where ap.agreement_id = a.id
      ),
      '[]'::jsonb
    ) as parties
  from public.lease_agreements a
`;

function dateString(value: string | Date): DateOnly {
  return asDateOnly(value instanceof Date ? value.toISOString().slice(0, 10) : value);
}

function nullableDate(value: string | Date | null): DateOnly | null {
  return value === null ? null : dateString(value);
}

function moneyString(value: string | number): string {
  return typeof value === 'number' ? value.toFixed(2) : value;
}

function mapAgreement(row: AgreementRow): LeaseAgreement {
  return {
    id: asLeaseAgreementId(row.id),
    tenancyId: asTenancyId(row.tenancy_id),
    code: row.code,
    agreementType: row.agreement_type,
    effectiveFrom: dateString(row.effective_from),
    effectiveTo: nullableDate(row.effective_to),
    status: row.status,
    signedAt: nullableDate(row.signed_at),
    version: row.version,
    parties: row.parties.map((party) => ({
      id: asLeaseAgreementPartyId(party.id),
      agreementId: asLeaseAgreementId(party.agreementId),
      partyId: asPartyId(party.partyId),
      role: party.role,
    })),
  };
}

function mapAmendment(row: AmendmentRow): LeaseAmendment {
  return {
    id: asLeaseAmendmentId(row.id),
    agreementId: asLeaseAgreementId(row.agreement_id),
    code: row.code,
    title: row.title,
    description: row.description,
    effectiveFrom: dateString(row.effective_from),
    status: row.status,
    signedAt: nullableDate(row.signed_at),
    version: row.version,
  };
}

function mapTerms(row: TermRow): TenancyTermVersion {
  return {
    id: asTenancyTermVersionId(row.id),
    tenancyId: asTenancyId(row.tenancy_id),
    sourceType: row.source_type,
    sourceAgreementId:
      row.source_agreement_id === null
        ? null
        : asLeaseAgreementId(row.source_agreement_id),
    sourceAmendmentId:
      row.source_amendment_id === null
        ? null
        : asLeaseAmendmentId(row.source_amendment_id),
    effectiveFrom: dateString(row.effective_from),
    currency: asCurrencyCode(row.currency),
    baseRent: asMoneyAmount(moneyString(row.base_rent)),
    serviceCharge: asMoneyAmount(moneyString(row.service_charge)),
    utilitiesAdvance: asMoneyAmount(moneyString(row.utilities_advance)),
    parkingRent: asMoneyAmount(moneyString(row.parking_rent)),
    otherRecurringCharge: asMoneyAmount(moneyString(row.other_recurring_charge)),
    depositRequired: asMoneyAmount(moneyString(row.deposit_required)),
    billingFrequency: row.billing_frequency,
    noticePeriodTenantDays: row.notice_period_tenant_days,
    noticePeriodLandlordDays: row.notice_period_landlord_days,
  };
}

function translateLeaseError(error: unknown): DomainError | null {
  const pg = error as PostgresErrorLike;

  if (pg.code === '23505') {
    switch (pg.constraint_name) {
      case 'lease_agreements_code_uq':
        return new DomainError(
          'LEASE_AGREEMENT_CODE_ALREADY_EXISTS',
          'Lease agreement code already exists.',
        );
      case 'lease_agreement_parties_role_uq':
        return new DomainError(
          'LEASE_AGREEMENT_PARTY_ALREADY_EXISTS',
          'The same party already has this agreement role.',
        );
      case 'lease_amendments_code_uq':
        return new DomainError(
          'LEASE_AMENDMENT_CODE_ALREADY_EXISTS',
          'Lease amendment code already exists.',
        );
      case 'tenancy_term_versions_tenancy_effective_from_uq':
        return new DomainError(
          'TENANCY_TERM_EFFECTIVE_DATE_CONFLICT',
          'Another term version already becomes effective on this date.',
        );
      case 'tenancy_term_versions_agreement_source_uq':
        return new DomainError(
          'LEASE_AGREEMENT_TERMS_ALREADY_EXIST',
          'This agreement already produced its term version.',
        );
      case 'tenancy_term_versions_amendment_source_uq':
        return new DomainError(
          'LEASE_AMENDMENT_TERMS_ALREADY_EXIST',
          'This amendment already produced its term version.',
        );
      default:
        return null;
    }
  }

  if (
    pg.code === '23514' &&
    pg.constraint_name === 'tenancy_term_versions_source_tenancy_match'
  ) {
    return new DomainError(
      'TENANCY_TERM_SOURCE_MISMATCH',
      'Term source does not belong to the same tenancy.',
    );
  }

  return null;
}

async function withTranslatedErrors<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    const translated = translateLeaseError(error);
    if (translated) throw translated;
    throw error;
  }
}

async function insertTerms(
  tx: Sql,
  terms: TenancyTermVersion,
): Promise<void> {
  await tx`
    insert into public.tenancy_term_versions (
      id,
      tenancy_id,
      source_type,
      source_agreement_id,
      source_amendment_id,
      effective_from,
      currency,
      base_rent,
      service_charge,
      utilities_advance,
      parking_rent,
      other_recurring_charge,
      deposit_required,
      billing_frequency,
      notice_period_tenant_days,
      notice_period_landlord_days
    ) values (
      ${terms.id},
      ${terms.tenancyId},
      ${terms.sourceType},
      ${terms.sourceAgreementId},
      ${terms.sourceAmendmentId},
      ${terms.effectiveFrom},
      ${terms.currency},
      ${terms.baseRent},
      ${terms.serviceCharge},
      ${terms.utilitiesAdvance},
      ${terms.parkingRent},
      ${terms.otherRecurringCharge},
      ${terms.depositRequired},
      ${terms.billingFrequency},
      ${terms.noticePeriodTenantDays},
      ${terms.noticePeriodLandlordDays}
    )
  `;
}

export class PostgresLeaseRepository implements LeaseRepository {
  constructor(private readonly sql: Sql) {}

  async getAgreementById(id: LeaseAgreementId): Promise<LeaseAgreement | null> {
    const rows = await this.sql<AgreementRow[]>`
      ${this.sql.unsafe(agreementSelect)}
      where a.id = ${id}
      limit 1
    `;
    return rows.length === 0 ? null : mapAgreement(rows[0]!);
  }

  async listAgreementsByTenancy(
    tenancyId: TenancyId,
  ): Promise<readonly LeaseAgreement[]> {
    const rows = await this.sql<AgreementRow[]>`
      ${this.sql.unsafe(agreementSelect)}
      where a.tenancy_id = ${tenancyId}
      order by a.effective_from, lower(a.code), a.id
    `;
    return rows.map(mapAgreement);
  }

  async agreementCodeExists(code: string): Promise<boolean> {
    const rows = await this.sql<{ exists: boolean }[]>`
      select exists(
        select 1
        from public.lease_agreements
        where lower(code) = lower(${code})
      ) as exists
    `;
    return rows[0]?.exists ?? false;
  }

  async insertAgreement(agreement: LeaseAgreement): Promise<void> {
    await withTranslatedErrors(async () => {
      await this.sql.begin(async (tx) => {
        await tx`
          insert into public.lease_agreements (
            id, tenancy_id, code, agreement_type,
            effective_from, effective_to, status, signed_at, version
          ) values (
            ${agreement.id}, ${agreement.tenancyId}, ${agreement.code},
            ${agreement.agreementType}, ${agreement.effectiveFrom},
            ${agreement.effectiveTo}, ${agreement.status},
            ${agreement.signedAt}, ${agreement.version}
          )
        `;

        for (const party of agreement.parties) {
          await tx`
            insert into public.lease_agreement_parties (
              id, agreement_id, party_id, role
            ) values (
              ${party.id}, ${party.agreementId}, ${party.partyId}, ${party.role}
            )
          `;
        }
      });
    });
  }

  async signAgreement(
    agreement: LeaseAgreement,
    expectedVersion: number,
    terms: TenancyTermVersion,
  ): Promise<void> {
    await withTranslatedErrors(async () => {
      await this.sql.begin(async (tx) => {
        const updated = await tx<{ id: string }[]>`
          update public.lease_agreements
          set
            status = ${agreement.status},
            signed_at = ${agreement.signedAt},
            version = ${agreement.version},
            updated_at = now()
          where id = ${agreement.id}
            and status = 'draft'
            and version = ${expectedVersion}
          returning id
        `;

        if (updated.length === 0) {
          throw new DomainError(
            'LEASE_AGREEMENT_VERSION_CONFLICT',
            'Lease agreement was modified concurrently.',
          );
        }

        await insertTerms(tx as Sql, terms);
      });
    });
  }

  async cancelAgreement(
    agreement: LeaseAgreement,
    expectedVersion: number,
  ): Promise<void> {
    const rows = await this.sql<{ id: string }[]>`
      update public.lease_agreements
      set status = ${agreement.status}, version = ${agreement.version}, updated_at = now()
      where id = ${agreement.id}
        and status = 'draft'
        and version = ${expectedVersion}
      returning id
    `;

    if (rows.length === 0) {
      throw new DomainError(
        'LEASE_AGREEMENT_VERSION_CONFLICT',
        'Lease agreement was modified concurrently.',
      );
    }
  }

  async getAmendmentById(id: LeaseAmendmentId): Promise<LeaseAmendment | null> {
    const rows = await this.sql<AmendmentRow[]>`
      select
        id, agreement_id, code, title, description,
        effective_from, status, signed_at, version
      from public.lease_amendments
      where id = ${id}
      limit 1
    `;
    return rows.length === 0 ? null : mapAmendment(rows[0]!);
  }

  async listAmendmentsByAgreement(
    agreementId: LeaseAgreementId,
  ): Promise<readonly LeaseAmendment[]> {
    const rows = await this.sql<AmendmentRow[]>`
      select
        id, agreement_id, code, title, description,
        effective_from, status, signed_at, version
      from public.lease_amendments
      where agreement_id = ${agreementId}
      order by effective_from, lower(code), id
    `;
    return rows.map(mapAmendment);
  }

  async amendmentCodeExists(code: string): Promise<boolean> {
    const rows = await this.sql<{ exists: boolean }[]>`
      select exists(
        select 1
        from public.lease_amendments
        where lower(code) = lower(${code})
      ) as exists
    `;
    return rows[0]?.exists ?? false;
  }

  async insertAmendment(amendment: LeaseAmendment): Promise<void> {
    await withTranslatedErrors(async () => {
      await this.sql`
        insert into public.lease_amendments (
          id, agreement_id, code, title, description,
          effective_from, status, signed_at, version
        ) values (
          ${amendment.id}, ${amendment.agreementId}, ${amendment.code},
          ${amendment.title}, ${amendment.description},
          ${amendment.effectiveFrom}, ${amendment.status},
          ${amendment.signedAt}, ${amendment.version}
        )
      `;
    });
  }

  async signAmendment(
    amendment: LeaseAmendment,
    expectedVersion: number,
    terms: TenancyTermVersion,
  ): Promise<void> {
    await withTranslatedErrors(async () => {
      await this.sql.begin(async (tx) => {
        const updated = await tx<{ id: string }[]>`
          update public.lease_amendments
          set
            status = ${amendment.status},
            signed_at = ${amendment.signedAt},
            version = ${amendment.version},
            updated_at = now()
          where id = ${amendment.id}
            and status = 'draft'
            and version = ${expectedVersion}
          returning id
        `;

        if (updated.length === 0) {
          throw new DomainError(
            'LEASE_AMENDMENT_VERSION_CONFLICT',
            'Lease amendment was modified concurrently.',
          );
        }

        await insertTerms(tx as Sql, terms);
      });
    });
  }

  async cancelAmendment(
    amendment: LeaseAmendment,
    expectedVersion: number,
  ): Promise<void> {
    const rows = await this.sql<{ id: string }[]>`
      update public.lease_amendments
      set status = ${amendment.status}, version = ${amendment.version}, updated_at = now()
      where id = ${amendment.id}
        and status = 'draft'
        and version = ${expectedVersion}
      returning id
    `;

    if (rows.length === 0) {
      throw new DomainError(
        'LEASE_AMENDMENT_VERSION_CONFLICT',
        'Lease amendment was modified concurrently.',
      );
    }
  }

  async getEffectiveTermsAt(
    tenancyId: TenancyId,
    effectiveAt: DateOnly,
  ): Promise<TenancyTermVersion | null> {
    const rows = await this.sql<TermRow[]>`
      select
        id,
        tenancy_id,
        source_type,
        source_agreement_id,
        source_amendment_id,
        effective_from,
        currency,
        base_rent,
        service_charge,
        utilities_advance,
        parking_rent,
        other_recurring_charge,
        deposit_required,
        billing_frequency,
        notice_period_tenant_days,
        notice_period_landlord_days
      from public.tenancy_term_versions
      where tenancy_id = ${tenancyId}
        and effective_from <= ${effectiveAt}
      order by effective_from desc, created_at desc
      limit 1
    `;

    return rows.length === 0 ? null : mapTerms(rows[0]!);
  }
}
