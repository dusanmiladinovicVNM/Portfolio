import {
  DomainError,
  activateTenancy,
  addTenancyParty,
  asTenancyId,
  asTenancyPartyId,
  cancelTenancy,
  createTenancy,
  endTenancy,
  giveTenancyNotice,
  markTenancyMoveOutPending,
  planTenancy,
  type PartyId,
  type Tenancy,
  type TenancyId,
  type TenancyPartyRole,
  type UnitId,
} from '@portfolio/domain';
import { requireCapability, type Actor } from '../security/access.js';
import type { IdGenerator } from '../shared/id-generator.js';
import type { PartyRepository } from '../parties/party-repository.js';
import type { PortfolioRepository } from '../portfolio/portfolio-repository.js';
import type { TenancyRepository } from './tenancy-repository.js';

export interface TenancyPartyCommandInput {
  partyId: PartyId;
  role: TenancyPartyRole;
  isPrimary?: boolean;
}

export interface CreateTenancyCommandInput {
  unitId: UnitId;
  code: string;
  parties?: readonly TenancyPartyCommandInput[];
}

export interface TenancyDependencies {
  tenancyRepository: TenancyRepository;
  portfolioRepository: PortfolioRepository;
  partyRepository: PartyRepository;
  idGenerator: IdGenerator;
}

async function requireTenancy(
  repository: TenancyRepository,
  id: TenancyId,
): Promise<Tenancy> {
  const tenancy = await repository.getById(id);
  if (!tenancy) throw new DomainError('TENANCY_NOT_FOUND', 'Tenancy not found.');
  return tenancy;
}

function assertExpectedVersion(tenancy: Tenancy, expectedVersion: number): void {
  if (tenancy.version !== expectedVersion) {
    throw new DomainError(
      'TENANCY_VERSION_CONFLICT',
      'Tenancy has changed since the caller last read it.',
    );
  }
}

async function requireActiveParties(
  partyRepository: PartyRepository,
  partyIds: readonly PartyId[],
): Promise<void> {
  const uniqueIds = [...new Set(partyIds)];
  const parties = await partyRepository.getByIds(uniqueIds);

  if (parties.length !== uniqueIds.length) {
    throw new DomainError('PARTY_NOT_FOUND', 'One or more tenancy parties do not exist.');
  }

  if (parties.some((party) => party.status !== 'active')) {
    throw new DomainError(
      'TENANCY_INACTIVE_PARTY',
      'Inactive or archived parties cannot be assigned to a tenancy.',
    );
  }
}

export async function createTenancyCommand(
  deps: TenancyDependencies,
  actor: Actor,
  input: CreateTenancyCommandInput,
): Promise<Tenancy> {
  requireCapability(actor, 'tenancy:write');

  if (!(await deps.portfolioRepository.getUnitById(input.unitId))) {
    throw new DomainError('UNIT_NOT_FOUND', 'Unit not found.');
  }

  await requireActiveParties(
    deps.partyRepository,
    (input.parties ?? []).map((party) => party.partyId),
  );

  const tenancy = createTenancy({
    id: asTenancyId(deps.idGenerator.next()),
    code: input.code,
    unitId: input.unitId,
    parties: (input.parties ?? []).map((party) => ({
      id: asTenancyPartyId(deps.idGenerator.next()),
      partyId: party.partyId,
      role: party.role,
      ...(party.isPrimary !== undefined ? { isPrimary: party.isPrimary } : {}),
    })),
  });

  if (await deps.tenancyRepository.codeExists(tenancy.code)) {
    throw new DomainError(
      'TENANCY_CODE_ALREADY_EXISTS',
      `Tenancy code '${tenancy.code}' already exists.`,
    );
  }

  await deps.tenancyRepository.insert(tenancy);
  return tenancy;
}

export async function addTenancyPartyCommand(
  deps: Pick<TenancyDependencies, 'tenancyRepository' | 'partyRepository' | 'idGenerator'>,
  actor: Actor,
  tenancyId: TenancyId,
  expectedVersion: number,
  input: TenancyPartyCommandInput,
): Promise<Tenancy> {
  requireCapability(actor, 'tenancy:write');

  const tenancy = await requireTenancy(deps.tenancyRepository, tenancyId);
  assertExpectedVersion(tenancy, expectedVersion);
  await requireActiveParties(deps.partyRepository, [input.partyId]);

  const updated = addTenancyParty(tenancy, {
    id: asTenancyPartyId(deps.idGenerator.next()),
    partyId: input.partyId,
    role: input.role,
    ...(input.isPrimary !== undefined ? { isPrimary: input.isPrimary } : {}),
  });

  const added = updated.parties.find(
    (party) => !tenancy.parties.some((existing) => existing.id === party.id),
  );
  if (!added) {
    throw new DomainError('TENANCY_INVALID_STATE', 'No tenancy party was added.');
  }

  await deps.tenancyRepository.insertParty(
    added,
    tenancy.version,
    updated.version,
  );
  return updated;
}

export async function planTenancyCommand(
  deps: Pick<TenancyDependencies, 'tenancyRepository'>,
  actor: Actor,
  tenancyId: TenancyId,
  expectedVersion: number,
  plannedStart: string,
  plannedEnd?: string | null,
): Promise<Tenancy> {
  requireCapability(actor, 'tenancy:write');
  const tenancy = await requireTenancy(deps.tenancyRepository, tenancyId);
  assertExpectedVersion(tenancy, expectedVersion);

  const updated = planTenancy(tenancy, plannedStart, plannedEnd);

  if (
    await deps.tenancyRepository.hasPlannedReservationOverlap(
      updated.unitId,
      updated.plannedStart!,
      updated.plannedEnd,
      updated.id,
    )
  ) {
    throw new DomainError(
      'TENANCY_PLANNED_RESERVATION_OVERLAP',
      'The planned tenancy period overlaps another planned tenancy for this unit.',
    );
  }

  if (
    await deps.tenancyRepository.hasActualOccupancyOverlap(
      updated.unitId,
      updated.plannedStart!,
      updated.plannedEnd,
      updated.id,
    )
  ) {
    throw new DomainError(
      'TENANCY_PLANNED_OCCUPANCY_CONFLICT',
      'The planned tenancy period overlaps known actual occupancy for this unit.',
    );
  }

  await deps.tenancyRepository.updateLifecycle(updated, tenancy.version);
  return updated;
}

export async function activateTenancyCommand(
  deps: Pick<TenancyDependencies, 'tenancyRepository'>,
  actor: Actor,
  tenancyId: TenancyId,
  expectedVersion: number,
  actualStart: string,
): Promise<Tenancy> {
  requireCapability(actor, 'tenancy:write');
  const tenancy = await requireTenancy(deps.tenancyRepository, tenancyId);
  assertExpectedVersion(tenancy, expectedVersion);

  const updated = activateTenancy(tenancy, actualStart);

  if (
    await deps.tenancyRepository.hasActualOccupancyOverlap(
      updated.unitId,
      updated.actualStart!,
      null,
      updated.id,
    )
  ) {
    throw new DomainError(
      'TENANCY_ACTUAL_OCCUPANCY_OVERLAP',
      'The actual tenancy period overlaps another actual occupancy for this unit.',
    );
  }

  await deps.tenancyRepository.updateLifecycle(updated, tenancy.version);
  return updated;
}

export async function giveTenancyNoticeCommand(
  deps: Pick<TenancyDependencies, 'tenancyRepository'>,
  actor: Actor,
  tenancyId: TenancyId,
  expectedVersion: number,
  noticeGivenAt: string,
  terminationEffectiveAt: string,
): Promise<Tenancy> {
  requireCapability(actor, 'tenancy:write');
  const tenancy = await requireTenancy(deps.tenancyRepository, tenancyId);
  assertExpectedVersion(tenancy, expectedVersion);

  const updated = giveTenancyNotice(
    tenancy,
    noticeGivenAt,
    terminationEffectiveAt,
  );

  await deps.tenancyRepository.updateLifecycle(updated, tenancy.version);
  return updated;
}

export async function markTenancyMoveOutPendingCommand(
  deps: Pick<TenancyDependencies, 'tenancyRepository'>,
  actor: Actor,
  tenancyId: TenancyId,
  expectedVersion: number,
): Promise<Tenancy> {
  requireCapability(actor, 'tenancy:write');
  const tenancy = await requireTenancy(deps.tenancyRepository, tenancyId);
  assertExpectedVersion(tenancy, expectedVersion);

  const updated = markTenancyMoveOutPending(tenancy);
  await deps.tenancyRepository.updateLifecycle(updated, tenancy.version);
  return updated;
}

export async function endTenancyCommand(
  deps: Pick<TenancyDependencies, 'tenancyRepository'>,
  actor: Actor,
  tenancyId: TenancyId,
  expectedVersion: number,
  actualEnd: string,
): Promise<Tenancy> {
  requireCapability(actor, 'tenancy:write');
  const tenancy = await requireTenancy(deps.tenancyRepository, tenancyId);
  assertExpectedVersion(tenancy, expectedVersion);

  const updated = endTenancy(tenancy, actualEnd);

  if (
    await deps.tenancyRepository.hasActualOccupancyOverlap(
      updated.unitId,
      updated.actualStart!,
      updated.actualEnd,
      updated.id,
    )
  ) {
    throw new DomainError(
      'TENANCY_ACTUAL_OCCUPANCY_OVERLAP',
      'The final tenancy period overlaps another actual occupancy for this unit.',
    );
  }

  await deps.tenancyRepository.updateLifecycle(updated, tenancy.version);
  return updated;
}

export async function cancelTenancyCommand(
  deps: Pick<TenancyDependencies, 'tenancyRepository'>,
  actor: Actor,
  tenancyId: TenancyId,
  expectedVersion: number,
): Promise<Tenancy> {
  requireCapability(actor, 'tenancy:write');
  const tenancy = await requireTenancy(deps.tenancyRepository, tenancyId);
  assertExpectedVersion(tenancy, expectedVersion);

  const updated = cancelTenancy(tenancy);
  await deps.tenancyRepository.updateLifecycle(updated, tenancy.version);
  return updated;
}
