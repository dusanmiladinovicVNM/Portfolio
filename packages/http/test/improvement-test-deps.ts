import type { ImprovementRepository } from '@portfolio/application';
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

export class InMemoryImprovementRepository implements ImprovementRepository {
  readonly projects = new Map<ImprovementProjectId, ImprovementProject>();
  readonly workItems = new Map<WorkItemId, WorkItem>();
  readonly workRecords: WorkRecord[] = [];

  async getProjectById(
    id: ImprovementProjectId,
  ): Promise<ImprovementProject | null> {
    return this.projects.get(id) ?? null;
  }

  async listProjectsByProperty(
    propertyId: PropertyId,
  ): Promise<readonly ImprovementProject[]> {
    return [...this.projects.values()].filter(
      (project) => project.propertyId === propertyId,
    );
  }

  async listProjectsByUnit(
    unitId: UnitId,
  ): Promise<readonly ImprovementProject[]> {
    return [...this.projects.values()].filter(
      (project) => project.unitId === unitId,
    );
  }

  async projectCodeExists(code: string): Promise<boolean> {
    const normalized = code.trim().toLowerCase();
    return [...this.projects.values()].some(
      (project) => project.code.toLowerCase() === normalized,
    );
  }

  async insertProject(project: ImprovementProject): Promise<void> {
    this.projects.set(project.id, project);
  }

  async updateProjectPlan(
    project: ImprovementProject,
    expectedVersion: number,
  ): Promise<void> {
    const current = this.projects.get(project.id);
    if (!current || current.version !== expectedVersion) {
      throw new Error('project version conflict');
    }
    this.projects.set(project.id, project);
  }

  async updateProjectLifecycle(
    project: ImprovementProject,
    expectedVersion: number,
  ): Promise<void> {
    const current = this.projects.get(project.id);
    if (!current || current.version !== expectedVersion) {
      throw new Error('project version conflict');
    }
    this.projects.set(project.id, project);
  }

  async getWorkItemById(id: WorkItemId): Promise<WorkItem | null> {
    return this.workItems.get(id) ?? null;
  }

  async listWorkItemsByProject(
    projectId: ImprovementProjectId,
  ): Promise<readonly WorkItem[]> {
    return [...this.workItems.values()].filter(
      (item) => item.projectId === projectId,
    );
  }

  async workItemCodeExists(
    projectId: ImprovementProjectId,
    code: string,
  ): Promise<boolean> {
    const normalized = code.trim().toLowerCase();
    return [...this.workItems.values()].some(
      (item) =>
        item.projectId === projectId &&
        item.code.toLowerCase() === normalized,
    );
  }

  async insertWorkItem(item: WorkItem): Promise<void> {
    this.workItems.set(item.id, item);
  }

  async updateWorkItemPlan(
    item: WorkItem,
    expectedVersion: number,
  ): Promise<void> {
    const current = this.workItems.get(item.id);
    if (!current || current.version !== expectedVersion) {
      throw new Error('work item version conflict');
    }
    this.workItems.set(item.id, item);
  }

  async updateWorkItemLifecycle(
    item: WorkItem,
    expectedVersion: number,
  ): Promise<void> {
    const current = this.workItems.get(item.id);
    if (!current || current.version !== expectedVersion) {
      throw new Error('work item version conflict');
    }
    this.workItems.set(item.id, item);
  }

  async getWorkRecordById(id: WorkRecordId): Promise<WorkRecord | null> {
    return this.workRecords.find((record) => record.id === id) ?? null;
  }

  async getWorkMaterialById(id: WorkMaterialId): Promise<WorkMaterial | null> {
    for (const record of this.workRecords) {
      const material = record.materials.find((item) => item.id === id);
      if (material) return material;
    }
    return null;
  }

  async listWorkRecordsByProject(
    projectId: ImprovementProjectId,
  ): Promise<readonly WorkRecord[]> {
    return this.workRecords.filter((record) => record.projectId === projectId);
  }

  async listWorkRecordsByItem(
    workItemId: WorkItemId,
  ): Promise<readonly WorkRecord[]> {
    return this.workRecords.filter((record) => record.workItemId === workItemId);
  }

  async insertWorkRecord(record: WorkRecord): Promise<void> {
    this.workRecords.push(record);
  }
}
