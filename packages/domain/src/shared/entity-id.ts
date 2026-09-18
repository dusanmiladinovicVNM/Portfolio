declare const entityIdBrand: unique symbol;

export type EntityId<TName extends string> = string & {
  readonly [entityIdBrand]: TName;
};

export type UserId = EntityId<'User'>;
export type PropertyId = EntityId<'Property'>;
export type UnitId = EntityId<'Unit'>;
export type SpaceId = EntityId<'Space'>;
export type PartyId = EntityId<'Party'>;
export type ContactPointId = EntityId<'ContactPoint'>;
export type PartyAddressId = EntityId<'PartyAddress'>;
export type OwnershipPeriodId = EntityId<'OwnershipPeriod'>;
export type TenancyId = EntityId<'Tenancy'>;
export type TenancyPartyId = EntityId<'TenancyParty'>;

export const asUserId = (value: string): UserId => value as UserId;
export const asPropertyId = (value: string): PropertyId => value as PropertyId;
export const asUnitId = (value: string): UnitId => value as UnitId;
export const asSpaceId = (value: string): SpaceId => value as SpaceId;
export const asPartyId = (value: string): PartyId => value as PartyId;
export const asContactPointId = (value: string): ContactPointId => value as ContactPointId;
export const asPartyAddressId = (value: string): PartyAddressId => value as PartyAddressId;
export const asOwnershipPeriodId = (value: string): OwnershipPeriodId => value as OwnershipPeriodId;
export const asTenancyId = (value: string): TenancyId => value as TenancyId;
export const asTenancyPartyId = (value: string): TenancyPartyId => value as TenancyPartyId;
