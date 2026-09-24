import type postgres from 'postgres';
import type {
  DocumentReadTarget,
  DocumentRepository,
  StorageObjectReference,
  TargetDocumentReference,
} from '@portfolio/application';
import {
  DomainError,
  asDocumentId,
  asDocumentLinkId,
  asDocumentVersionId,
  asLeaseAgreementId,
  asLeaseAmendmentId,
  asPartyId,
  asPropertyId,
  asTenancyId,
  asUnitId,
  type Document,
  type DocumentCategory,
  type DocumentId,
  type DocumentLink,
  type DocumentLinkRelation,
  type DocumentStatus,
  type DocumentTargetType,
  type DocumentVersion,
  type DocumentVersionId,
  type DocumentVersionStatus,
} from '@portfolio/domain';

type Sql = ReturnType<typeof postgres>;

interface PostgresErrorLike {
  code?: string;
  constraint_name?: string;
}

interface DocumentRow {
  id: string;
  code: string;
  title: string;
  category: DocumentCategory;
  status: DocumentStatus;
  latest_version_number: number;
  revision: number;
}

interface VersionRow {
  id: string;
  document_id: string;
  version_number: number;
  file_name: string;
  mime_type: string;
  byte_size: string | number;
  sha256: string;
  status: DocumentVersionStatus;
  finalized_at: string | Date | null;
  storage_provider: string;
  storage_object_id: string;
  storage_object_key: string;
}

interface LinkRow {
  id: string;
  document_id: string;
  document_version_id: string | null;
  relation: DocumentLinkRelation;
  target_type: DocumentTargetType;
  property_id: string | null;
  unit_id: string | null;
  party_id: string | null;
  tenancy_id: string | null;
  lease_agreement_id: string | null;
  lease_amendment_id: string | null;
}

interface TargetDocumentReferenceRow {
  link_id: string;
  document_id: string;
  document_version_id: string | null;
  relation: DocumentLinkRelation;
  document_code: string;
  document_title: string;
  document_category: DocumentCategory;
  document_status: DocumentStatus;
  document_latest_version_number: number;
  document_revision: number;
  linked_version_id: string | null;
  linked_version_document_id: string | null;
  linked_version_number: number | null;
  linked_file_name: string | null;
  linked_mime_type: string | null;
  linked_byte_size: string | number | null;
  linked_sha256: string | null;
  linked_status: DocumentVersionStatus | null;
  linked_finalized_at: string | Date | null;
  linked_storage_provider: string | null;
  linked_storage_object_id: string | null;
  linked_storage_object_key: string | null;
}

const mapDocument = (row: DocumentRow): Document => ({
  id: asDocumentId(row.id),
  code: row.code,
  title: row.title,
  category: row.category,
  status: row.status,
  latestVersionNumber: row.latest_version_number,
  revision: row.revision,
});

const isoInstant = (value: string | Date | null): string | null =>
  value === null
    ? null
    : value instanceof Date
      ? value.toISOString()
      : new Date(value).toISOString();

const mapVersion = (row: VersionRow): DocumentVersion => ({
  id: asDocumentVersionId(row.id),
  documentId: asDocumentId(row.document_id),
  versionNumber: row.version_number,
  fileName: row.file_name,
  mimeType: row.mime_type,
  byteSize: Number(row.byte_size),
  sha256: row.sha256,
  status: row.status,
  finalizedAt: isoInstant(row.finalized_at),
});

function targetId(row: LinkRow): string {
  const value =
    row.property_id ??
    row.unit_id ??
    row.party_id ??
    row.tenancy_id ??
    row.lease_agreement_id ??
    row.lease_amendment_id;
  if (!value) throw new Error('Persisted document link has no target.');
  return value;
}

const mapLink = (row: LinkRow): DocumentLink => {
  const common = {
    id: asDocumentLinkId(row.id),
    documentId: asDocumentId(row.document_id),
    documentVersionId:
      row.document_version_id === null
        ? null
        : asDocumentVersionId(row.document_version_id),
    relation: row.relation,
  };

  const id = targetId(row);
  switch (row.target_type) {
    case 'property':
      return { ...common, targetType: 'property', targetId: asPropertyId(id) };
    case 'unit':
      return { ...common, targetType: 'unit', targetId: asUnitId(id) };
    case 'party':
      return { ...common, targetType: 'party', targetId: asPartyId(id) };
    case 'tenancy':
      return { ...common, targetType: 'tenancy', targetId: asTenancyId(id) };
    case 'lease_agreement':
      return {
        ...common,
        targetType: 'lease_agreement',
        targetId: asLeaseAgreementId(id),
      };
    case 'lease_amendment':
      return {
        ...common,
        targetType: 'lease_amendment',
        targetId: asLeaseAmendmentId(id),
      };
  }
};

function translateDocumentError(error: unknown): DomainError | null {
  const pg = error as PostgresErrorLike;

  if (pg.code === '23505') {
    switch (pg.constraint_name) {
      case 'documents_code_uq':
        return new DomainError(
          'DOCUMENT_CODE_ALREADY_EXISTS',
          'Document code already exists.',
        );
      case 'document_links_signed_agreement_uq':
      case 'document_links_signed_amendment_uq':
        return new DomainError(
          'DOCUMENT_SIGNED_ORIGINAL_ALREADY_EXISTS',
          'This legal record already has a signed original document.',
        );
      case 'document_links_identity_uq':
        return new DomainError(
          'DOCUMENT_LINK_ALREADY_EXISTS',
          'This document link already exists.',
        );
      default:
        break;
    }
  }

  if (pg.code === '23514') {
    switch (pg.constraint_name) {
      case 'document_links_signed_original_version_final':
        return new DomainError(
          'DOCUMENT_SIGNED_ORIGINAL_VERSION_NOT_FINAL',
          'signed_original requires a finalized immutable document version.',
        );
      case 'document_links_signed_original_agreement_signed':
      case 'document_links_signed_original_amendment_signed':
        return new DomainError(
          'DOCUMENT_SIGNED_ORIGINAL_TARGET_NOT_FINAL',
          'A signed original may only be linked to a signed legal record.',
        );
      default:
        break;
    }
  }

  return null;
}

async function withTranslatedErrors<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    const translated = translateDocumentError(error);
    if (translated) throw translated;
    throw error;
  }
}

const versionSelect = `
  select
    id, document_id, version_number, file_name, mime_type,
    byte_size, sha256, status, finalized_at,
    storage_provider, storage_object_id, storage_object_key
  from public.document_versions
`;

const linkSelect = `
  select
    id, document_id, document_version_id, relation, target_type,
    property_id, unit_id, party_id, tenancy_id,
    lease_agreement_id, lease_amendment_id
  from public.document_links
`;

const targetDocumentReferenceSelect = `
  select
    l.id as link_id,
    l.document_id,
    l.document_version_id,
    l.relation,
    d.code as document_code,
    d.title as document_title,
    d.category as document_category,
    d.status as document_status,
    d.latest_version_number as document_latest_version_number,
    d.revision as document_revision,
    v.id as linked_version_id,
    v.document_id as linked_version_document_id,
    v.version_number as linked_version_number,
    v.file_name as linked_file_name,
    v.mime_type as linked_mime_type,
    v.byte_size as linked_byte_size,
    v.sha256 as linked_sha256,
    v.status as linked_status,
    v.finalized_at as linked_finalized_at,
    v.storage_provider as linked_storage_provider,
    v.storage_object_id as linked_storage_object_id,
    v.storage_object_key as linked_storage_object_key
  from public.document_links l
  join public.documents d
    on d.id = l.document_id
  left join public.document_versions v
    on v.id = l.document_version_id
`;

const targetDocumentReferenceOrder = `
  order by lower(d.code), d.id, l.created_at, l.id
`;

function mapTargetDocumentReference(
  row: TargetDocumentReferenceRow,
  target: DocumentReadTarget,
): TargetDocumentReference {
  const linkedVersion =
    row.linked_version_id === null
      ? null
      : mapVersion({
          id: row.linked_version_id,
          document_id: row.linked_version_document_id!,
          version_number: row.linked_version_number!,
          file_name: row.linked_file_name!,
          mime_type: row.linked_mime_type!,
          byte_size: row.linked_byte_size!,
          sha256: row.linked_sha256!,
          status: row.linked_status!,
          finalized_at: row.linked_finalized_at,
          storage_provider: row.linked_storage_provider!,
          storage_object_id: row.linked_storage_object_id!,
          storage_object_key: row.linked_storage_object_key!,
        });

  return {
    document: mapDocument({
      id: row.document_id,
      code: row.document_code,
      title: row.document_title,
      category: row.document_category,
      status: row.document_status,
      latest_version_number: row.document_latest_version_number,
      revision: row.document_revision,
    }),
    link: {
      id: asDocumentLinkId(row.link_id),
      documentId: asDocumentId(row.document_id),
      documentVersionId:
        row.document_version_id === null
          ? null
          : asDocumentVersionId(row.document_version_id),
      relation: row.relation,
      ...target,
    } as DocumentLink,
    linkedVersion,
  };
}

export class PostgresDocumentRepository implements DocumentRepository {
  constructor(private readonly sql: Sql) {}

  async getDocumentById(id: DocumentId): Promise<Document | null> {
    const rows = await this.sql<DocumentRow[]>`
      select
        id, code, title, category, status, latest_version_number, revision
      from public.documents
      where id = ${id}
      limit 1
    `;
    return rows.length === 0 ? null : mapDocument(rows[0]!);
  }

  async listDocuments(): Promise<readonly Document[]> {
    const rows = await this.sql<DocumentRow[]>`
      select
        id, code, title, category, status, latest_version_number, revision
      from public.documents
      order by lower(code), id
    `;
    return rows.map(mapDocument);
  }

  async documentCodeExists(code: string): Promise<boolean> {
    const rows = await this.sql<{ exists: boolean }[]>`
      select exists(
        select 1
        from public.documents
        where lower(code) = lower(${code})
      ) as exists
    `;
    return rows[0]?.exists ?? false;
  }

  async insertDocument(document: Document): Promise<void> {
    await withTranslatedErrors(async () => {
      await this.sql`
        insert into public.documents (
          id, code, title, category, status, latest_version_number, revision
        ) values (
          ${document.id}, ${document.code}, ${document.title},
          ${document.category}, ${document.status},
          ${document.latestVersionNumber}, ${document.revision}
        )
      `;
    });
  }

  async getVersionById(
    id: DocumentVersionId,
  ): Promise<DocumentVersion | null> {
    const rows = await this.sql<VersionRow[]>`
      ${this.sql.unsafe(versionSelect)}
      where id = ${id}
      limit 1
    `;
    return rows.length === 0 ? null : mapVersion(rows[0]!);
  }

  async listVersionsByDocument(
    documentId: DocumentId,
  ): Promise<readonly DocumentVersion[]> {
    const rows = await this.sql<VersionRow[]>`
      ${this.sql.unsafe(versionSelect)}
      where document_id = ${documentId}
      order by version_number
    `;
    return rows.map(mapVersion);
  }

  async insertVersion(
    document: Document,
    expectedDocumentRevision: number,
    version: DocumentVersion,
    storage: StorageObjectReference,
  ): Promise<void> {
    await withTranslatedErrors(async () => {
      await this.sql.begin(async (tx) => {
        const updated = await tx<{ id: string }[]>`
          update public.documents
          set
            latest_version_number = ${document.latestVersionNumber},
            revision = ${document.revision},
            updated_at = now()
          where id = ${document.id}
            and status = 'active'
            and revision = ${expectedDocumentRevision}
          returning id
        `;

        if (updated.length === 0) {
          throw new DomainError(
            'DOCUMENT_VERSION_CONFLICT',
            'Document changed before the new version could be registered.',
          );
        }

        await tx`
          insert into public.document_versions (
            id, document_id, version_number, file_name, mime_type,
            byte_size, sha256, status, finalized_at,
            storage_provider, storage_object_id, storage_object_key
          ) values (
            ${version.id}, ${version.documentId}, ${version.versionNumber},
            ${version.fileName}, ${version.mimeType}, ${version.byteSize},
            ${version.sha256}, ${version.status}, ${version.finalizedAt},
            ${storage.provider}, ${storage.objectId}, ${storage.objectKey}
          )
        `;
      });
    });
  }

  async finalizeVersion(version: DocumentVersion): Promise<void> {
    const rows = await this.sql<{ id: string }[]>`
      update public.document_versions
      set
        status = ${version.status},
        finalized_at = ${version.finalizedAt}
      where id = ${version.id}
        and status = 'stored'
        and finalized_at is null
      returning id
    `;

    if (rows.length === 0) {
      throw new DomainError(
        'DOCUMENT_VERSION_CONFLICT',
        'Document version changed before it could be finalized.',
      );
    }
  }

  async getStorageReference(
    versionId: DocumentVersionId,
  ): Promise<StorageObjectReference | null> {
    const rows = await this.sql<{
      storage_provider: string;
      storage_object_id: string;
      storage_object_key: string;
    }[]>`
      select
        coalesce(r.storage_provider, v.storage_provider) as storage_provider,
        coalesce(r.storage_object_id, v.storage_object_id) as storage_object_id,
        coalesce(r.storage_object_key, v.storage_object_key) as storage_object_key
      from public.document_versions v
      left join lateral (
        select
          storage_provider,
          storage_object_id,
          storage_object_key
        from public.document_version_storage_relocations
        where document_version_id = v.id
        order by generation desc
        limit 1
      ) r on true
      where v.id = ${versionId}
      limit 1
    `;

    const row = rows[0];
    return row
      ? {
          provider: row.storage_provider,
          objectId: row.storage_object_id,
          objectKey: row.storage_object_key,
        }
      : null;
  }

  async relocateStorageReference(
    versionId: DocumentVersionId,
    expectedCurrent: StorageObjectReference,
    replacement: StorageObjectReference,
    reason: string,
  ): Promise<void> {
    await this.sql.begin(async (tx) => {
      const rows = await tx<{
        generation: number;
        storage_provider: string;
        storage_object_id: string;
        storage_object_key: string;
      }[]>`
        select
          coalesce(r.generation, 0)::int as generation,
          coalesce(r.storage_provider, v.storage_provider) as storage_provider,
          coalesce(r.storage_object_id, v.storage_object_id) as storage_object_id,
          coalesce(r.storage_object_key, v.storage_object_key) as storage_object_key
        from public.document_versions v
        left join lateral (
          select
            generation,
            storage_provider,
            storage_object_id,
            storage_object_key
          from public.document_version_storage_relocations
          where document_version_id = v.id
          order by generation desc
          limit 1
        ) r on true
        where v.id = ${versionId}
        for update of v
      `;

      const current = rows[0];
      if (!current) {
        throw new DomainError(
          'DOCUMENT_VERSION_NOT_FOUND',
          'Document version not found.',
        );
      }

      if (
        current.storage_provider !== expectedCurrent.provider ||
        current.storage_object_id !== expectedCurrent.objectId ||
        current.storage_object_key !== expectedCurrent.objectKey
      ) {
        throw new DomainError(
          'DOCUMENT_STORAGE_RELOCATION_CONFLICT',
          'Document storage location changed before recovery could be committed.',
        );
      }

      await tx`
        insert into public.document_version_storage_relocations (
          document_version_id,
          generation,
          previous_storage_provider,
          previous_storage_object_id,
          previous_storage_object_key,
          storage_provider,
          storage_object_id,
          storage_object_key,
          reason
        ) values (
          ${versionId},
          ${current.generation + 1},
          ${current.storage_provider},
          ${current.storage_object_id},
          ${current.storage_object_key},
          ${replacement.provider},
          ${replacement.objectId},
          ${replacement.objectKey},
          ${reason}
        )
      `;
    });
  }

  async insertLink(link: DocumentLink): Promise<void> {
    const target = {
      propertyId: link.targetType === 'property' ? link.targetId : null,
      unitId: link.targetType === 'unit' ? link.targetId : null,
      partyId: link.targetType === 'party' ? link.targetId : null,
      tenancyId: link.targetType === 'tenancy' ? link.targetId : null,
      agreementId:
        link.targetType === 'lease_agreement' ? link.targetId : null,
      amendmentId:
        link.targetType === 'lease_amendment' ? link.targetId : null,
    };

    await withTranslatedErrors(async () => {
      await this.sql`
        insert into public.document_links (
          id, document_id, document_version_id, relation, target_type,
          property_id, unit_id, party_id, tenancy_id,
          lease_agreement_id, lease_amendment_id
        ) values (
          ${link.id}, ${link.documentId}, ${link.documentVersionId},
          ${link.relation}, ${link.targetType},
          ${target.propertyId}, ${target.unitId}, ${target.partyId},
          ${target.tenancyId}, ${target.agreementId}, ${target.amendmentId}
        )
      `;
    });
  }

  async listLinksByDocument(
    documentId: DocumentId,
  ): Promise<readonly DocumentLink[]> {
    const rows = await this.sql<LinkRow[]>`
      ${this.sql.unsafe(linkSelect)}
      where document_id = ${documentId}
      order by created_at, id
    `;
    return rows.map(mapLink);
  }

  async listTargetDocuments(
    target: DocumentReadTarget,
  ): Promise<readonly TargetDocumentReference[]> {
    let rows: TargetDocumentReferenceRow[];

    switch (target.targetType) {
      case 'unit':
        rows = await this.sql<TargetDocumentReferenceRow[]>`
          ${this.sql.unsafe(targetDocumentReferenceSelect)}
          where l.target_type = 'unit'
            and l.unit_id = ${target.targetId}
          ${this.sql.unsafe(targetDocumentReferenceOrder)}
        `;
        break;
      case 'lease_agreement':
        rows = await this.sql<TargetDocumentReferenceRow[]>`
          ${this.sql.unsafe(targetDocumentReferenceSelect)}
          where l.target_type = 'lease_agreement'
            and l.lease_agreement_id = ${target.targetId}
          ${this.sql.unsafe(targetDocumentReferenceOrder)}
        `;
        break;
      case 'lease_amendment':
        rows = await this.sql<TargetDocumentReferenceRow[]>`
          ${this.sql.unsafe(targetDocumentReferenceSelect)}
          where l.target_type = 'lease_amendment'
            and l.lease_amendment_id = ${target.targetId}
          ${this.sql.unsafe(targetDocumentReferenceOrder)}
        `;
        break;
    }

    return rows.map((row) => mapTargetDocumentReference(row, target));
  }
}
