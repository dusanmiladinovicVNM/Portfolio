import { DomainError } from '../shared/domain-error.js';
import type { PropertyId, UnitId } from '../shared/entity-id.js';

export const UNIT_TYPES = [
  'apartment',
  'house',
  'studio',
  'office',
  'commercial',
  'other',
] as const;

export const UNIT_STATUSES = [
  'vacant',
  'occupied',
  'turnover',
  'inactive',
  'archived',
] as const;

export type UnitType = (typeof UNIT_TYPES)[number];
export type UnitStatus = (typeof UNIT_STATUSES)[number];

export interface Unit {
  readonly id: UnitId;
  readonly propertyId: PropertyId;
  code: string;
  unitNumber: string;
  unitType: UnitType;
  floor: string | null;
  areaM2: number | null;
  rooms: number | null;
  status: UnitStatus;
  notes: string;
}

export interface CreateUnitInput {
  id: UnitId;
  propertyId: PropertyId;
  code: string;
  unitNumber: string;
  unitType: UnitType;
  floor?: string | null;
  areaM2?: number | null;
  rooms?: number | null;
  notes?: string;
}

export function createUnit(input: CreateUnitInput): Unit {
  const code = input.code.trim();
  const unitNumber = input.unitNumber.trim();

  if (!code) throw new DomainError('UNIT_CODE_REQUIRED', 'code is required.');
  if (!unitNumber) throw new DomainError('UNIT_NUMBER_REQUIRED', 'unitNumber is required.');

  if (input.areaM2 !== undefined && input.areaM2 !== null && input.areaM2 <= 0) {
    throw new DomainError('UNIT_INVALID_AREA', 'areaM2 must be greater than zero.');
  }

  if (
    input.rooms !== undefined &&
    input.rooms !== null &&
    (!Number.isFinite(input.rooms) || input.rooms <= 0)
  ) {
    throw new DomainError('UNIT_INVALID_ROOMS', 'rooms must be greater than zero.');
  }

  return {
    id: input.id,
    propertyId: input.propertyId,
    code,
    unitNumber,
    unitType: input.unitType,
    floor: input.floor?.trim() || null,
    areaM2: input.areaM2 ?? null,
    rooms: input.rooms ?? null,
    status: 'vacant',
    notes: input.notes?.trim() ?? '',
  };
}
