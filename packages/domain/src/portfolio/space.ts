import { DomainError } from '../shared/domain-error.js';
import type { SpaceId, UnitId } from '../shared/entity-id.js';

export const SPACE_TYPES = [
  'living_room',
  'kitchen',
  'bedroom',
  'bathroom',
  'hall',
  'balcony',
  'terrace',
  'cellar',
  'storage',
  'garage',
  'parking',
  'other',
] as const;

export type SpaceType = (typeof SPACE_TYPES)[number];

export interface Space {
  readonly id: SpaceId;
  readonly unitId: UnitId;
  code: string;
  name: string;
  spaceType: SpaceType;
  areaM2: number | null;
  sortOrder: number;
  active: boolean;
}

export interface CreateSpaceInput {
  id: SpaceId;
  unitId: UnitId;
  code: string;
  name: string;
  spaceType: SpaceType;
  areaM2?: number | null;
  sortOrder?: number;
}

export function createSpace(input: CreateSpaceInput): Space {
  const code = input.code.trim();
  const name = input.name.trim();

  if (!code) throw new DomainError('SPACE_CODE_REQUIRED', 'code is required.');
  if (!name) throw new DomainError('SPACE_NAME_REQUIRED', 'name is required.');
  if (input.areaM2 !== undefined && input.areaM2 !== null && input.areaM2 <= 0) {
    throw new DomainError('SPACE_INVALID_AREA', 'areaM2 must be greater than zero.');
  }

  const sortOrder = input.sortOrder ?? 0;
  if (!Number.isInteger(sortOrder) || sortOrder < 0) {
    throw new DomainError('SPACE_INVALID_SORT_ORDER', 'sortOrder must be a non-negative integer.');
  }

  return {
    id: input.id,
    unitId: input.unitId,
    code,
    name,
    spaceType: input.spaceType,
    areaM2: input.areaM2 ?? null,
    sortOrder,
    active: true,
  };
}
