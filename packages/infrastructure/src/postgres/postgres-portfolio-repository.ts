import type postgres from 'postgres';
import type { PortfolioRepository } from '@portfolio/application';
import {
  asPropertyId,
  asSpaceId,
  asUnitId,
  type Property,
  type PropertyId,
  type PropertyStatus,
  type PropertyType,
  type Space,
  type SpaceId,
  type SpaceType,
  type Unit,
  type UnitId,
  type UnitStatus,
  type UnitType,
} from '@portfolio/domain';

type Sql = ReturnType<typeof postgres>;

interface PropertyRow {
  id: string;
  code: string;
  name: string;
  property_type: PropertyType;
  street: string;
  house_number: string;
  postal_code: string;
  city: string;
  country_code: string;
  year_built: number | null;
  status: PropertyStatus;
}

interface UnitRow {
  id: string;
  property_id: string;
  code: string;
  unit_number: string;
  unit_type: UnitType;
  floor: string | null;
  area_m2: string | number | null;
  rooms: string | number | null;
  status: UnitStatus;
  notes: string;
}

interface SpaceRow {
  id: string;
  unit_id: string;
  code: string;
  name: string;
  space_type: SpaceType;
  area_m2: string | number | null;
  sort_order: number;
  active: boolean;
}

const nullableNumber = (value: string | number | null): number | null =>
  value === null ? null : Number(value);

const mapProperty = (row: PropertyRow): Property => ({
  id: asPropertyId(row.id),
  code: row.code,
  name: row.name,
  propertyType: row.property_type,
  street: row.street,
  houseNumber: row.house_number,
  postalCode: row.postal_code,
  city: row.city,
  countryCode: row.country_code,
  yearBuilt: row.year_built,
  status: row.status,
});

const mapUnit = (row: UnitRow): Unit => ({
  id: asUnitId(row.id),
  propertyId: asPropertyId(row.property_id),
  code: row.code,
  unitNumber: row.unit_number,
  unitType: row.unit_type,
  floor: row.floor,
  areaM2: nullableNumber(row.area_m2),
  rooms: nullableNumber(row.rooms),
  status: row.status,
  notes: row.notes,
});

const mapSpace = (row: SpaceRow): Space => ({
  id: asSpaceId(row.id),
  unitId: asUnitId(row.unit_id),
  code: row.code,
  name: row.name,
  spaceType: row.space_type,
  areaM2: nullableNumber(row.area_m2),
  sortOrder: row.sort_order,
  active: row.active,
});

export class PostgresPortfolioRepository implements PortfolioRepository {
  constructor(private readonly sql: Sql) {}

  async getPropertyById(id: PropertyId): Promise<Property | null> {
    const rows = await this.sql<PropertyRow[]>`
      select
        id, code, name, property_type, street, house_number,
        postal_code, city, country_code, year_built, status
      from public.properties
      where id = ${id}
      limit 1
    `;
    return rows.length === 0 ? null : mapProperty(rows[0]!);
  }

  async getUnitById(id: UnitId): Promise<Unit | null> {
    const rows = await this.sql<UnitRow[]>`
      select
        id, property_id, code, unit_number, unit_type, floor,
        area_m2, rooms, status, notes
      from public.units
      where id = ${id}
      limit 1
    `;
    return rows.length === 0 ? null : mapUnit(rows[0]!);
  }

  async getSpaceById(id: SpaceId): Promise<Space | null> {
    const rows = await this.sql<SpaceRow[]>`
      select id, unit_id, code, name, space_type, area_m2, sort_order, active
      from public.spaces
      where id = ${id}
      limit 1
    `;
    return rows.length === 0 ? null : mapSpace(rows[0]!);
  }

  async listProperties(): Promise<readonly Property[]> {
    const rows = await this.sql<PropertyRow[]>`
      select
        id, code, name, property_type, street, house_number,
        postal_code, city, country_code, year_built, status
      from public.properties
      order by lower(code), id
    `;
    return rows.map(mapProperty);
  }

  async listUnitsByProperty(propertyId: PropertyId): Promise<readonly Unit[]> {
    const rows = await this.sql<UnitRow[]>`
      select
        id, property_id, code, unit_number, unit_type, floor,
        area_m2, rooms, status, notes
      from public.units
      where property_id = ${propertyId}
      order by lower(unit_number), id
    `;
    return rows.map(mapUnit);
  }

  async listSpacesByUnit(unitId: UnitId): Promise<readonly Space[]> {
    const rows = await this.sql<SpaceRow[]>`
      select id, unit_id, code, name, space_type, area_m2, sort_order, active
      from public.spaces
      where unit_id = ${unitId}
      order by sort_order, lower(code), id
    `;
    return rows.map(mapSpace);
  }

  async propertyCodeExists(code: string): Promise<boolean> {
    const rows = await this.sql<{ exists: boolean }[]>`
      select exists(
        select 1 from public.properties where lower(code) = lower(${code})
      ) as exists
    `;
    return rows[0]?.exists ?? false;
  }

  async unitCodeExists(code: string): Promise<boolean> {
    const rows = await this.sql<{ exists: boolean }[]>`
      select exists(
        select 1 from public.units where lower(code) = lower(${code})
      ) as exists
    `;
    return rows[0]?.exists ?? false;
  }

  async unitNumberExists(propertyId: PropertyId, unitNumber: string): Promise<boolean> {
    const rows = await this.sql<{ exists: boolean }[]>`
      select exists(
        select 1
        from public.units
        where property_id = ${propertyId}
          and lower(unit_number) = lower(${unitNumber})
      ) as exists
    `;
    return rows[0]?.exists ?? false;
  }

  async spaceCodeExists(unitId: UnitId, code: string): Promise<boolean> {
    const rows = await this.sql<{ exists: boolean }[]>`
      select exists(
        select 1
        from public.spaces
        where unit_id = ${unitId}
          and lower(code) = lower(${code})
      ) as exists
    `;
    return rows[0]?.exists ?? false;
  }

  async insertProperty(property: Property): Promise<void> {
    await this.sql`
      insert into public.properties (
        id, code, name, property_type, street, house_number,
        postal_code, city, country_code, year_built, status
      ) values (
        ${property.id}, ${property.code}, ${property.name}, ${property.propertyType},
        ${property.street}, ${property.houseNumber}, ${property.postalCode},
        ${property.city}, ${property.countryCode}, ${property.yearBuilt}, ${property.status}
      )
    `;
  }

  async insertUnit(unit: Unit): Promise<void> {
    await this.sql`
      insert into public.units (
        id, property_id, code, unit_number, unit_type, floor,
        area_m2, rooms, status, notes
      ) values (
        ${unit.id}, ${unit.propertyId}, ${unit.code}, ${unit.unitNumber},
        ${unit.unitType}, ${unit.floor}, ${unit.areaM2}, ${unit.rooms},
        ${unit.status}, ${unit.notes}
      )
    `;
  }

  async insertSpace(space: Space): Promise<void> {
    await this.sql`
      insert into public.spaces (
        id, unit_id, code, name, space_type, area_m2, sort_order, active
      ) values (
        ${space.id}, ${space.unitId}, ${space.code}, ${space.name},
        ${space.spaceType}, ${space.areaM2}, ${space.sortOrder}, ${space.active}
      )
    `;
  }
}
