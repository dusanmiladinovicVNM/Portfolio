import { describe, expect, it } from 'vitest';
import type {
  PropertyResponse,
  SpaceResponse,
  UnitResponse,
} from '@portfolio/contracts';
import {
  assertPropertyUnitsOwner,
  assertUnitRouteOwner,
  assertUnitSpacesOwner,
} from '../src/dossier/route-owner.js';

const propertyA = '11111111-1111-4111-8111-111111111111';
const propertyB = '22222222-2222-4222-8222-222222222222';
const unitA = '33333333-3333-4333-8333-333333333333';
const unitB = '44444444-4444-4444-8444-444444444444';
const spaceA = '55555555-5555-4555-8555-555555555555';

function property(id: string): PropertyResponse {
  return {
    id,
    code: 'PROP',
    name: 'Property',
    propertyType: 'apartment_building',
    street: 'Street',
    houseNumber: '1',
    postalCode: '8000',
    city: 'Zurich',
    countryCode: 'CH',
    yearBuilt: null,
    status: 'active',
  };
}

function unit(id: string, propertyId: string): UnitResponse {
  return {
    id,
    propertyId,
    code: 'UNIT',
    unitNumber: '1A',
    unitType: 'apartment',
    floor: null,
    areaM2: null,
    rooms: null,
    status: 'active',
    notes: '',
  };
}

function space(id: string, unitId: string): SpaceResponse {
  return {
    id,
    unitId,
    code: 'ROOM',
    name: 'Room',
    spaceType: 'bedroom',
    areaM2: null,
    sortOrder: 0,
    active: true,
  };
}

describe('route owner identity guards', () => {
  it('accepts Property data only when both Property and every Unit belong to the route owner', () => {
    expect(() =>
      assertPropertyUnitsOwner(
        propertyA,
        property(propertyA),
        [unit(unitA, propertyA)],
      ),
    ).not.toThrow();

    expect(() =>
      assertPropertyUnitsOwner(
        propertyA,
        property(propertyB),
        [unit(unitA, propertyA)],
      ),
    ).toThrow('Property response does not match');

    expect(() =>
      assertPropertyUnitsOwner(
        propertyA,
        property(propertyA),
        [unit(unitB, propertyB)],
      ),
    ).toThrow('owned by another Property');
  });

  it('accepts a Unit only when both Unit and Property identities match the route', () => {
    expect(() =>
      assertUnitRouteOwner(propertyA, unitA, unit(unitA, propertyA)),
    ).not.toThrow();

    expect(() =>
      assertUnitRouteOwner(propertyA, unitA, unit(unitB, propertyA)),
    ).toThrow('Unit response does not match');

    expect(() =>
      assertUnitRouteOwner(propertyA, unitA, unit(unitA, propertyB)),
    ).toThrow('does not belong to the Property');
  });

  it('rejects a Space list containing a different Unit owner', () => {
    expect(() =>
      assertUnitSpacesOwner(unitA, [space(spaceA, unitA)]),
    ).not.toThrow();

    expect(() =>
      assertUnitSpacesOwner(unitA, [space(spaceA, unitB)]),
    ).toThrow('owned by another Unit');
  });
});
