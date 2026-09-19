import { describe, expect, it } from 'vitest';
import {
  type Actor,
  type AgreementSupersession,
  type IdGenerator,
  type LeaseRepository,
  type OwnershipRepository,
  type PartyRepository,
  type PortfolioRepository,
  type TenancyRepository,
  type UserAccessRepository,
  type VerifiedIdentity,
} from '@portfolio/application';
import {
  asDateOnly,
  asLeaseAgreementId,
  asLeaseAmendmentId,
  asPartyId,
  asTenancyId,
  asTenancyPartyId,
  asUnitId,
  asUserId,
  type DateOnly,
  type LeaseAgreement,
  type LeaseAgreementId,
  type LeaseAmendment,
  type LeaseAmendmentId,
  type OwnershipPeriod,
  type Party,
  type PartyId,
  type Property,
  type PropertyId,
  type Space,
  type SpaceId,
  type Tenancy,
  type TenancyId,
  type TenancyParty,
  type TenancyTermVersion,
  type Unit,
  type UnitId,
} from '@portfolio/domain';
import { createPortfolioHttpHandler } from '../src/index.js';
import { InMemoryAssetInventoryRepository, InMemoryAssetRepository, InMemoryAssetServiceRepository } from './asset-test-deps.js';
import {
  FixedClock,
  InMemoryDocumentRepository,
  MemoryFileStorage,
} from './document-test-deps.js';
import {
  InMemoryInspectionRepository,
  InMemoryStaffDirectoryRepository,
} from './inspection-test-deps.js';
import { InMemoryImprovementRepository } from './improvement-test-deps.js';

const adminIdentity: VerifiedIdentity = {
  provider: 'supabase',
  subject: 'admin-subject',
};

const inspectorIdentity: VerifiedIdentity = {
  provider: 'supabase',
  subject: 'inspector-subject',
};

class FixedIds implements IdGenerator {
  private index = 0;

  constructor(private readonly values: readonly string[]) {}

  next(): string {
    const value = this.values[this.index++];
    if (!value) throw new Error('No test ID configured.');
    return value;
  }
}

class InMemoryAccessRepository implements UserAccessRepository {
  async findActorByIdentity(identity: VerifiedIdentity): Promise<Actor | null> {
    if (identity.subject === 'admin-subject') {
      return {
        userId: asUserId('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
        role: 'admin',
      };
    }

    if (identity.subject === 'inspector-subject') {
      return {
        userId: asUserId('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
        role: 'inspector',
      };
    }

    return null;
  }
}

class EmptyPortfolioRepository implements PortfolioRepository {
  async getPropertyById(_id: PropertyId): Promise<Property | null> { return null; }
  async getUnitById(_id: UnitId): Promise<Unit | null> { return null; }
  async getSpaceById(_id: SpaceId): Promise<Space | null> { return null; }
  async listProperties(): Promise<readonly Property[]> { return []; }
  async listUnitsByProperty(_propertyId: PropertyId): Promise<readonly Unit[]> { return []; }
  async listSpacesByUnit(_unitId: UnitId): Promise<readonly Space[]> { return []; }
  async propertyCodeExists(_code: string): Promise<boolean> { return false; }
  async unitCodeExists(_code: string): Promise<boolean> { return false; }
  async unitNumberExists(_propertyId: PropertyId, _unitNumber: string): Promise<boolean> { return false; }
  async spaceCodeExists(_unitId: UnitId, _code: string): Promise<boolean> { return false; }
  async insertProperty(_property: Property): Promise<void> {}
  async insertUnit(_unit: Unit): Promise<void> {}
  async insertSpace(_space: Space): Promise<void> {}
}

class EmptyOwnershipRepository implements OwnershipRepository {
  async listByUnit(_unitId: UnitId): Promise<readonly OwnershipPeriod[]> { return []; }
  async overlaps(
    _unitId: UnitId,
    _validFrom: DateOnly,
    _validTo: DateOnly | null,
  ): Promise<boolean> { return false; }
  async insert(_period: OwnershipPeriod): Promise<void> {}
}

class InMemoryPartyRepository implements PartyRepository {
  readonly parties = new Map<PartyId, Party>();

  async getById(id: PartyId): Promise<Party | null> {
    return this.parties.get(id) ?? null;
  }

  async getByIds(ids: readonly PartyId[]): Promise<readonly Party[]> {
    return ids.flatMap((id) => {
      const party = this.parties.get(id);
      return party ? [party] : [];
    });
  }

  async list(): Promise<readonly Party[]> {
    return [...this.parties.values()];
  }

  async codeExists(code: string): Promise<boolean> {
    return [...this.parties.values()].some(
      (party) => party.code.toLowerCase() === code.toLowerCase(),
    );
  }

  async insert(party: Party): Promise<void> {
    this.parties.set(party.id, party);
  }
}

class InMemoryTenancyRepository implements TenancyRepository {
  readonly tenancies = new Map<TenancyId, Tenancy>();

  async getById(id: TenancyId): Promise<Tenancy | null> {
    return this.tenancies.get(id) ?? null;
  }

  async listByUnit(unitId: UnitId): Promise<readonly Tenancy[]> {
    return [...this.tenancies.values()].filter((tenancy) => tenancy.unitId === unitId);
  }

  async codeExists(code: string): Promise<boolean> {
    return [...this.tenancies.values()].some(
      (tenancy) => tenancy.code.toLowerCase() === code.toLowerCase(),
    );
  }

  async hasPlannedReservationOverlap(): Promise<boolean> { return false; }
  async hasActualOccupancyOverlap(): Promise<boolean> { return false; }
  async insert(tenancy: Tenancy): Promise<void> { this.tenancies.set(tenancy.id, tenancy); }

  async insertParty(
    tenancyParty: TenancyParty,
    expectedTenancyVersion: number,
    newTenancyVersion: number,
  ): Promise<void> {
    const current = this.tenancies.get(tenancyParty.tenancyId);
    if (!current || current.version !== expectedTenancyVersion) {
      throw Object.assign(new Error('version conflict'), {
        code: 'TENANCY_VERSION_CONFLICT',
      });
    }

    this.tenancies.set(current.id, {
      ...current,
      version: newTenancyVersion,
      parties: [...current.parties, tenancyParty],
    });
  }

  async updateLifecycle(tenancy: Tenancy, expectedVersion: number): Promise<void> {
    const current = this.tenancies.get(tenancy.id);
    if (!current || current.version !== expectedVersion) {
      throw Object.assign(new Error('version conflict'), {
        code: 'TENANCY_VERSION_CONFLICT',
      });
    }
    this.tenancies.set(tenancy.id, tenancy);
  }
}

class InMemoryLeaseRepository implements LeaseRepository {
  readonly agreements = new Map<LeaseAgreementId, LeaseAgreement>();
  readonly amendments = new Map<LeaseAmendmentId, LeaseAmendment>();
  readonly terms: TenancyTermVersion[] = [];

  async getAgreementById(id: LeaseAgreementId): Promise<LeaseAgreement | null> {
    return this.agreements.get(id) ?? null;
  }

  async listAgreementsByTenancy(tenancyId: TenancyId): Promise<readonly LeaseAgreement[]> {
    return [...this.agreements.values()].filter(
      (agreement) => agreement.tenancyId === tenancyId,
    );
  }

  async agreementCodeExists(code: string): Promise<boolean> {
    return [...this.agreements.values()].some(
      (agreement) => agreement.code.toLowerCase() === code.toLowerCase(),
    );
  }

  async successorExists(predecessorAgreementId: LeaseAgreementId): Promise<boolean> {
    return [...this.agreements.values()].some(
      (agreement) =>
        agreement.predecessorAgreementId === predecessorAgreementId &&
        agreement.status !== 'cancelled',
    );
  }

  async insertAgreement(agreement: LeaseAgreement): Promise<void> {
    this.agreements.set(agreement.id, agreement);
  }

  async signAgreement(
    agreement: LeaseAgreement,
    expectedVersion: number,
    terms: TenancyTermVersion,
    predecessorToSupersede?: AgreementSupersession,
  ): Promise<void> {
    const current = this.agreements.get(agreement.id);
    if (!current || current.version !== expectedVersion) {
      throw Object.assign(new Error('version conflict'), {
        code: 'LEASE_AGREEMENT_VERSION_CONFLICT',
      });
    }

    if (
      this.terms.some(
        (existing) =>
          existing.tenancyId === terms.tenancyId &&
          existing.effectiveFrom === terms.effectiveFrom,
      )
    ) {
      throw Object.assign(new Error('term date conflict'), {
        code: 'TENANCY_TERM_EFFECTIVE_DATE_CONFLICT',
      });
    }

    if (predecessorToSupersede) {
      const persistedPredecessor = this.agreements.get(
        predecessorToSupersede.agreement.id,
      );
      if (
        !persistedPredecessor ||
        persistedPredecessor.status !== 'signed' ||
        persistedPredecessor.version !== predecessorToSupersede.expectedVersion
      ) {
        throw Object.assign(new Error('predecessor conflict'), {
          code: 'LEASE_AGREEMENT_PREDECESSOR_VERSION_CONFLICT',
        });
      }
    }

    if (predecessorToSupersede) {
      this.agreements.set(
        predecessorToSupersede.agreement.id,
        predecessorToSupersede.agreement,
      );
    }
    this.agreements.set(agreement.id, agreement);
    this.terms.push(terms);
  }

  async cancelAgreement(
    agreement: LeaseAgreement,
    expectedVersion: number,
  ): Promise<void> {
    const current = this.agreements.get(agreement.id);
    if (!current || current.version !== expectedVersion) {
      throw Object.assign(new Error('version conflict'), {
        code: 'LEASE_AGREEMENT_VERSION_CONFLICT',
      });
    }
    this.agreements.set(agreement.id, agreement);
  }

  async getAmendmentById(id: LeaseAmendmentId): Promise<LeaseAmendment | null> {
    return this.amendments.get(id) ?? null;
  }

  async listAmendmentsByAgreement(
    agreementId: LeaseAgreementId,
  ): Promise<readonly LeaseAmendment[]> {
    return [...this.amendments.values()].filter(
      (amendment) => amendment.agreementId === agreementId,
    );
  }

  async amendmentCodeExists(code: string): Promise<boolean> {
    return [...this.amendments.values()].some(
      (amendment) => amendment.code.toLowerCase() === code.toLowerCase(),
    );
  }

  async insertAmendment(amendment: LeaseAmendment): Promise<void> {
    this.amendments.set(amendment.id, amendment);
  }

  async signAmendment(
    amendment: LeaseAmendment,
    expectedVersion: number,
    terms: TenancyTermVersion,
  ): Promise<void> {
    const current = this.amendments.get(amendment.id);
    if (!current || current.version !== expectedVersion) {
      throw Object.assign(new Error('version conflict'), {
        code: 'LEASE_AMENDMENT_VERSION_CONFLICT',
      });
    }
    this.amendments.set(amendment.id, amendment);
    this.terms.push(terms);
  }

  async cancelAmendment(
    amendment: LeaseAmendment,
    expectedVersion: number,
  ): Promise<void> {
    const current = this.amendments.get(amendment.id);
    if (!current || current.version !== expectedVersion) {
      throw Object.assign(new Error('version conflict'), {
        code: 'LEASE_AMENDMENT_VERSION_CONFLICT',
      });
    }
    this.amendments.set(amendment.id, amendment);
  }

  async getEffectiveTermsAt(
    tenancyId: TenancyId,
    effectiveAt: DateOnly,
  ): Promise<TenancyTermVersion | null> {
    return (
      this.terms
        .filter((terms) => {
          if (
            terms.tenancyId !== tenancyId ||
            terms.effectiveFrom > effectiveAt
          ) {
            return false;
          }

          const agreementId =
            terms.sourceType === 'agreement'
              ? terms.sourceAgreementId
              : this.amendments.get(terms.sourceAmendmentId!)?.agreementId ?? null;
          if (agreementId === null) return false;

          const governing = this.agreements.get(agreementId);
          if (!governing) return false;
          if (governing.effectiveFrom > effectiveAt) return false;
          if (
            governing.effectiveTo !== null &&
            governing.effectiveTo < effectiveAt
          ) {
            return false;
          }

          const signedSuccessor = [...this.agreements.values()].find(
            (candidate) =>
              candidate.predecessorAgreementId === governing.id &&
              ['signed', 'superseded', 'terminated'].includes(candidate.status),
          );

          return (
            signedSuccessor === undefined ||
            effectiveAt < signedSuccessor.effectiveFrom
          );
        })
        .sort((left, right) =>
          right.effectiveFrom.localeCompare(left.effectiveFrom),
        )[0] ?? null
    );
  }
}

const TENANCY_ID = asTenancyId('10000000-0000-4000-8000-000000000001');
const UNIT_ID = asUnitId('10000000-0000-4000-8000-000000000002');
const TENANT_ID = asPartyId('10000000-0000-4000-8000-000000000003');
const LANDLORD_ID = asPartyId('10000000-0000-4000-8000-000000000004');
const OTHER_ID = asPartyId('10000000-0000-4000-8000-000000000005');

function person(id: PartyId, code: string, firstName: string): Party {
  return {
    id,
    code,
    partyType: 'person',
    displayName: `${firstName} Test`,
    firstName,
    middleName: null,
    lastName: 'Test',
    status: 'active',
    contactPoints: [],
    addresses: [],
  };
}

function buildHandler() {
  const partyRepository = new InMemoryPartyRepository();
  partyRepository.parties.set(TENANT_ID, person(TENANT_ID, 'PTY-TENANT', 'Tenant'));
  partyRepository.parties.set(LANDLORD_ID, person(LANDLORD_ID, 'PTY-LANDLORD', 'Landlord'));
  partyRepository.parties.set(OTHER_ID, person(OTHER_ID, 'PTY-OTHER', 'Other'));

  const tenancyRepository = new InMemoryTenancyRepository();
  tenancyRepository.tenancies.set(TENANCY_ID, {
    id: TENANCY_ID,
    code: 'TEN-0001',
    unitId: UNIT_ID,
    status: 'planned',
    plannedStart: asDateOnly('2026-10-01'),
    plannedEnd: asDateOnly('2027-09-30'),
    actualStart: null,
    actualEnd: null,
    noticeGivenAt: null,
    terminationEffectiveAt: null,
    version: 2,
    parties: [
      {
        id: asTenancyPartyId('10000000-0000-4000-8000-000000000006'),
        tenancyId: TENANCY_ID,
        partyId: TENANT_ID,
        role: 'tenant',
        isPrimary: true,
      },
    ],
  });

  const leaseRepository = new InMemoryLeaseRepository();

  const handler = createPortfolioHttpHandler({
    assetRepository: new InMemoryAssetRepository(),
    assetInventoryRepository: new InMemoryAssetInventoryRepository(),
    assetServiceRepository: new InMemoryAssetServiceRepository(),
    improvementRepository: new InMemoryImprovementRepository(),
    portfolioRepository: new EmptyPortfolioRepository(),
    partyRepository,
    ownershipRepository: new EmptyOwnershipRepository(),
    tenancyRepository,
    leaseRepository,
    documentRepository: new InMemoryDocumentRepository(),
    inspectionRepository: new InMemoryInspectionRepository(),
    staffDirectoryRepository: new InMemoryStaffDirectoryRepository(),
    fileStorage: new MemoryFileStorage(),
    clock: new FixedClock(),
    userAccessRepository: new InMemoryAccessRepository(),
    idGenerator: new FixedIds([
      '20000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000002',
      '20000000-0000-4000-8000-000000000003',
      '20000000-0000-4000-8000-000000000004',
      '20000000-0000-4000-8000-000000000005',
      '20000000-0000-4000-8000-000000000006',
      '20000000-0000-4000-8000-000000000007',
      '20000000-0000-4000-8000-000000000008',
      '20000000-0000-4000-8000-000000000009',
      '20000000-0000-4000-8000-000000000010',
      '20000000-0000-4000-8000-000000000011',
      '20000000-0000-4000-8000-000000000012',
    ]),
  });

  return { handler, leaseRepository };
}

describe('Lease HTTP lifecycle', () => {
  it('preserves exact historical terms through agreement and amendment snapshots', async () => {
    const { handler } = buildHandler();

    const created = await handler(
      new Request(`https://portfolio.test/tenancies/${TENANCY_ID}/agreements`, {
        method: 'POST',
        body: JSON.stringify({
          code: 'AGR-0001',
          agreementType: 'initial',
          effectiveFrom: '2026-10-01',
          effectiveTo: '2027-09-30',
          parties: [
            { partyId: LANDLORD_ID, role: 'landlord' },
            { partyId: TENANT_ID, role: 'tenant' },
          ],
        }),
      }),
      adminIdentity,
    );

    expect(created.status).toBe(201);
    const agreement = (await created.json()).data as { id: string; version: number };
    expect(agreement.version).toBe(1);

    const signed = await handler(
      new Request(`https://portfolio.test/agreements/${agreement.id}/sign`, {
        method: 'POST',
        body: JSON.stringify({
          expectedVersion: 1,
          signedAt: '2026-09-20',
          terms: {
            currency: 'EUR',
            baseRent: '850.50',
            serviceCharge: '120',
            depositRequired: '1700',
            noticePeriodTenantDays: 90,
            noticePeriodLandlordDays: 90,
          },
        }),
      }),
      adminIdentity,
    );

    expect(signed.status).toBe(200);
    expect(await signed.json()).toMatchObject({
      data: { status: 'signed', version: 2 },
    });

    const initialTerms = await handler(
      new Request(
        `https://portfolio.test/tenancies/${TENANCY_ID}/terms?at=2027-03-31`,
      ),
      adminIdentity,
    );
    expect(initialTerms.status).toBe(200);
    expect(await initialTerms.json()).toMatchObject({
      data: {
        effectiveFrom: '2026-10-01',
        baseRent: '850.50',
        serviceCharge: '120.00',
        depositRequired: '1700.00',
      },
    });

    const amendmentCreated = await handler(
      new Request(
        `https://portfolio.test/agreements/${agreement.id}/amendments`,
        {
          method: 'POST',
          body: JSON.stringify({
            code: 'AMD-0001',
            title: 'Rent adjustment',
            effectiveFrom: '2027-04-01',
          }),
        },
      ),
      adminIdentity,
    );

    expect(amendmentCreated.status).toBe(201);
    const amendment = (await amendmentCreated.json()).data as {
      id: string;
      version: number;
    };

    const amendmentSigned = await handler(
      new Request(
        `https://portfolio.test/amendments/${amendment.id}/sign`,
        {
          method: 'POST',
          body: JSON.stringify({
            expectedVersion: 1,
            signedAt: '2027-03-15',
            terms: {
              currency: 'EUR',
              baseRent: '900.00',
              serviceCharge: '120.00',
              depositRequired: '1700.00',
              noticePeriodTenantDays: 90,
              noticePeriodLandlordDays: 90,
            },
          }),
        },
      ),
      adminIdentity,
    );

    expect(amendmentSigned.status).toBe(200);

    const before = await handler(
      new Request(
        `https://portfolio.test/tenancies/${TENANCY_ID}/terms?at=2027-03-31`,
      ),
      adminIdentity,
    );
    expect(await before.json()).toMatchObject({
      data: { baseRent: '850.50' },
    });

    const after = await handler(
      new Request(
        `https://portfolio.test/tenancies/${TENANCY_ID}/terms?at=2027-04-01`,
      ),
      adminIdentity,
    );
    expect(await after.json()).toMatchObject({
      data: {
        sourceType: 'amendment',
        effectiveFrom: '2027-04-01',
        baseRent: '900.00',
      },
    });
  });

  it('does not return expired agreement terms and atomically supersedes through replacement', async () => {
    const { handler, leaseRepository } = buildHandler();

    const initialResponse = await handler(
      new Request(`https://portfolio.test/tenancies/${TENANCY_ID}/agreements`, {
        method: 'POST',
        body: JSON.stringify({
          code: 'AGR-CHAIN-1',
          agreementType: 'initial',
          effectiveFrom: '2026-10-01',
          effectiveTo: '2027-09-30',
          parties: [
            { partyId: LANDLORD_ID, role: 'landlord' },
            { partyId: TENANT_ID, role: 'tenant' },
          ],
        }),
      }),
      adminIdentity,
    );
    const initial = (await initialResponse.json()).data as {
      id: string;
      version: number;
    };

    await handler(
      new Request(`https://portfolio.test/agreements/${initial.id}/sign`, {
        method: 'POST',
        body: JSON.stringify({
          expectedVersion: 1,
          signedAt: '2026-09-20',
          terms: { currency: 'EUR', baseRent: '850' },
        }),
      }),
      adminIdentity,
    );

    const expired = await handler(
      new Request(
        `https://portfolio.test/tenancies/${TENANCY_ID}/terms?at=2030-01-01`,
      ),
      adminIdentity,
    );
    expect(expired.status).toBe(404);
    expect(await expired.json()).toMatchObject({
      error: { code: 'TENANCY_TERMS_NOT_FOUND' },
    });

    const replacementResponse = await handler(
      new Request(`https://portfolio.test/tenancies/${TENANCY_ID}/agreements`, {
        method: 'POST',
        body: JSON.stringify({
          code: 'AGR-CHAIN-2',
          agreementType: 'replacement',
          predecessorAgreementId: initial.id,
          effectiveFrom: '2027-04-01',
          effectiveTo: '2028-03-31',
          parties: [
            { partyId: LANDLORD_ID, role: 'landlord' },
            { partyId: TENANT_ID, role: 'tenant' },
          ],
        }),
      }),
      adminIdentity,
    );
    expect(replacementResponse.status).toBe(201);
    const replacement = (await replacementResponse.json()).data as {
      id: string;
    };

    const signedReplacement = await handler(
      new Request(`https://portfolio.test/agreements/${replacement.id}/sign`, {
        method: 'POST',
        body: JSON.stringify({
          expectedVersion: 1,
          signedAt: '2027-03-20',
          terms: { currency: 'EUR', baseRent: '925' },
        }),
      }),
      adminIdentity,
    );
    expect(signedReplacement.status).toBe(200);

    expect(
      leaseRepository.agreements.get(asLeaseAgreementId(initial.id))?.status,
    ).toBe('superseded');

    const before = await handler(
      new Request(
        `https://portfolio.test/tenancies/${TENANCY_ID}/terms?at=2027-03-31`,
      ),
      adminIdentity,
    );
    expect(await before.json()).toMatchObject({
      data: { baseRent: '850.00' },
    });

    const after = await handler(
      new Request(
        `https://portfolio.test/tenancies/${TENANCY_ID}/terms?at=2027-04-01`,
      ),
      adminIdentity,
    );
    expect(await after.json()).toMatchObject({
      data: { baseRent: '925.00' },
    });
  });

  it('rejects replacement transport without an explicit predecessor', async () => {
    const { handler } = buildHandler();

    const response = await handler(
      new Request(`https://portfolio.test/tenancies/${TENANCY_ID}/agreements`, {
        method: 'POST',
        body: JSON.stringify({
          code: 'AGR-NO-PREDECESSOR',
          agreementType: 'replacement',
          effectiveFrom: '2027-04-01',
          parties: [
            { partyId: LANDLORD_ID, role: 'landlord' },
            { partyId: TENANT_ID, role: 'tenant' },
          ],
        }),
      }),
      adminIdentity,
    );

    expect(response.status).toBe(400);
  });

  it('rejects a legal tenant role that does not match TenancyParty', async () => {
    const { handler } = buildHandler();

    const response = await handler(
      new Request(`https://portfolio.test/tenancies/${TENANCY_ID}/agreements`, {
        method: 'POST',
        body: JSON.stringify({
          code: 'AGR-MISMATCH',
          agreementType: 'initial',
          effectiveFrom: '2026-10-01',
          parties: [
            { partyId: LANDLORD_ID, role: 'landlord' },
            { partyId: OTHER_ID, role: 'tenant' },
          ],
        }),
      }),
      adminIdentity,
    );

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      error: { code: 'LEASE_AGREEMENT_TENANCY_PARTY_MISMATCH' },
    });
  });

  it('keeps inspector contract access read-only', async () => {
    const { handler } = buildHandler();

    const read = await handler(
      new Request(`https://portfolio.test/tenancies/${TENANCY_ID}/agreements`),
      inspectorIdentity,
    );
    expect(read.status).toBe(200);

    const write = await handler(
      new Request(`https://portfolio.test/tenancies/${TENANCY_ID}/agreements`, {
        method: 'POST',
        body: JSON.stringify({
          code: 'AGR-NOPE',
          agreementType: 'initial',
          effectiveFrom: '2026-10-01',
          parties: [
            { partyId: LANDLORD_ID, role: 'landlord' },
            { partyId: TENANT_ID, role: 'tenant' },
          ],
        }),
      }),
      inspectorIdentity,
    );

    expect(write.status).toBe(403);
  });

  it('returns 409 when a stale agreement version attempts to sign', async () => {
    const { handler, leaseRepository } = buildHandler();

    const created = await handler(
      new Request(`https://portfolio.test/tenancies/${TENANCY_ID}/agreements`, {
        method: 'POST',
        body: JSON.stringify({
          code: 'AGR-STALE',
          agreementType: 'initial',
          effectiveFrom: '2026-10-01',
          parties: [
            { partyId: LANDLORD_ID, role: 'landlord' },
            { partyId: TENANT_ID, role: 'tenant' },
          ],
        }),
      }),
      adminIdentity,
    );

    const agreement = (await created.json()).data as { id: string };
    const persisted = leaseRepository.agreements.get(
      asLeaseAgreementId(agreement.id),
    )!;
    leaseRepository.agreements.set(persisted.id, {
      ...persisted,
      version: 2,
    });

    const response = await handler(
      new Request(`https://portfolio.test/agreements/${agreement.id}/sign`, {
        method: 'POST',
        body: JSON.stringify({
          expectedVersion: 1,
          signedAt: '2026-09-20',
          terms: {
            currency: 'EUR',
            baseRent: '850',
          },
        }),
      }),
      adminIdentity,
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: { code: 'LEASE_AGREEMENT_VERSION_CONFLICT' },
    });
  });
});
