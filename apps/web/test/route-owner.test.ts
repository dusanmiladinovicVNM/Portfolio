import { describe, expect, it } from 'vitest';
import type {
  PropertyResponse,
  SpaceResponse,
  TenancyResponse,
  UnitResponse,
} from '@portfolio/contracts';
import {
  assertPropertyUnitsOwner,
  assertTenancyMutationOwner,
  assertUnitRouteOwner,
  assertUnitSpacesOwner,
  assertUnitTenanciesOwner,
} from '../src/dossier/route-owner.js';

const propertyA = '11111111-1111-4111-8111-111111111111';
const propertyB = '22222222-2222-4222-8222-222222222222';
const unitA = '33333333-3333-4333-8333-333333333333';
const unitB = '44444444-4444-4444-8444-444444444444';
const spaceA = '55555555-5555-4555-8555-555555555555';
const tenancyA = '66666666-6666-4666-8666-666666666666';
const tenancyB = '77777777-7777-4777-8777-777777777777';

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

function tenancy(
  id: string,
  unitId: string,
  version = 1,
): TenancyResponse {
  return {
    id,
    code: 'TENANCY',
    unitId,
    status: 'draft',
    plannedStart: null,
    plannedEnd: null,
    actualStart: null,
    actualEnd: null,
    noticeGivenAt: null,
    terminationEffectiveAt: null,
    version,
    parties: [],
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

  it('rejects a Tenancy list containing a different Unit owner', () => {
    expect(() =>
      assertUnitTenanciesOwner(unitA, [tenancy(tenancyA, unitA)]),
    ).not.toThrow();

    expect(() =>
      assertUnitTenanciesOwner(unitA, [tenancy(tenancyA, unitB)]),
    ).toThrow('owned by another Unit');
  });

  it('binds Tenancy mutation completion to Unit, Tenancy and expected version', () => {
    expect(() =>
      assertTenancyMutationOwner(
        unitA,
        tenancyA,
        2,
        tenancy(tenancyA, unitA, 3),
      ),
    ).not.toThrow();

    expect(() =>
      assertTenancyMutationOwner(
        unitA,
        tenancyA,
        2,
        tenancy(tenancyB, unitA, 3),
      ),
    ).toThrow('command target');

    expect(() =>
      assertTenancyMutationOwner(
        unitA,
        tenancyA,
        2,
        tenancy(tenancyA, unitB, 3),
      ),
    ).toThrow('another Unit');

    expect(() =>
      assertTenancyMutationOwner(
        unitA,
        tenancyA,
        2,
        tenancy(tenancyA, unitA, 4),
      ),
    ).toThrow('expected version');
  });
});
