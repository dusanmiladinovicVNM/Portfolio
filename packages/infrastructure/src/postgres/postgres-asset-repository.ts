import type postgres from 'postgres';
import type { AssetRepository } from '@portfolio/application';
import {
  DomainError,
  asAssetId,
  asAssetIdentifierId,
  asAssetReplacementId,
  asPropertyId,
  asSpaceId,
  asUnitId,
  asUserId,
  type Asset,
  type AssetId,
  type AssetIdentifier,
  type AssetIdentifierType,
  type AssetReplacement,
  type AssetStatus,
  type GloballyUniqueAssetIdentifierType,
  type PropertyId,
  type UnitId,
} from '@portfolio/domain';

type Sql = ReturnType<typeof postgres>;

interface PostgresErrorLike {
  code?: string;
  constraint_name?: string;
}

interface AssetRow {
  id: string;
  code: string;
  name: string;
  property_id: string;
  unit_id: string | null;
  space_id: string | null;
  manufacturer: string | null;
  model: string | null;
  status: AssetStatus;
  version: number;
}

interface AssetIdentifierRow {
  id: string;
  asset_id: string;
  identifier_type: AssetIdentifierType;
  value: string;
  label: string | null;
}

interface AssetReplacementRow {
  id: string;
  replaced_asset_id: string;
  replacement_asset_id: string;
  replaced_by_user_id: string;
  replaced_at: string;
}

function mapIdentifier(row: AssetIdentifierRow): AssetIdentifier {
  return {
    id: asAssetIdentifierId(row.id),
    assetId: asAssetId(row.asset_id),
    identifierType: row.identifier_type,
    value: row.value,
    label: row.label,
  };
}

function mapReplacement(row: AssetReplacementRow): AssetReplacement {
  return {
    id: asAssetReplacementId(row.id),
    replacedAssetId: asAssetId(row.replaced_asset_id),
    replacementAssetId: asAssetId(row.replacement_asset_id),
    replacedByUserId: asUserId(row.replaced_by_user_id),
    replacedAt: row.replaced_at,
  };
}

function translate(error: unknown): DomainError | null {
  const pg = error as PostgresErrorLike;

  if (pg.code === '23505') {
    switch (pg.constraint_name) {
      case 'assets_code_uq':
        return new DomainError(
          'ASSET_CODE_ALREADY_EXISTS',
          'Asset code already exists.',
        );
      case 'asset_identifiers_identity_uq':
        return new DomainError(
          'ASSET_IDENTIFIER_ALREADY_EXISTS',
          'The same structured identifier already exists for this Asset.',
        );
      case 'asset_identifiers_inventory_tag_uq':
      case 'asset_identifiers_imei_uq':
      case 'asset_identifiers_mac_address_uq':
        return new DomainError(
          'ASSET_IDENTIFIER_GLOBAL_CONFLICT',
          'This globally unique Asset identifier is already assigned.',
        );
      case 'asset_replacements_replaced_uq':
        return new DomainError(
          'ASSET_ALREADY_REPLACED',
          'Asset already has a replacement successor.',
        );
      case 'asset_replacements_replacement_uq':
        return new DomainError(
          'ASSET_REPLACEMENT_ALREADY_LINKED',
          'Replacement Asset is already linked to another predecessor.',
        );
      default:
        return null;
    }
  }

  if (pg.code === '23514') {
    switch (pg.constraint_name) {
      case 'asset_identity_placement_immutable':
        return new DomainError(
          'ASSET_IDENTITY_PLACEMENT_IMMUTABLE',
          'Asset business identity and current placement are protected until location history exists.',
        );
      case 'asset_delete_forbidden':
        return new DomainError(
          'ASSET_DELETE_FORBIDDEN',
          'Asset physical identity cannot be deleted.',
        );
      case 'asset_identifier_immutable':
        return new DomainError(
          'ASSET_IDENTIFIER_IMMUTABLE',
          'Asset identifiers are append-only identity data.',
        );
      case 'asset_replacement_immutable':
        return new DomainError(
          'ASSET_REPLACEMENT_IMMUTABLE',
          'Asset replacement relationships are append-only.',
        );
      case 'asset_replacement_placement_mismatch':
        return new DomainError(
          'ASSET_REPLACEMENT_PLACEMENT_MISMATCH',
          'Replacement Asset must inherit the exact predecessor placement.',
        );
      case 'asset_replacement_cycle':
        return new DomainError(
          'ASSET_REPLACEMENT_CYCLE',
          'Asset replacement lineage cannot contain a cycle.',
        );
      case 'asset_replacement_predecessor_state':
      case 'asset_replacement_successor_state':
      case 'asset_replacement_required':
      case 'asset_replacement_status_required':
      case 'asset_lifecycle_transition_invalid':
      case 'asset_initial_state':
      case 'asset_mixed_mutation_forbidden':
        return new DomainError(
          'ASSET_INVALID_TRANSITION',
          'Invalid Asset lifecycle/replacement transition.',
        );
      case 'asset_version_step':
        return new DomainError(
          'ASSET_VERSION_CONFLICT',
          'Asset mutation version is invalid.',
        );
      default:
        return null;
    }
  }

  return null;
}

async function translated<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    const mapped = translate(error);
    if (mapped) throw mapped;
    throw error;
  }
}

const assetSelect = `
  select
    id, code, name, property_id, unit_id, space_id,
    manufacturer, model, status, version
  from public.assets
`;

export class PostgresAssetRepository implements AssetRepository {
  constructor(private readonly sql: Sql) {}

  private async identifiersFor(assetId: AssetId): Promise<readonly AssetIdentifier[]> {
    const rows = await this.sql<AssetIdentifierRow[]>`
      select id, asset_id, identifier_type, value, label
      from public.asset_identifiers
      where asset_id = ${assetId}
      order by identifier_type, lower(value), id
    `;
    return rows.map(mapIdentifier);
  }

  private async hydrate(row: AssetRow): Promise<Asset> {
    const id = asAssetId(row.id);
    return {
      id,
      code: row.code,
      name: row.name,
      propertyId: asPropertyId(row.property_id),
      unitId: row.unit_id === null ? null : asUnitId(row.unit_id),
      spaceId: row.space_id === null ? null : asSpaceId(row.space_id),
      manufacturer: row.manufacturer,
      model: row.model,
      status: row.status,
      version: row.version,
      identifiers: await this.identifiersFor(id),
    };
  }

  async getById(id: AssetId): Promise<Asset | null> {
    const rows = await this.sql<AssetRow[]>`
      ${this.sql.unsafe(assetSelect)}
      where id = ${id}
      limit 1
    `;
    return rows.length === 0 ? null : this.hydrate(rows[0]!);
  }

  async listByProperty(propertyId: PropertyId): Promise<readonly Asset[]> {
    const rows = await this.sql<AssetRow[]>`
      ${this.sql.unsafe(assetSelect)}
      where property_id = ${propertyId}
      order by lower(code), id
    `;
    return Promise.all(rows.map((row) => this.hydrate(row)));
  }

  async listByUnit(unitId: UnitId): Promise<readonly Asset[]> {
    const rows = await this.sql<AssetRow[]>`
      ${this.sql.unsafe(assetSelect)}
      where unit_id = ${unitId}
      order by lower(code), id
    `;
    return Promise.all(rows.map((row) => this.hydrate(row)));
  }

  async codeExists(code: string): Promise<boolean> {
    const rows = await this.sql<{ exists: boolean }[]>`
      select exists(
        select 1
        from public.assets
        where lower(btrim(code)) = lower(btrim(${code}))
      ) as exists
    `;
    return rows[0]?.exists ?? false;
  }

  async globallyUniqueIdentifierExists(
    identifierType: GloballyUniqueAssetIdentifierType,
    value: string,
  ): Promise<boolean> {
    const rows = await this.sql<{ exists: boolean }[]>`
      select exists(
        select 1
        from public.asset_identifiers
        where identifier_type = ${identifierType}
          and lower(btrim(value)) = lower(btrim(${value}))
      ) as exists
    `;
    return rows[0]?.exists ?? false;
  }

  async insert(asset: Asset): Promise<void> {
    await translated(async () => {
      await this.sql.begin(async (tx) => {
        await tx`
          insert into public.assets (
            id, code, name, property_id, unit_id, space_id,
            manufacturer, model, status, version
          ) values (
            ${asset.id}, ${asset.code}, ${asset.name}, ${asset.propertyId},
            ${asset.unitId}, ${asset.spaceId}, ${asset.manufacturer},
            ${asset.model}, ${asset.status}, ${asset.version}
          )
        `;

        for (const identifier of asset.identifiers) {
          await tx`
            insert into public.asset_identifiers (
              id, asset_id, identifier_type, value, label
            ) values (
              ${identifier.id}, ${identifier.assetId},
              ${identifier.identifierType}, ${identifier.value},
              ${identifier.label}
            )
          `;
        }
      });
    });
  }

  async updateMetadata(asset: Asset, expectedVersion: number): Promise<void> {
    const rows = await translated(() => this.sql<{ id: string }[]>`
      update public.assets
      set
        name = ${asset.name},
        manufacturer = ${asset.manufacturer},
        model = ${asset.model},
        version = ${asset.version},
        updated_at = now()
      where id = ${asset.id}
        and version = ${expectedVersion}
      returning id
    `);

    if (rows.length === 0) {
      throw new DomainError(
        'ASSET_VERSION_CONFLICT',
        'Asset changed before the metadata correction completed.',
      );
    }
  }

  async updateStatus(asset: Asset, expectedVersion: number): Promise<void> {
    const rows = await translated(() => this.sql<{ id: string }[]>`
      update public.assets
      set
        status = ${asset.status},
        version = ${asset.version},
        updated_at = now()
      where id = ${asset.id}
        and version = ${expectedVersion}
      returning id
    `);

    if (rows.length === 0) {
      throw new DomainError(
        'ASSET_VERSION_CONFLICT',
        'Asset changed before the lifecycle transition completed.',
      );
    }
  }

  async replaceAsset(
    current: Asset,
    replaced: Asset,
    replacement: Asset,
    relation: AssetReplacement,
  ): Promise<void> {
    await translated(async () => {
      await this.sql.begin(async (tx) => {
        await tx`
          insert into public.assets (
            id, code, name, property_id, unit_id, space_id,
            manufacturer, model, status, version
          ) values (
            ${replacement.id}, ${replacement.code}, ${replacement.name},
            ${replacement.propertyId}, ${replacement.unitId},
            ${replacement.spaceId}, ${replacement.manufacturer},
            ${replacement.model}, ${replacement.status}, ${replacement.version}
          )
        `;

        for (const identifier of replacement.identifiers) {
          await tx`
            insert into public.asset_identifiers (
              id, asset_id, identifier_type, value, label
            ) values (
              ${identifier.id}, ${identifier.assetId},
              ${identifier.identifierType}, ${identifier.value},
              ${identifier.label}
            )
          `;
        }

        await tx`
          insert into public.asset_replacements (
            id, replaced_asset_id, replacement_asset_id,
            replaced_by_user_id, replaced_at
          ) values (
            ${relation.id}, ${relation.replacedAssetId},
            ${relation.replacementAssetId}, ${relation.replacedByUserId},
            ${relation.replacedAt}
          )
        `;

        const rows = await tx<{ id: string }[]>`
          update public.assets
          set
            status = ${replaced.status},
            version = ${replaced.version},
            updated_at = now()
          where id = ${current.id}
            and version = ${current.version}
            and status = ${current.status}
          returning id
        `;

        if (rows.length === 0) {
          throw new DomainError(
            'ASSET_VERSION_CONFLICT',
            'Asset changed before replacement completed.',
          );
        }
      });
    });
  }

  async getReplacementByReplacedAssetId(
    assetId: AssetId,
  ): Promise<AssetReplacement | null> {
    const rows = await this.sql<AssetReplacementRow[]>`
      select
        id, replaced_asset_id, replacement_asset_id,
        replaced_by_user_id, replaced_at
      from public.asset_replacements
      where replaced_asset_id = ${assetId}
      limit 1
    `;
    return rows.length === 0 ? null : mapReplacement(rows[0]!);
  }

  async getReplacementByReplacementAssetId(
    assetId: AssetId,
  ): Promise<AssetReplacement | null> {
    const rows = await this.sql<AssetReplacementRow[]>`
      select
        id, replaced_asset_id, replacement_asset_id,
        replaced_by_user_id, replaced_at
      from public.asset_replacements
      where replacement_asset_id = ${assetId}
      limit 1
    `;
    return rows.length === 0 ? null : mapReplacement(rows[0]!);
  }
}
