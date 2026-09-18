import { describe, expect, it } from 'vitest';
import {
  DomainError,
  asPropertyId,
  asSpaceId,
  asUnitId,
  createProperty,
  createSpace,
  createUnit,
} from '../src/index.js';

describe('Portfolio domain', () => {
  it('normalizes and creates a valid property', () => {
    const property = createProperty({
      id: asPropertyId('6a644eaa-dae0-4c4a-9ae4-6e5a93ceef3f'),
      code: ' PROP-0001 ',
      name: ' Main Building ',
      propertyType: 'apartment_building',
      street: 'Example Street',
      houseNumber: '10',
      postalCode: '18000',
      city: 'Niš',
      countryCode: 'rs',
      yearBuilt: 2018,
    });

    expect(property.code).toBe('PROP-0001');
    expect(property.countryCode).toBe('RS');
    expect(property.status).toBe('active');
  });

  it('rejects a property without a valid country code', () => {
    expect(() =>
      createProperty({
        id: asPropertyId('6a644eaa-dae0-4c4a-9ae4-6e5a93ceef3f'),
        code: 'PROP-0001',
        name: 'Main Building',
        propertyType: 'apartment_building',
        street: 'Example Street',
        houseNumber: '10',
        postalCode: '18000',
        city: 'Niš',
        countryCode: 'SER',
      }),
    ).toThrow(DomainError);
  });

  it('creates an active unit without encoding occupancy in Unit status', () => {
    const propertyId = asPropertyId('6a644eaa-dae0-4c4a-9ae4-6e5a93ceef3f');

    const unit = createUnit({
      id: asUnitId('f05296da-8e3c-45e5-8357-957745830c86'),
      propertyId,
      code: 'UNIT-0001',
      unitNumber: '4B',
      unitType: 'apartment',
      areaM2: 72.5,
      rooms: 3,
    });

    expect(unit.propertyId).toBe(propertyId);
    expect(unit.status).toBe('active');
  });

  it('rejects non-positive unit area', () => {
    expect(() =>
      createUnit({
        id: asUnitId('f05296da-8e3c-45e5-8357-957745830c86'),
        propertyId: asPropertyId('6a644eaa-dae0-4c4a-9ae4-6e5a93ceef3f'),
        code: 'UNIT-0001',
        unitNumber: '4B',
        unitType: 'apartment',
        areaM2: 0,
      }),
    ).toThrowError(/areaM2/);
  });

  it('creates a space that belongs to exactly one unit', () => {
    const space = createSpace({
      id: asSpaceId('f5d0ee31-0f36-41cf-8660-6de2ed95bd2b'),
      unitId: asUnitId('f05296da-8e3c-45e5-8357-957745830c86'),
      code: 'KITCHEN',
      name: 'Kitchen',
      spaceType: 'kitchen',
      sortOrder: 10,
    });

    expect(space.spaceType).toBe('kitchen');
    expect(space.active).toBe(true);
  });
});
