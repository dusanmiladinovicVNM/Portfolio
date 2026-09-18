declare const entityIdBrand: unique symbol;

export type EntityId<TName extends string> = string & {
  readonly [entityIdBrand]: TName;
};

export type PropertyId = EntityId<'Property'>;
export type UnitId = EntityId<'Unit'>;
export type SpaceId = EntityId<'Space'>;

export const asPropertyId = (value: string): PropertyId => value as PropertyId;
export const asUnitId = (value: string): UnitId => value as UnitId;
export const asSpaceId = (value: string): SpaceId => value as SpaceId;
