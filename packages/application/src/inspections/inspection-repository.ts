import type {
  Inspection,
  InspectionFinding,
  InspectionId,
  InspectionResponse,
  InspectionSectionState,
  InspectionSchemaSectionId,
  InspectionSchemaVersion,
  InspectionSchemaVersionId,
  UnitId,
} from '@portfolio/domain';

export interface SaveInspectionSectionResult {
  readonly revision: number;
  readonly responses: readonly InspectionResponse[];
}

export interface InspectionRepository {
  getById(id: InspectionId): Promise<Inspection | null>;
  listByUnit(unitId: UnitId): Promise<readonly Inspection[]>;
  codeExists(code: string): Promise<boolean>;
  insert(
    inspection: Inspection,
    schema: InspectionSchemaVersion,
  ): Promise<void>;
  updateLifecycle(
    inspection: Inspection,
    expectedVersion: number,
  ): Promise<void>;

  getSectionRevision(
    inspectionId: InspectionId,
    sectionId: InspectionSchemaSectionId,
  ): Promise<number | null>;
  listSectionStates(
    inspectionId: InspectionId,
  ): Promise<readonly InspectionSectionState[]>;
  saveSection(
    inspectionId: InspectionId,
    sectionId: InspectionSchemaSectionId,
    expectedRevision: number,
    responses: readonly InspectionResponse[],
  ): Promise<SaveInspectionSectionResult>;
  listResponses(
    inspectionId: InspectionId,
  ): Promise<readonly InspectionResponse[]>;

  insertFinding(finding: InspectionFinding): Promise<void>;
  listFindings(
    inspectionId: InspectionId,
  ): Promise<readonly InspectionFinding[]>;

  getSchemaVersionById(
    id: InspectionSchemaVersionId,
  ): Promise<InspectionSchemaVersion | null>;
  listSchemaVersions(): Promise<readonly InspectionSchemaVersion[]>;
  latestSchemaVersionNumber(schemaCode: string): Promise<number>;
  insertSchemaVersion(schema: InspectionSchemaVersion): Promise<void>;
  updateSchemaVersionStatus(schema: InspectionSchemaVersion): Promise<void>;
}

export interface StaffDirectoryEntry {
  readonly userId: import('@portfolio/domain').UserId;
  readonly role: 'admin' | 'manager' | 'inspector';
}

export interface StaffDirectoryRepository {
  getActiveStaffById(
    userId: import('@portfolio/domain').UserId,
  ): Promise<StaffDirectoryEntry | null>;
}
