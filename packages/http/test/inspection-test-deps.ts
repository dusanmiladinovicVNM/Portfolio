import type {
  InspectionRepository,
  SaveInspectionSectionResult,
  StaffDirectoryEntry,
  StaffDirectoryRepository,
} from '@portfolio/application';
import {
  DomainError,
  asUserId,
  type Inspection,
  type InspectionFinding,
  type InspectionId,
  type InspectionResponse,
  type InspectionSchemaSectionId,
  type InspectionSchemaVersion,
  type InspectionSchemaVersionId,
  type InspectionSectionState,
  type UnitId,
  type UserId,
} from '@portfolio/domain';

export class InMemoryInspectionRepository implements InspectionRepository {
  readonly inspections = new Map<InspectionId, Inspection>();
  readonly schemas = new Map<InspectionSchemaVersionId, InspectionSchemaVersion>();
  readonly states = new Map<string, InspectionSectionState>();
  readonly responses = new Map<string, InspectionResponse>();
  readonly findings: InspectionFinding[] = [];

  async getById(id: InspectionId) {
    return this.inspections.get(id) ?? null;
  }

  async listByUnit(unitId: UnitId) {
    return [...this.inspections.values()].filter(
      (inspection) => inspection.unitId === unitId,
    );
  }

  async codeExists(code: string) {
    return [...this.inspections.values()].some(
      (inspection) => inspection.code.toLowerCase() === code.toLowerCase(),
    );
  }

  async insert(inspection: Inspection, schema: InspectionSchemaVersion) {
    this.inspections.set(inspection.id, inspection);
    for (const section of schema.sections) {
      this.states.set(`${inspection.id}:${section.id}`, {
        inspectionId: inspection.id,
        sectionId: section.id,
        revision: 0,
      });
    }
  }

  async updateLifecycle(
    inspection: Inspection,
    expectedVersion: number,
    expectedContentRevision?: number,
  ) {
    const current = this.inspections.get(inspection.id);
    if (!current || current.version !== expectedVersion) {
      throw new DomainError(
        'INSPECTION_VERSION_CONFLICT',
        'Inspection was modified concurrently.',
      );
    }
    if (
      expectedContentRevision !== undefined &&
      current.contentRevision !== expectedContentRevision
    ) {
      throw new DomainError(
        'INSPECTION_CONTENT_REVISION_CONFLICT',
        'Inspection content changed while the lock was being validated.',
      );
    }
    this.inspections.set(inspection.id, inspection);
  }

  async getSectionRevision(
    inspectionId: InspectionId,
    sectionId: InspectionSchemaSectionId,
  ) {
    return this.states.get(`${inspectionId}:${sectionId}`)?.revision ?? null;
  }

  async listSectionStates(inspectionId: InspectionId) {
    return [...this.states.values()].filter(
      (state) => state.inspectionId === inspectionId,
    );
  }

  async saveSection(
    inspectionId: InspectionId,
    sectionId: InspectionSchemaSectionId,
    expectedRevision: number,
    responses: readonly InspectionResponse[],
    clearItemIds: readonly import('@portfolio/domain').InspectionSchemaItemId[],
  ): Promise<SaveInspectionSectionResult> {
    const key = `${inspectionId}:${sectionId}`;
    const current = this.states.get(key);
    if (!current || current.revision !== expectedRevision) {
      throw Object.assign(new Error('revision conflict'), {
        code: 'INSPECTION_SECTION_REVISION_CONFLICT',
      });
    }

    const inspection = this.inspections.get(inspectionId);
    if (!inspection || !['draft', 'in_progress'].includes(inspection.status)) {
      throw new DomainError(
        'INSPECTION_CONTENT_LOCKED',
        'Inspection content is no longer editable.',
      );
    }

    const revision = current.revision + 1;
    const contentRevision = inspection.contentRevision + 1;
    this.states.set(key, { ...current, revision });
    this.inspections.set(inspectionId, { ...inspection, contentRevision });

    for (const itemId of clearItemIds) {
      this.responses.delete(`${inspectionId}:${itemId}`);
    }
    for (const response of responses) {
      this.responses.set(`${inspectionId}:${response.itemId}`, response);
    }

    return {
      revision,
      contentRevision,
      responses,
      clearedItemIds: [...clearItemIds],
    };
  }

  async listResponses(inspectionId: InspectionId) {
    return [...this.responses.values()].filter(
      (response) => response.inspectionId === inspectionId,
    );
  }

  async insertFinding(finding: InspectionFinding) {
    const inspection = this.inspections.get(finding.inspectionId);
    if (!inspection || !['draft', 'in_progress'].includes(inspection.status)) {
      throw new DomainError(
        'INSPECTION_CONTENT_LOCKED',
        'Inspection content is no longer editable.',
      );
    }
    const contentRevision = inspection.contentRevision + 1;
    this.inspections.set(finding.inspectionId, {
      ...inspection,
      contentRevision,
    });
    this.findings.push(finding);
    return contentRevision;
  }

  async listFindings(inspectionId: InspectionId) {
    return this.findings.filter(
      (finding) => finding.inspectionId === inspectionId,
    );
  }

  async getSchemaVersionById(id: InspectionSchemaVersionId) {
    return this.schemas.get(id) ?? null;
  }

  async listSchemaVersions() {
    return [...this.schemas.values()];
  }

  async latestSchemaVersionNumber(schemaCode: string) {
    return Math.max(
      0,
      ...[...this.schemas.values()]
        .filter(
          (schema) =>
            schema.schemaCode.toLowerCase() === schemaCode.toLowerCase(),
        )
        .map((schema) => schema.versionNumber),
    );
  }

  async insertSchemaVersion(schema: InspectionSchemaVersion) {
    this.schemas.set(schema.id, schema);
  }

  async updateSchemaVersionStatus(schema: InspectionSchemaVersion) {
    this.schemas.set(schema.id, schema);
  }
}

export class InMemoryStaffDirectoryRepository
  implements StaffDirectoryRepository {
  readonly users = new Map<UserId, StaffDirectoryEntry>();

  constructor() {
    for (const [id, role] of [
      ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'admin'],
      ['bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'inspector'],
      ['cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'manager'],
    ] as const) {
      const userId = asUserId(id);
      this.users.set(userId, { userId, role });
    }
  }

  async getActiveStaffById(userId: UserId) {
    return this.users.get(userId) ?? null;
  }
}
