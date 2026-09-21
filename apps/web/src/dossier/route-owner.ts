import type {
  PropertyResponse,
  SpaceResponse,
  UnitResponse,
} from '@portfolio/contracts';

export function assertPropertyUnitsOwner(
  propertyId: string,
  property: PropertyResponse,
  units: readonly UnitResponse[],
): void {
  if (property.id !== propertyId) {
    throw new Error(
      'Property response does not match the Property encoded in the URL.',
    );
  }

  if (units.some((unit) => unit.propertyId !== propertyId)) {
    throw new Error(
      'Property Unit list contains a Unit owned by another Property.',
    );
  }
}

export function assertUnitRouteOwner(
  propertyId: string,
  unitId: string,
  unit: UnitResponse,
): void {
  if (unit.id !== unitId) {
    throw new Error(
      'Unit response does not match the Unit encoded in the URL.',
    );
  }

  if (unit.propertyId !== propertyId) {
    throw new Error(
      'Unit route does not belong to the Property encoded in the URL.',
    );
  }
}

export function assertUnitSpacesOwner(
  unitId: string,
  spaces: readonly SpaceResponse[],
): void {
  if (spaces.some((space) => space.unitId !== unitId)) {
    throw new Error(
      'Unit Space list contains a Space owned by another Unit.',
    );
  }
}
