import type postgres from 'postgres';
import type {
  InspectionRepository,
  SaveInspectionSectionResult,
} from '@portfolio/application';
import {
  DomainError,
  asDateOnly,
  asInspectionFindingId,
  asInspectionId,
  asInspectionResponseId,
  asInspectionSchemaItemId,
  asInspectionSchemaSectionId,
  asInspectionSchemaVersionId,
  asTenancyId,
  asUnitId,
  asUserId,
  type Inspection,
  type InspectionAnswerValue,
  type InspectionCondition,
  type InspectionFinding,
  type InspectionFindingSeverity,
  type InspectionId,
  type InspectionItemType,
  type InspectionOption,
  type InspectionResponse,
  type InspectionSchemaStatus,
  type InspectionSchemaVersion,
  type InspectionSchemaVersionId,
  type InspectionStatus,
  type InspectionType,
  type UnitId,
} from '@portfolio/domain';

type Sql = ReturnType<typeof postgres>;

interface PgError {
  code?: string;
  constraint_name?: string;
}

interface InspectionRow {
  id: string;
  code: string;
  inspection_type: InspectionType;
  unit_id: string;
  tenancy_id: string | null;
  schema_version_id: string;
  assigned_to_user_id: string;
  created_by_user_id: string;
  scheduled_for: string | Date | null;
  status: InspectionStatus;
  started_at: string | Date | null;
  locked_at: string | Date | null;
  finalized_at: string | Date | null;
  cancelled_at: string | Date | null;
  version: number;
}

interface SchemaRow {
  id: string;
  schema_code: string;
  version_number: number;
  inspection_type: InspectionType;
  title: string;
  status: InspectionSchemaStatus;
}

interface SectionRow {
  id: string;
  schema_version_id: string;
  section_key: string;
  title: string;
  description: string | null;
  sort_order: number;
}

interface ItemRow {
  id: string;
  schema_version_id: string;
  section_id: string;
  item_key: string;
  item_type: InspectionItemType;
  label: string;
  required: boolean;
  sort_order: number;
  options: InspectionOption[];
  visible_when: InspectionCondition | null;
  required_when: InspectionCondition | null;
}

interface ResponseRow {
  id: string;
  inspection_id: string;
  section_id: string;
  item_id: string;
  value: InspectionAnswerValue;
  comment: string | null;
  updated_by_user_id: string;
  updated_at: string | Date;
}

interface FindingRow {
  id: string;
  inspection_id: string;
  section_id: string;
  item_id: string | null;
  severity: InspectionFindingSeverity;
  title: string;
  description: string | null;
  created_by_user_id: string;
  created_at: string | Date;
}

const inspectionSelect = `
  select
    id, code, inspection_type, unit_id, tenancy_id, schema_version_id,
    assigned_to_user_id, created_by_user_id, scheduled_for, status,
    started_at, locked_at, finalized_at, cancelled_at, version
  from public.inspections
`;

function dateOnly(value: string | Date | null) {
  if (value === null) return null;
  return asDateOnly(value instanceof Date ? value.toISOString().slice(0, 10) : value);
}

function instant(value: string | Date | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function mapInspection(row: InspectionRow): Inspection {
  return {
    id: asInspectionId(row.id),
    code: row.code,
    inspectionType: row.inspection_type,
    unitId: asUnitId(row.unit_id),
    tenancyId: row.tenancy_id === null ? null : asTenancyId(row.tenancy_id),
    schemaVersionId: asInspectionSchemaVersionId(row.schema_version_id),
    assignedToUserId: asUserId(row.assigned_to_user_id),
    createdByUserId: asUserId(row.created_by_user_id),
    scheduledFor: dateOnly(row.scheduled_for),
    status: row.status,
    startedAt: instant(row.started_at),
    lockedAt: instant(row.locked_at),
    finalizedAt: instant(row.finalized_at),
    cancelledAt: instant(row.cancelled_at),
    version: row.version,
  };
}

function mapResponse(row: ResponseRow): InspectionResponse {
  return {
    id: asInspectionResponseId(row.id),
    inspectionId: asInspectionId(row.inspection_id),
    sectionId: asInspectionSchemaSectionId(row.section_id),
    itemId: asInspectionSchemaItemId(row.item_id),
    value: row.value,
    comment: row.comment,
    updatedByUserId: asUserId(row.updated_by_user_id),
    updatedAt: instant(row.updated_at)!,
  };
}

function mapFinding(row: FindingRow): InspectionFinding {
  return {
    id: asInspectionFindingId(row.id),
    inspectionId: asInspectionId(row.inspection_id),
    sectionId: asInspectionSchemaSectionId(row.section_id),
    itemId:
      row.item_id === null ? null : asInspectionSchemaItemId(row.item_id),
    severity: row.severity,
    title: row.title,
    description: row.description,
    createdByUserId: asUserId(row.created_by_user_id),
    createdAt: instant(row.created_at)!,
  };
}

function translate(error: unknown): DomainError | null {
  const pg = error as PgError;
  if (pg.code === '23505') {
    switch (pg.constraint_name) {
      case 'inspections_code_uq':
        return new DomainError(
          'INSPECTION_CODE_ALREADY_EXISTS',
          'Inspection code already exists.',
        );
      case 'inspection_schema_versions_code_version_uq':
        return new DomainError(
          'INSPECTION_SCHEMA_VERSION_CONFLICT',
          'Inspection schema version number was allocated concurrently.',
        );
      default:
        return null;
    }
  }

  if (pg.code === '23514') {
    switch (pg.constraint_name) {
      case 'inspection_content_locked':
        return new DomainError(
          'INSPECTION_CONTENT_LOCKED',
          'Inspection content is no longer editable.',
        );
      case 'inspections_schema_published':
        return new DomainError(
          'INSPECTION_SCHEMA_NOT_PUBLISHED',
          'New inspections require a published schema version.',
        );
      case 'inspections_schema_type_match':
        return new DomainError(
          'INSPECTION_SCHEMA_TYPE_MISMATCH',
          'Inspection type must match schema type.',
        );
      case 'inspections_assignee_active':
        return new DomainError(
          'INSPECTION_ASSIGNEE_NOT_ACTIVE',
          'Inspection assignee must be active.',
        );
      case 'inspection_response_type_match':
        return new DomainError(
          'INSPECTION_RESPONSE_TYPE_MISMATCH',
          'Inspection response type does not match schema item type.',
        );
      case 'inspection_response_option_match':
        return new DomainError(
          'INSPECTION_RESPONSE_INVALID_OPTION',
          'Inspection response is not a configured option.',
        );
      case 'inspection_schema_structure_immutable':
      case 'inspection_schema_version_immutable':
        return new DomainError(
          'INSPECTION_SCHEMA_IMMUTABLE',
          'Published inspection schema content is immutable.',
        );
      default:
        return null;
    }
  }

  return null;
}

async function translated<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    const mapped = translate(error);
    if (mapped) throw mapped;
    throw error;
  }
}

export class PostgresInspectionRepository implements InspectionRepository {
  constructor(private readonly sql: Sql) {}

  async getById(id: InspectionId): Promise<Inspection | null> {
    const rows = await this.sql<InspectionRow[]>`
      ${this.sql.unsafe(inspectionSelect)}
      where id = ${id}
      limit 1
    `;
    return rows.length === 0 ? null : mapInspection(rows[0]!);
  }

  async listByUnit(unitId: UnitId): Promise<readonly Inspection[]> {
    const rows = await this.sql<InspectionRow[]>`
      ${this.sql.unsafe(inspectionSelect)}
      where unit_id = ${unitId}
      order by scheduled_for desc nulls last, created_at desc, id
    `;
    return rows.map(mapInspection);
  }

  async codeExists(code: string): Promise<boolean> {
    const rows = await this.sql<{ exists: boolean }[]>`
      select exists(
        select 1 from public.inspections where lower(code) = lower(${code})
      ) as exists
    `;
    return rows[0]?.exists ?? false;
  }

  async insert(
    inspection: Inspection,
    schema: InspectionSchemaVersion,
  ): Promise<void> {
    await translated(async () => {
      await this.sql.begin(async (tx) => {
        await tx`
          insert into public.inspections (
            id, code, inspection_type, unit_id, tenancy_id, schema_version_id,
            assigned_to_user_id, created_by_user_id, scheduled_for, status,
            started_at, locked_at, finalized_at, cancelled_at, version
          ) values (
            ${inspection.id}, ${inspection.code}, ${inspection.inspectionType},
            ${inspection.unitId}, ${inspection.tenancyId}, ${inspection.schemaVersionId},
            ${inspection.assignedToUserId}, ${inspection.createdByUserId},
            ${inspection.scheduledFor}, ${inspection.status},
            ${inspection.startedAt}, ${inspection.lockedAt},
            ${inspection.finalizedAt}, ${inspection.cancelledAt},
            ${inspection.version}
          )
        `;

        for (const section of schema.sections) {
          await tx`
            insert into public.inspection_section_states (
              inspection_id, schema_version_id, section_id, revision
            ) values (
              ${inspection.id}, ${inspection.schemaVersionId}, ${section.id}, 0
            )
          `;
        }
      });
    });
  }

  async updateLifecycle(
    inspection: Inspection,
    expectedVersion: number,
  ): Promise<void> {
    const rows = await translated(() => this.sql<{ id: string }[]>`
      update public.inspections
      set
        status = ${inspection.status},
        started_at = ${inspection.startedAt},
        locked_at = ${inspection.lockedAt},
        finalized_at = ${inspection.finalizedAt},
        cancelled_at = ${inspection.cancelledAt},
        version = ${inspection.version},
        updated_at = now()
      where id = ${inspection.id}
        and version = ${expectedVersion}
      returning id
    `);

    if (rows.length === 0) {
      throw new DomainError(
        'INSPECTION_VERSION_CONFLICT',
        'Inspection was modified concurrently.',
      );
    }
  }

  async getSectionRevision(
    inspectionId: InspectionId,
    sectionId: import('@portfolio/domain').InspectionSchemaSectionId,
  ): Promise<number | null> {
    const rows = await this.sql<{ revision: number }[]>`
      select revision
      from public.inspection_section_states
      where inspection_id = ${inspectionId}
        and section_id = ${sectionId}
      limit 1
    `;
    return rows[0]?.revision ?? null;
  }

  async saveSection(
    inspectionId: InspectionId,
    sectionId: import('@portfolio/domain').InspectionSchemaSectionId,
    expectedRevision: number,
    responses: readonly InspectionResponse[],
  ): Promise<SaveInspectionSectionResult> {
    return translated(async () =>
      this.sql.begin(async (tx) => {
        const revisionRows = await tx<{ revision: number }[]>`
          update public.inspection_section_states
          set revision = revision + 1
          where inspection_id = ${inspectionId}
            and section_id = ${sectionId}
            and revision = ${expectedRevision}
          returning revision
        `;

        const revision = revisionRows[0]?.revision;
        if (revision === undefined) {
          throw new DomainError(
            'INSPECTION_SECTION_REVISION_CONFLICT',
            'Inspection section was modified concurrently.',
          );
        }

        const persisted: InspectionResponse[] = [];
        for (const response of responses) {
          const rows = await tx<ResponseRow[]>`
            insert into public.inspection_responses (
              id, inspection_id, schema_version_id, section_id, item_id,
              value, comment, updated_by_user_id, updated_at
            )
            select
              ${response.id},
              ${response.inspectionId},
              i.schema_version_id,
              ${response.sectionId},
              ${response.itemId},
              ${this.sql.json(response.value)},
              ${response.comment},
              ${response.updatedByUserId},
              ${response.updatedAt}
            from public.inspections i
            where i.id = ${response.inspectionId}
            on conflict (inspection_id, item_id)
            do update set
              value = excluded.value,
              comment = excluded.comment,
              updated_by_user_id = excluded.updated_by_user_id,
              updated_at = excluded.updated_at
            returning
              id, inspection_id, section_id, item_id, value,
              comment, updated_by_user_id, updated_at
          `;
          persisted.push(mapResponse(rows[0]!));
        }

        return { revision, responses: persisted };
      }),
    );
  }

  async listResponses(
    inspectionId: InspectionId,
  ): Promise<readonly InspectionResponse[]> {
    const rows = await this.sql<ResponseRow[]>`
      select
        id, inspection_id, section_id, item_id, value,
        comment, updated_by_user_id, updated_at
      from public.inspection_responses
      where inspection_id = ${inspectionId}
      order by section_id, item_id
    `;
    return rows.map(mapResponse);
  }

  async insertFinding(finding: InspectionFinding): Promise<void> {
    const inspection = await this.getById(finding.inspectionId);
    if (!inspection) {
      throw new DomainError('INSPECTION_NOT_FOUND', 'Inspection not found.');
    }

    await translated(async () => {
      await this.sql`
        insert into public.inspection_findings (
          id, inspection_id, schema_version_id, section_id, item_id,
          severity, title, description, created_by_user_id, created_at
        ) values (
          ${finding.id}, ${finding.inspectionId}, ${inspection.schemaVersionId},
          ${finding.sectionId}, ${finding.itemId}, ${finding.severity},
          ${finding.title}, ${finding.description},
          ${finding.createdByUserId}, ${finding.createdAt}
        )
      `;
    });
  }

  async listFindings(
    inspectionId: InspectionId,
  ): Promise<readonly InspectionFinding[]> {
    const rows = await this.sql<FindingRow[]>`
      select
        id, inspection_id, section_id, item_id, severity,
        title, description, created_by_user_id, created_at
      from public.inspection_findings
      where inspection_id = ${inspectionId}
      order by created_at, id
    `;
    return rows.map(mapFinding);
  }

  async getSchemaVersionById(
    id: InspectionSchemaVersionId,
  ): Promise<InspectionSchemaVersion | null> {
    const schemaRows = await this.sql<SchemaRow[]>`
      select id, schema_code, version_number, inspection_type, title, status
      from public.inspection_schema_versions
      where id = ${id}
      limit 1
    `;
    const schema = schemaRows[0];
    if (!schema) return null;

    const sections = await this.sql<SectionRow[]>`
      select id, schema_version_id, section_key, title, description, sort_order
      from public.inspection_schema_sections
      where schema_version_id = ${id}
      order by sort_order, id
    `;

    const items = await this.sql<ItemRow[]>`
      select
        id, schema_version_id, section_id, item_key, item_type, label,
        required, sort_order, options, visible_when, required_when
      from public.inspection_schema_items
      where schema_version_id = ${id}
      order by section_id, sort_order, id
    `;

    return {
      id: asInspectionSchemaVersionId(schema.id),
      schemaCode: schema.schema_code,
      versionNumber: schema.version_number,
      inspectionType: schema.inspection_type,
      title: schema.title,
      status: schema.status,
      sections: sections.map((section) => ({
        id: asInspectionSchemaSectionId(section.id),
        key: section.section_key,
        title: section.title,
        description: section.description,
        sortOrder: section.sort_order,
        items: items
          .filter((item) => item.section_id === section.id)
          .map((item) => ({
            id: asInspectionSchemaItemId(item.id),
            sectionId: asInspectionSchemaSectionId(item.section_id),
            key: item.item_key,
            type: item.item_type,
            label: item.label,
            required: item.required,
            sortOrder: item.sort_order,
            options: item.options,
            visibleWhen: item.visible_when,
            requiredWhen: item.required_when,
          })),
      })),
    };
  }

  async listSchemaVersions(): Promise<readonly InspectionSchemaVersion[]> {
    const rows = await this.sql<{ id: string }[]>`
      select id
      from public.inspection_schema_versions
      order by lower(schema_code), version_number desc
    `;
    const result: InspectionSchemaVersion[] = [];
    for (const row of rows) {
      const schema = await this.getSchemaVersionById(
        asInspectionSchemaVersionId(row.id),
      );
      if (schema) result.push(schema);
    }
    return result;
  }

  async latestSchemaVersionNumber(schemaCode: string): Promise<number> {
    const rows = await this.sql<{ latest: number }[]>`
      select coalesce(max(version_number), 0)::integer as latest
      from public.inspection_schema_versions
      where lower(schema_code) = lower(${schemaCode})
    `;
    return rows[0]?.latest ?? 0;
  }

  async insertSchemaVersion(schema: InspectionSchemaVersion): Promise<void> {
    await translated(async () => {
      await this.sql.begin(async (tx) => {
        await tx`
          insert into public.inspection_schema_versions (
            id, schema_code, version_number, inspection_type, title, status
          ) values (
            ${schema.id}, ${schema.schemaCode}, ${schema.versionNumber},
            ${schema.inspectionType}, ${schema.title}, ${schema.status}
          )
        `;

        for (const section of schema.sections) {
          await tx`
            insert into public.inspection_schema_sections (
              id, schema_version_id, section_key, title, description, sort_order
            ) values (
              ${section.id}, ${schema.id}, ${section.key},
              ${section.title}, ${section.description}, ${section.sortOrder}
            )
          `;

          for (const item of section.items) {
            await tx`
              insert into public.inspection_schema_items (
                id, schema_version_id, section_id, item_key, item_type,
                label, required, sort_order, options, visible_when, required_when
              ) values (
                ${item.id}, ${schema.id}, ${section.id}, ${item.key},
                ${item.type}, ${item.label}, ${item.required},
                ${item.sortOrder}, ${this.sql.json(item.options)},
                ${item.visibleWhen === null ? null : this.sql.json(item.visibleWhen)},
                ${item.requiredWhen === null ? null : this.sql.json(item.requiredWhen)}
              )
            `;
          }
        }
      });
    });
  }

  async updateSchemaVersionStatus(
    schema: InspectionSchemaVersion,
  ): Promise<void> {
    const rows = await translated(() => this.sql<{ id: string }[]>`
      update public.inspection_schema_versions
      set status = ${schema.status}
      where id = ${schema.id}
        and (
          (status = 'draft' and ${schema.status} = 'published')
          or (status = 'published' and ${schema.status} = 'retired')
        )
      returning id
    `);
    if (rows.length === 0) {
      throw new DomainError(
        'INSPECTION_SCHEMA_VERSION_CONFLICT',
        'Inspection schema lifecycle changed concurrently.',
      );
    }
  }
}
