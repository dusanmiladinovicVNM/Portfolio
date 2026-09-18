import { asDateOnly, type DateOnly } from '../shared/date-only.js';
import { DomainError } from '../shared/domain-error.js';
import type {
  PartyId,
  TenancyId,
  TenancyPartyId,
  UnitId,
} from '../shared/entity-id.js';

export const TENANCY_STATUSES = [
  'draft',
  'planned',
  'active',
  'notice_given',
  'move_out_pending',
  'ended',
  'cancelled',
] as const;

export const TENANCY_PARTY_ROLES = [
  'tenant',
  'co_tenant',
  'guarantor',
  'authorized_occupant',
] as const;

export type TenancyStatus = (typeof TENANCY_STATUSES)[number];
export type TenancyPartyRole = (typeof TENANCY_PARTY_ROLES)[number];

export interface TenancyParty {
  readonly id: TenancyPartyId;
  readonly tenancyId: TenancyId;
  readonly partyId: PartyId;
  readonly role: TenancyPartyRole;
  readonly isPrimary: boolean;
}

export interface Tenancy {
  readonly id: TenancyId;
  readonly code: string;
  readonly unitId: UnitId;
  readonly status: TenancyStatus;
  readonly plannedStart: DateOnly | null;
  readonly plannedEnd: DateOnly | null;
  readonly actualStart: DateOnly | null;
  readonly actualEnd: DateOnly | null;
  readonly noticeGivenAt: DateOnly | null;
  readonly terminationEffectiveAt: DateOnly | null;
  readonly version: number;
  readonly parties: readonly TenancyParty[];
}

export interface CreateTenancyPartyInput {
  id: TenancyPartyId;
  partyId: PartyId;
  role: TenancyPartyRole;
  isPrimary?: boolean;
}

export interface CreateTenancyInput {
  id: TenancyId;
  code: string;
  unitId: UnitId;
  parties?: readonly CreateTenancyPartyInput[];
}

function required(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new DomainError('TENANCY_REQUIRED_FIELD', `${field} is required.`);
  }
  return normalized;
}

function validatePartySet(
  tenancyId: TenancyId,
  inputs: readonly CreateTenancyPartyInput[],
): readonly TenancyParty[] {
  const seen = new Set<string>();
  let primaryOccupants = 0;

  return inputs.map((input) => {
    const key = `${input.partyId}:${input.role}`;
    if (seen.has(key)) {
      throw new DomainError(
        'TENANCY_PARTY_ALREADY_EXISTS',
        'The same party cannot have the same tenancy role twice.',
      );
    }
    seen.add(key);

    const isPrimary = input.isPrimary ?? false;
    if (isPrimary && input.role !== 'tenant' && input.role !== 'co_tenant') {
      throw new DomainError(
        'TENANCY_PRIMARY_ROLE_INVALID',
        'Only a tenant or co-tenant may be the primary tenancy party.',
      );
    }

    if (isPrimary) {
      primaryOccupants += 1;
      if (primaryOccupants > 1) {
        throw new DomainError(
          'TENANCY_PRIMARY_PARTY_ALREADY_EXISTS',
          'Only one primary tenant/co-tenant is allowed.',
        );
      }
    }

    return {
      id: input.id,
      tenancyId,
      partyId: input.partyId,
      role: input.role,
      isPrimary,
    };
  });
}

function assertTransition(
  tenancy: Tenancy,
  allowed: readonly TenancyStatus[],
  target: TenancyStatus,
): void {
  if (!allowed.includes(tenancy.status)) {
    throw new DomainError(
      'TENANCY_INVALID_TRANSITION',
      `Cannot transition tenancy from ${tenancy.status} to ${target}.`,
    );
  }
}

function increment(tenancy: Tenancy, changes: Partial<Tenancy>): Tenancy {
  return {
    ...tenancy,
    ...changes,
    version: tenancy.version + 1,
  };
}

export function createTenancy(input: CreateTenancyInput): Tenancy {
  return {
    id: input.id,
    code: required(input.code, 'code'),
    unitId: input.unitId,
    status: 'draft',
    plannedStart: null,
    plannedEnd: null,
    actualStart: null,
    actualEnd: null,
    noticeGivenAt: null,
    terminationEffectiveAt: null,
    version: 1,
    parties: validatePartySet(input.id, input.parties ?? []),
  };
}

export function addTenancyParty(
  tenancy: Tenancy,
  input: CreateTenancyPartyInput,
): Tenancy {
  if (tenancy.status === 'ended' || tenancy.status === 'cancelled') {
    throw new DomainError(
      'TENANCY_PARTY_CHANGE_NOT_ALLOWED',
      'Parties cannot be added to an ended or cancelled tenancy.',
    );
  }

  const parties = validatePartySet(tenancy.id, [
    ...tenancy.parties.map((party) => ({
      id: party.id,
      partyId: party.partyId,
      role: party.role,
      isPrimary: party.isPrimary,
    })),
    input,
  ]);

  return increment(tenancy, { parties });
}

export function planTenancy(
  tenancy: Tenancy,
  plannedStartValue: string,
  plannedEndValue?: string | null,
): Tenancy {
  assertTransition(tenancy, ['draft'], 'planned');

  const plannedStart = asDateOnly(plannedStartValue);
  const plannedEnd =
    plannedEndValue === undefined || plannedEndValue === null
      ? null
      : asDateOnly(plannedEndValue);

  if (plannedEnd !== null && plannedEnd < plannedStart) {
    throw new DomainError(
      'TENANCY_INVALID_PLANNED_PERIOD',
      'plannedEnd cannot be earlier than plannedStart.',
    );
  }

  return increment(tenancy, {
    status: 'planned',
    plannedStart,
    plannedEnd,
  });
}

export function activateTenancy(
  tenancy: Tenancy,
  actualStartValue: string,
): Tenancy {
  assertTransition(tenancy, ['planned'], 'active');

  const hasOccupant = tenancy.parties.some(
    (party) => party.role === 'tenant' || party.role === 'co_tenant',
  );
  if (!hasOccupant) {
    throw new DomainError(
      'TENANCY_REQUIRES_OCCUPANT',
      'A tenancy requires at least one tenant or co-tenant before activation.',
    );
  }

  return increment(tenancy, {
    status: 'active',
    actualStart: asDateOnly(actualStartValue),
  });
}

export function giveTenancyNotice(
  tenancy: Tenancy,
  noticeGivenAtValue: string,
  terminationEffectiveAtValue: string,
): Tenancy {
  assertTransition(tenancy, ['active'], 'notice_given');

  if (tenancy.actualStart === null) {
    throw new DomainError('TENANCY_INVALID_STATE', 'Active tenancy is missing actualStart.');
  }

  const noticeGivenAt = asDateOnly(noticeGivenAtValue);
  const terminationEffectiveAt = asDateOnly(terminationEffectiveAtValue);

  if (noticeGivenAt < tenancy.actualStart) {
    throw new DomainError(
      'TENANCY_INVALID_NOTICE_DATE',
      'noticeGivenAt cannot be earlier than actualStart.',
    );
  }

  if (terminationEffectiveAt < tenancy.actualStart) {
    throw new DomainError(
      'TENANCY_INVALID_TERMINATION_DATE',
      'terminationEffectiveAt cannot be earlier than actualStart.',
    );
  }

  return increment(tenancy, {
    status: 'notice_given',
    noticeGivenAt,
    terminationEffectiveAt,
  });
}

export function markTenancyMoveOutPending(tenancy: Tenancy): Tenancy {
  assertTransition(tenancy, ['notice_given'], 'move_out_pending');
  return increment(tenancy, { status: 'move_out_pending' });
}

export function endTenancy(
  tenancy: Tenancy,
  actualEndValue: string,
): Tenancy {
  assertTransition(
    tenancy,
    ['active', 'notice_given', 'move_out_pending'],
    'ended',
  );

  if (tenancy.actualStart === null) {
    throw new DomainError('TENANCY_INVALID_STATE', 'Tenancy is missing actualStart.');
  }

  const actualEnd = asDateOnly(actualEndValue);
  if (actualEnd < tenancy.actualStart) {
    throw new DomainError(
      'TENANCY_INVALID_ACTUAL_PERIOD',
      'actualEnd cannot be earlier than actualStart.',
    );
  }

  return increment(tenancy, {
    status: 'ended',
    actualEnd,
  });
}

export function cancelTenancy(tenancy: Tenancy): Tenancy {
  assertTransition(tenancy, ['draft', 'planned'], 'cancelled');
  return increment(tenancy, { status: 'cancelled' });
}
