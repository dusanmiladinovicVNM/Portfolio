import { DomainError } from '../shared/domain-error.js';
import type { PropertyId } from '../shared/entity-id.js';

export const PROPERTY_TYPES = [
  'apartment_building',
  'house',
  'mixed_use',
  'commercial',
  'other',
] as const;

export type PropertyType = (typeof PROPERTY_TYPES)[number];
export type PropertyStatus = 'active' | 'inactive' | 'archived';

export interface Property {
  readonly id: PropertyId;
  code: string;
  name: string;
  propertyType: PropertyType;
  street: string;
  houseNumber: string;
  postalCode: string;
  city: string;
  countryCode: string;
  yearBuilt: number | null;
  status: PropertyStatus;
}

export interface CreatePropertyInput {
  id: PropertyId;
  code: string;
  name: string;
  propertyType: PropertyType;
  street: string;
  houseNumber: string;
  postalCode: string;
  city: string;
  countryCode: string;
  yearBuilt?: number | null;
}

function required(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new DomainError('PROPERTY_REQUIRED_FIELD', `${field} is required.`);
  }
  return normalized;
}

export function createProperty(input: CreatePropertyInput): Property {
  const countryCode = required(input.countryCode, 'countryCode').toUpperCase();
  if (!/^[A-Z]{2}$/.test(countryCode)) {
    throw new DomainError(
      'PROPERTY_INVALID_COUNTRY',
      'countryCode must be an ISO 3166-1 alpha-2 code.',
    );
  }

  const currentYear = new Date().getUTCFullYear();
  if (
    input.yearBuilt !== undefined &&
    input.yearBuilt !== null &&
    (!Number.isInteger(input.yearBuilt) ||
      input.yearBuilt < 1000 ||
      input.yearBuilt > currentYear + 5)
  ) {
    throw new DomainError('PROPERTY_INVALID_YEAR_BUILT', 'yearBuilt is outside the accepted range.');
  }

  return {
    id: input.id,
    code: required(input.code, 'code'),
    name: required(input.name, 'name'),
    propertyType: input.propertyType,
    street: required(input.street, 'street'),
    houseNumber: required(input.houseNumber, 'houseNumber'),
    postalCode: required(input.postalCode, 'postalCode'),
    city: required(input.city, 'city'),
    countryCode,
    yearBuilt: input.yearBuilt ?? null,
    status: 'active',
  };
}
