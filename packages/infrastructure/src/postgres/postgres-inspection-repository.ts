import type postgres from 'postgres';
import type {
  InspectionRepository,
  SaveInspectionSectionResult,
} from '@portfolio/application';
import {
  DomainError,
  asDateOnly,
  asInspectionEvidenceId,
  asInspectionFinalizationId,
  asInspectionFindingId,
  asInspectionId,
  asInspectionResponseId,
  asInspectionSignatureId,
  asInspectionUnlockEventId,
  asInspectionSchemaItemId,
  asInspectionSchemaSectionId,
  asInspectionSchemaVersionId,
  asDocumentVersionId,
  asPartyId,
  asTenancyId,
  asUnitId,
  asUserId,
  type Inspection,
  type InspectionAnswerValue,
  type InspectionEvidence,
  type InspectionEvidenceType,
  type InspectionFinalization,
  type InspectionFinalSnapshot,
  type InspectionCondition,
  type InspectionFinding,
  type InspectionFindingSeverity,
  type InspectionId,
  type InspectionItemType,
  type InspectionOption,
  type InspectionResponse,
  type InspectionSectionState,
  type InspectionSignature,
  type InspectionSignatureStatus,
  type InspectionSignerRole,
  type InspectionSignerType,
  type InspectionUnlockEvent,
  type InspectionSchemaStatus,
  type InspectionSchemaVersion,
  type InspectionSchemaVersionId,
  type InspectionStatus,
  type InspectionType,
  type DocumentVersionId,
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
  content_revision: number;
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

interface EvidenceRow {
  id: string;
  inspection_id: string;
  document_version_id: string;
  evidence_type: InspectionEvidenceType;
  section_id: string | null;
  item_id: string | null;
  caption: string | null;
  created_by_user_id: string;
  created_at: string | Date;
}

interface SignatureRow {
  id: string;
  inspection_id: string;
  role: InspectionSignerRole;
  signer_type: InspectionSignerType;
  signer_user_id: string | null;
  signer_party_id: string | null;
  signer_name_snapshot: string;
  signature_document_version_id: string;
  status: InspectionSignatureStatus;
  signed_at: string | Date;
  created_by_user_id: string;
  invalidated_at: string | Date | null;
  invalidated_by_user_id: string | null;
  invalidation_reason: string | null;
}

interface UnlockEventRow {
  id: string;
  inspection_id: string;
  reason: string;
  previous_version: number;
  previous_content_revision: number;
  invalidated_signature_count: number;
  unlocked_by_user_id: string;
  unlocked_at: string | Date;
}

interface FinalizationRow {
  id: string;
  inspection_id: string;
  source_version: number;
  source_content_revision: number;
  snapshot: InspectionFinalSnapshot;
  final_report_document_version_id: string;
  finalized_by_user_id: string;
  finalized_at: string | Date;
}

type MutableJson =
  | string
  | number
  | boolean
  | null
  | MutableJson[]
  | { [key: string]: MutableJson };

function answerToJson(value: InspectionAnswerValue): MutableJson {
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  return [...value];
}

function optionsToJson(options: readonly InspectionOption[]): MutableJson {
  return options.map((option) => ({
    value: option.value,
    label: option.label,
  }));
}

function conditionValueToJson(
  value: string | boolean | readonly (string | boolean)[],
): MutableJson {
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  return [...value];
}

function conditionToJson(condition: InspectionCondition): MutableJson {
  if ('all' in condition) {
    return { all: condition.all.map(conditionToJson) };
  }
  if ('any' in condition) {
    return { any: condition.any.map(conditionToJson) };
  }

  const result: { [key: string]: MutableJson } = {
    fieldKey: condition.fieldKey,
    operator: condition.operator,
  };
  if (condition.value !== undefined) {
    result.value = conditionValueToJson(condition.value);
  }
  return result;
}

const inspectionSelect = `
  select
    id, code, inspection_type, unit_id, tenancy_id, schema_version_id,
    assigned_to_user_id, created_by_user_id, scheduled_for, status,
    started_at, locked_at, finalized_at, cancelled_at, version, content_revision
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
    contentRevision: row.content_revision,
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

function mapEvidence(row: EvidenceRow): InspectionEvidence {
  return {
    id: asInspectionEvidenceId(row.id),
    inspectionId: asInspectionId(row.inspection_id),
    documentVersionId: asDocumentVersionId(row.document_version_id),
    evidenceType: row.evidence_type,
    sectionId:
      row.section_id === null ? null : asInspectionSchemaSectionId(row.section_id),
    itemId:
      row.item_id === null ? null : asInspectionSchemaItemId(row.item_id),
    caption: row.caption,
    createdByUserId: asUserId(row.created_by_user_id),
    createdAt: instant(row.created_at)!,
  };
}

function mapSignature(row: SignatureRow): InspectionSignature {
  return {
    id: asInspectionSignatureId(row.id),
    inspectionId: asInspectionId(row.inspection_id),
    role: row.role,
    signerType: row.signer_type,
    signerUserId:
      row.signer_user_id === null ? null : asUserId(row.signer_user_id),
    signerPartyId:
      row.signer_party_id === null ? null : asPartyId(row.signer_party_id),
    signerNameSnapshot: row.signer_name_snapshot,
    signatureDocumentVersionId: asDocumentVersionId(
      row.signature_document_version_id,
    ),
    status: row.status,
    signedAt: instant(row.signed_at)!,
    createdByUserId: asUserId(row.created_by_user_id),
    invalidatedAt: instant(row.invalidated_at),
    invalidatedByUserId:
      row.invalidated_by_user_id === null
        ? null
        : asUserId(row.invalidated_by_user_id),
    invalidationReason: row.invalidation_reason,
  };
}

function mapUnlockEvent(row: UnlockEventRow): InspectionUnlockEvent {
  return {
    id: asInspectionUnlockEventId(row.id),
    inspectionId: asInspectionId(row.inspection_id),
    reason: row.reason,
    previousVersion: row.previous_version,
    previousContentRevision: row.previous_content_revision,
    invalidatedSignatureCount: row.invalidated_signature_count,
    unlockedByUserId: asUserId(row.unlocked_by_user_id),
    unlockedAt: instant(row.unlocked_at)!,
  };
}

function mapFinalization(row: FinalizationRow): InspectionFinalization {
  return {
    id: asInspectionFinalizationId(row.id),
    inspectionId: asInspectionId(row.inspection_id),
    sourceVersion: row.source_version,
    sourceContentRevision: row.source_content_revision,
    snapshot: row.snapshot,
    finalReportDocumentVersionId: asDocumentVersionId(
      row.final_report_document_version_id,
    ),
    finalizedByUserId: asUserId(row.finalized_by_user_id),
    finalizedAt: instant(row.finalized_at)!,
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
      case 'inspection_evidence_content_locked':
        return new DomainError(
          'INSPECTION_CONTENT_LOCKED',
          'Inspection evidence may only be added before lock.',
        );
      case 'inspection_evidence_document_final':
      case 'inspection_signature_document_final':
        return new DomainError(
          'INSPECTION_EVIDENCE_VERSION_NOT_FINAL',
          'Inspection evidence/signatures require a final DocumentVersion.',
        );
      case 'inspection_signature_requires_lock':
        return new DomainError(
          'INSPECTION_SIGNATURE_REQUIRES_LOCK',
          'Inspection must be locked before signing.',
        );
      case 'inspection_signature_inspector_mismatch':
        return new DomainError(
          'INSPECTION_SIGNATURE_INSPECTOR_MISMATCH',
          'Inspector signature must belong to the assigned user.',
        );
      case 'inspection_signature_tenancy_party_mismatch':
        return new DomainError(
          'INSPECTION_SIGNATURE_TENANCY_PARTY_MISMATCH',
          'Tenant signature must match tenancy party composition.',
        );
      case 'inspection_finalization_source_mismatch':
        return new DomainError(
          'INSPECTION_CONTENT_REVISION_CONFLICT',
          'Inspection changed before finalization could commit.',
        );
      case 'inspection_finalization_inspector_signature_required':
        return new DomainError(
          'INSPECTION_FINALIZATION_INSPECTOR_SIGNATURE_REQUIRED',
          'Finalization requires the assigned inspector signature.',
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
            started_at, locked_at, finalized_at, cancelled_at, version,
            content_revision
          ) values (
            ${inspection.id}, ${inspection.code}, ${inspection.inspectionType},
            ${inspection.unitId}, ${inspection.tenancyId}, ${inspection.schemaVersionId},
            ${inspection.assignedToUserId}, ${inspection.createdByUserId},
            ${inspection.scheduledFor}, ${inspection.status},
            ${inspection.startedAt}, ${inspection.lockedAt},
            ${inspection.finalizedAt}, ${inspection.cancelledAt},
            ${inspection.version}, ${inspection.contentRevision}
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
    expectedContentRevision?: number,
  ): Promise<void> {
    const rows =
      expectedContentRevision === undefined
        ? await translated(() => this.sql<{ id: string }[]>`
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
          `)
        : await translated(() => this.sql<{ id: string }[]>`
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
              and content_revision = ${expectedContentRevision}
            returning id
          `);

    if (rows.length === 0) {
      throw new DomainError(
        expectedContentRevision === undefined
          ? 'INSPECTION_VERSION_CONFLICT'
          : 'INSPECTION_CONTENT_REVISION_CONFLICT',
        expectedContentRevision === undefined
          ? 'Inspection was modified concurrently.'
          : 'Inspection content changed while the lock was being validated.',
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

  async listSectionStates(
    inspectionId: InspectionId,
  ): Promise<readonly InspectionSectionState[]> {
    const rows = await this.sql<{
      inspection_id: string;
      section_id: string;
      revision: number;
    }[]>`
      select inspection_id, section_id, revision
      from public.inspection_section_states
      where inspection_id = ${inspectionId}
      order by section_id
    `;
    return rows.map((row) => ({
      inspectionId: asInspectionId(row.inspection_id),
      sectionId: asInspectionSchemaSectionId(row.section_id),
      revision: row.revision,
    }));
  }

  async saveSection(
    inspectionId: InspectionId,
    sectionId: import('@portfolio/domain').InspectionSchemaSectionId,
    expectedRevision: number,
    responses: readonly InspectionResponse[],
    clearItemIds: readonly import('@portfolio/domain').InspectionSchemaItemId[],
  ): Promise<SaveInspectionSectionResult> {
    return translated(async () =>
      this.sql.begin(async (tx) => {
        const contentRows = await tx<{ content_revision: number }[]>`
          update public.inspections
          set
            content_revision = content_revision + 1,
            updated_at = now()
          where id = ${inspectionId}
            and status in ('draft', 'in_progress')
          returning content_revision
        `;

        const contentRevision = contentRows[0]?.content_revision;
        if (contentRevision === undefined) {
          throw new DomainError(
            'INSPECTION_CONTENT_LOCKED',
            'Inspection content is no longer editable.',
          );
        }

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

        for (const itemId of clearItemIds) {
          await tx`
            delete from public.inspection_responses
            where inspection_id = ${inspectionId}
              and item_id = ${itemId}
          `;
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
              ${this.sql.json(answerToJson(response.value))},
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

        return {
          revision,
          contentRevision,
          responses: persisted,
          clearedItemIds: [...clearItemIds],
        };
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

  async insertFinding(finding: InspectionFinding): Promise<number> {
    return translated(async () =>
      this.sql.begin(async (tx) => {
        const contentRows = await tx<{
          content_revision: number;
          schema_version_id: string;
        }[]>`
          update public.inspections
          set
            content_revision = content_revision + 1,
            updated_at = now()
          where id = ${finding.inspectionId}
            and status in ('draft', 'in_progress')
          returning content_revision, schema_version_id
        `;

        const row = contentRows[0];
        if (!row) {
          throw new DomainError(
            'INSPECTION_CONTENT_LOCKED',
            'Inspection content is no longer editable.',
          );
        }

        await tx`
          insert into public.inspection_findings (
            id, inspection_id, schema_version_id, section_id, item_id,
            severity, title, description, created_by_user_id, created_at
          ) values (
            ${finding.id}, ${finding.inspectionId}, ${row.schema_version_id},
            ${finding.sectionId}, ${finding.itemId}, ${finding.severity},
            ${finding.title}, ${finding.description},
            ${finding.createdByUserId}, ${finding.createdAt}
          )
        `;

        return row.content_revision;
      }),
    );
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

  async insertEvidence(evidence: InspectionEvidence): Promise<number> {
    return translated(async () =>
      this.sql.begin(async (tx) => {
        await tx`
          insert into public.inspection_evidence (
            id, inspection_id, schema_version_id, section_id, item_id,
            document_version_id, evidence_type, caption,
            created_by_user_id, created_at
          )
          select
            ${evidence.id}, i.id, i.schema_version_id,
            ${evidence.sectionId}, ${evidence.itemId},
            ${evidence.documentVersionId}, ${evidence.evidenceType},
            ${evidence.caption}, ${evidence.createdByUserId},
            ${evidence.createdAt}
          from public.inspections i
          where i.id = ${evidence.inspectionId}
        `;

        const rows = await tx<{ content_revision: number }[]>`
          select content_revision
          from public.inspections
          where id = ${evidence.inspectionId}
        `;
        return rows[0]!.content_revision;
      }),
    );
  }

  async listEvidence(
    inspectionId: InspectionId,
  ): Promise<readonly InspectionEvidence[]> {
    const rows = await this.sql<EvidenceRow[]>`
      select
        id, inspection_id, document_version_id, evidence_type,
        section_id, item_id, caption, created_by_user_id, created_at
      from public.inspection_evidence
      where inspection_id = ${inspectionId}
      order by created_at, id
    `;
    return rows.map(mapEvidence);
  }

  async insertSignature(signature: InspectionSignature): Promise<number> {
    return translated(async () =>
      this.sql.begin(async (tx) => {
        await tx`
          insert into public.inspection_signatures (
            id, inspection_id, role, signer_type, signer_user_id,
            signer_party_id, signer_name_snapshot,
            signature_document_version_id, status, signed_at,
            created_by_user_id, invalidated_at,
            invalidated_by_user_id, invalidation_reason
          ) values (
            ${signature.id}, ${signature.inspectionId}, ${signature.role},
            ${signature.signerType}, ${signature.signerUserId},
            ${signature.signerPartyId}, ${signature.signerNameSnapshot},
            ${signature.signatureDocumentVersionId}, ${signature.status},
            ${signature.signedAt}, ${signature.createdByUserId},
            ${signature.invalidatedAt}, ${signature.invalidatedByUserId},
            ${signature.invalidationReason}
          )
        `;

        const rows = await tx<{ content_revision: number }[]>`
          select content_revision
          from public.inspections
          where id = ${signature.inspectionId}
        `;
        return rows[0]!.content_revision;
      }),
    );
  }

  async listSignatures(
    inspectionId: InspectionId,
  ): Promise<readonly InspectionSignature[]> {
    const rows = await this.sql<SignatureRow[]>`
      select
        id, inspection_id, role, signer_type, signer_user_id,
        signer_party_id, signer_name_snapshot,
        signature_document_version_id, status, signed_at,
        created_by_user_id, invalidated_at,
        invalidated_by_user_id, invalidation_reason
      from public.inspection_signatures
      where inspection_id = ${inspectionId}
      order by signed_at, id
    `;
    return rows.map(mapSignature);
  }

  async unlock(
    inspection: Inspection,
    expectedVersion: number,
    expectedContentRevision: number,
    event: InspectionUnlockEvent,
  ): Promise<void> {
    await translated(async () => {
      await this.sql.begin(async (tx) => {
        const current = await tx<{
          version: number;
          content_revision: number;
          status: InspectionStatus;
        }[]>`
          select version, content_revision, status
          from public.inspections
          where id = ${inspection.id}
          for update
        `;

        const row = current[0];
        if (
          !row ||
          row.status !== 'locked' ||
          row.version !== expectedVersion ||
          row.content_revision !== expectedContentRevision
        ) {
          throw new DomainError(
            'INSPECTION_CONTENT_REVISION_CONFLICT',
            'Inspection changed before unlock could commit.',
          );
        }

        const invalidated = await tx<{ id: string }[]>`
          update public.inspection_signatures
          set
            status = 'invalidated',
            invalidated_at = ${event.unlockedAt},
            invalidated_by_user_id = ${event.unlockedByUserId},
            invalidation_reason = ${event.reason}
          where inspection_id = ${inspection.id}
            and status = 'valid'
          returning id
        `;

        if (invalidated.length !== event.invalidatedSignatureCount) {
          throw new DomainError(
            'INSPECTION_CONTENT_REVISION_CONFLICT',
            'Inspection signatures changed before unlock could commit.',
          );
        }

        await tx`
          insert into public.inspection_unlock_events (
            id, inspection_id, reason, previous_version,
            previous_content_revision, invalidated_signature_count,
            unlocked_by_user_id, unlocked_at
          ) values (
            ${event.id}, ${event.inspectionId}, ${event.reason},
            ${event.previousVersion}, ${event.previousContentRevision},
            ${event.invalidatedSignatureCount},
            ${event.unlockedByUserId}, ${event.unlockedAt}
          )
        `;

        const updated = await tx<{ id: string }[]>`
          update public.inspections
          set
            status = ${inspection.status},
            locked_at = ${inspection.lockedAt},
            version = ${inspection.version},
            content_revision = ${inspection.contentRevision},
            updated_at = now()
          where id = ${inspection.id}
            and version = ${expectedVersion}
            and content_revision = ${expectedContentRevision}
            and status = 'locked'
          returning id
        `;

        if (updated.length === 0) {
          throw new DomainError(
            'INSPECTION_CONTENT_REVISION_CONFLICT',
            'Inspection changed before unlock could commit.',
          );
        }
      });
    });
  }

  async listUnlockEvents(
    inspectionId: InspectionId,
  ): Promise<readonly InspectionUnlockEvent[]> {
    const rows = await this.sql<UnlockEventRow[]>`
      select
        id, inspection_id, reason, previous_version,
        previous_content_revision, invalidated_signature_count,
        unlocked_by_user_id, unlocked_at
      from public.inspection_unlock_events
      where inspection_id = ${inspectionId}
      order by unlocked_at, id
    `;
    return rows.map(mapUnlockEvent);
  }

  async finalize(
    inspection: Inspection,
    expectedVersion: number,
    expectedContentRevision: number,
    finalization: InspectionFinalization,
  ): Promise<void> {
    await translated(async () => {
      await this.sql.begin(async (tx) => {
        await tx`
          insert into public.inspection_finalizations (
            id, inspection_id, source_version, source_content_revision,
            snapshot_version, snapshot, final_report_document_version_id,
            finalized_by_user_id, finalized_at
          ) values (
            ${finalization.id}, ${finalization.inspectionId},
            ${finalization.sourceVersion}, ${finalization.sourceContentRevision},
            1, ${this.sql.json(JSON.parse(JSON.stringify(finalization.snapshot)))},
            ${finalization.finalReportDocumentVersionId},
            ${finalization.finalizedByUserId}, ${finalization.finalizedAt}
          )
        `;

        const updated = await tx<{ id: string }[]>`
          update public.inspections
          set
            status = ${inspection.status},
            finalized_at = ${inspection.finalizedAt},
            version = ${inspection.version},
            updated_at = now()
          where id = ${inspection.id}
            and status = 'locked'
            and version = ${expectedVersion}
            and content_revision = ${expectedContentRevision}
          returning id
        `;

        if (updated.length === 0) {
          throw new DomainError(
            'INSPECTION_CONTENT_REVISION_CONFLICT',
            'Inspection changed before finalization could commit.',
          );
        }
      });
    });
  }

  async getFinalization(
    inspectionId: InspectionId,
  ): Promise<InspectionFinalization | null> {
    const rows = await this.sql<FinalizationRow[]>`
      select
        id, inspection_id, source_version, source_content_revision,
        snapshot, final_report_document_version_id,
        finalized_by_user_id, finalized_at
      from public.inspection_finalizations
      where inspection_id = ${inspectionId}
      limit 1
    `;
    return rows.length === 0 ? null : mapFinalization(rows[0]!);
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
                ${item.sortOrder}, ${this.sql.json(optionsToJson(item.options))},
                ${item.visibleWhen === null ? null : this.sql.json(conditionToJson(item.visibleWhen))},
                ${item.requiredWhen === null ? null : this.sql.json(conditionToJson(item.requiredWhen))}
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
