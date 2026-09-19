import type {
  ImprovementProject,
  ImprovementProjectId,
  PropertyId,
  UnitId,
  WorkItem,
  WorkItemId,
  WorkRecord,
  WorkRecordId,
  WorkMaterial,
  WorkMaterialId,
} from '@portfolio/domain';

export interface ImprovementRepository {
  getProjectById(id: ImprovementProjectId): Promise<ImprovementProject | null>;
  listProjectsByProperty(
    propertyId: PropertyId,
  ): Promise<readonly ImprovementProject[]>;
  listProjectsByUnit(unitId: UnitId): Promise<readonly ImprovementProject[]>;
  projectCodeExists(code: string): Promise<boolean>;
  insertProject(project: ImprovementProject): Promise<void>;
  updateProjectPlan(
    project: ImprovementProject,
    expectedVersion: number,
  ): Promise<void>;
  updateProjectLifecycle(
    project: ImprovementProject,
    expectedVersion: number,
  ): Promise<void>;

  getWorkItemById(id: WorkItemId): Promise<WorkItem | null>;
  listWorkItemsByProject(
    projectId: ImprovementProjectId,
  ): Promise<readonly WorkItem[]>;
  workItemCodeExists(
    projectId: ImprovementProjectId,
    code: string,
  ): Promise<boolean>;
  insertWorkItem(item: WorkItem): Promise<void>;
  updateWorkItemPlan(item: WorkItem, expectedVersion: number): Promise<void>;
  updateWorkItemLifecycle(
    item: WorkItem,
    expectedVersion: number,
  ): Promise<void>;

  getWorkRecordById(id: WorkRecordId): Promise<WorkRecord | null>;
  getWorkMaterialById(id: WorkMaterialId): Promise<WorkMaterial | null>;
  listWorkRecordsByProject(
    projectId: ImprovementProjectId,
  ): Promise<readonly WorkRecord[]>;
  listWorkRecordsByItem(workItemId: WorkItemId): Promise<readonly WorkRecord[]>;
  insertWorkRecord(record: WorkRecord): Promise<void>;
}
