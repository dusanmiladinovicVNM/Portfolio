import { asDateOnly, type DateOnly } from '../shared/date-only.js';
import { DomainError } from '../shared/domain-error.js';
import type {
  OwnershipPeriodId,
  PartyId,
  UnitId,
} from '../shared/entity-id.js';

export const FULL_OWNERSHIP_BASIS_POINTS = 10_000;

export interface OwnershipShare {
  readonly partyId: PartyId;
  readonly shareBasisPoints: number;
}

export interface OwnershipPeriod {
  readonly id: OwnershipPeriodId;
  readonly unitId: UnitId;
  readonly validFrom: DateOnly;
  readonly validTo: DateOnly | null;
  readonly owners: readonly OwnershipShare[];
}

export interface CreateOwnershipPeriodInput {
  id: OwnershipPeriodId;
  unitId: UnitId;
  validFrom: string;
  validTo?: string | null;
  owners: readonly OwnershipShare[];
}

export function createOwnershipPeriod(
  input: CreateOwnershipPeriodInput,
): OwnershipPeriod {
  const validFrom = asDateOnly(input.validFrom);
  const validTo =
    input.validTo === undefined || input.validTo === null
      ? null
      : asDateOnly(input.validTo);

  if (validTo !== null && validTo < validFrom) {
    throw new DomainError(
      'OWNERSHIP_INVALID_PERIOD',
      'validTo cannot be earlier than validFrom.',
    );
  }

  if (input.owners.length === 0) {
    throw new DomainError(
      'OWNERSHIP_REQUIRES_OWNER',
      'An ownership period must contain at least one owner.',
    );
  }

  const seen = new Set<string>();
  let totalBasisPoints = 0;

  for (const owner of input.owners) {
    if (seen.has(owner.partyId)) {
      throw new DomainError(
        'OWNERSHIP_DUPLICATE_OWNER',
        'The same party cannot appear twice in one ownership period.',
      );
    }
    seen.add(owner.partyId);

    if (
      !Number.isInteger(owner.shareBasisPoints) ||
      owner.shareBasisPoints <= 0 ||
      owner.shareBasisPoints > FULL_OWNERSHIP_BASIS_POINTS
    ) {
      throw new DomainError(
        'OWNERSHIP_INVALID_SHARE',
        'Ownership share must be an integer between 1 and 10000 basis points.',
      );
    }

    totalBasisPoints += owner.shareBasisPoints;
  }

  if (totalBasisPoints !== FULL_OWNERSHIP_BASIS_POINTS) {
    throw new DomainError(
      'OWNERSHIP_SHARES_NOT_COMPLETE',
      'Ownership shares must total exactly 100%.',
    );
  }

  return {
    id: input.id,
    unitId: input.unitId,
    validFrom,
    validTo,
    owners: [...input.owners],
  };
}
