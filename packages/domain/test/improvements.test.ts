import { describe, expect, it } from 'vitest';
import {
  asAssetId,
  asImprovementProjectId,
  asPartyId,
  asProjectAssetId,
  asPropertyId,
  asUserId,
  asWorkItemId,
  asWorkMaterialId,
  asWorkRecordId,
  cancelImprovementProject,
  cancelWorkItem,
  completeImprovementProject,
  completeWorkItem,
  createImprovementProject,
  createWorkItem,
  createWorkRecord,
  planImprovementProject,
  startImprovementProject,
  startWorkItem,
  updateImprovementProjectPlan,
  updateWorkItemPlan,
} from '../src/index.js';

const userId = asUserId('fc000000-0000-4000-8000-000000000001');
const propertyId = asPropertyId('fc000000-0000-4000-8000-000000000002');

function project() {
  return createImprovementProject({
    id: asImprovementProjectId('fc000000-0000-4000-8000-000000000003'),
    code: 'IMP-001',
    name: 'Kitchen renovation',
    propertyId,
    plannedStartOn: '2026-10-01',
    plannedEndOn: '2026-10-31',
    createdAt: '2026-09-19T10:00:00.000Z',
    createdByUserId: userId,
  });
}

describe('Improvements and Works domain', () => {
  it('keeps project plan correction bounded before work starts', () => {
    const draft = project();
    const corrected = updateImprovementProjectPlan(draft, {
      name: 'Kitchen and dining renovation',
      plannedEndOn: '2026-11-05',
    });
    expect(corrected).toMatchObject({
      name: 'Kitchen and dining renovation',
      plannedEndOn: '2026-11-05',
      version: 2,
    });

    const planned = planImprovementProject(
      corrected,
      '2026-09-20T08:00:00.000Z',
    );
    const started = startImprovementProject(
      planned,
      '2026-10-01T08:00:00.000Z',
    );
    expect(() =>
      updateImprovementProjectPlan(started, { name: 'Rewrite' }),
    ).toThrowError(/draft or planned/);
  });

  it('allows WorkItem plan correction only before work starts', () => {
    const plannedProject = planImprovementProject(
      project(),
      '2026-09-20T08:00:00.000Z',
    );
    const startedProject = startImprovementProject(
      plannedProject,
      '2026-10-01T08:00:00.000Z',
    );
    const item = createWorkItem({
      id: asWorkItemId('fc000000-0000-4000-8000-000000000022'),
      project: startedProject,
      code: 'W-PLAN',
      title: 'Install cabniets',
      description: 'Initial scope',
      createdAt: '2026-10-01T08:05:00.000Z',
      createdByUserId: userId,
    });

    const corrected = updateWorkItemPlan(item, {
      title: 'Install cabinets',
      description: 'Corrected planned scope',
    });
    expect(corrected).toMatchObject({
      title: 'Install cabinets',
      description: 'Corrected planned scope',
      status: 'planned',
      version: 2,
    });

    const active = startWorkItem(
      corrected,
      startedProject,
      '2026-10-01T09:00:00.000Z',
    );
    expect(() =>
      updateWorkItemPlan(active, { title: 'Rewrite after start' }),
    ).toThrowError(/only be corrected while planned/);
  });

  it('requires all WorkItems terminal before project completion', () => {
    const planned = planImprovementProject(
      project(),
      '2026-09-20T08:00:00.000Z',
    );
    const started = startImprovementProject(
      planned,
      '2026-10-01T08:00:00.000Z',
    );
    const item = createWorkItem({
      id: asWorkItemId('fc000000-0000-4000-8000-000000000004'),
      project: started,
      code: 'W-01',
      title: 'Remove old cabinets',
      createdAt: '2026-10-01T08:05:00.000Z',
      createdByUserId: userId,
    });

    expect(() =>
      completeImprovementProject(
        started,
        [item],
        [],
        '2026-10-02T17:00:00.000Z',
      ),
    ).toThrowError(/WorkItems remain operational/);

    const activeItem = startWorkItem(
      item,
      started,
      '2026-10-01T09:00:00.000Z',
    );
    const completedItem = completeWorkItem(
      activeItem,
      started,
      [],
      '2026-10-01T17:00:00.000Z',
    );
    const completed = completeImprovementProject(
      started,
      [completedItem],
      [],
      '2026-10-02T17:00:00.000Z',
    );
    expect(completed).toMatchObject({ status: 'completed', version: 4 });
  });

  it('records actual work separately from plan state with exact materials', () => {
    const planned = planImprovementProject(
      project(),
      '2026-09-20T08:00:00.000Z',
    );
    const started = startImprovementProject(
      planned,
      '2026-10-01T08:00:00.000Z',
    );
    const item = createWorkItem({
      id: asWorkItemId('fc000000-0000-4000-8000-000000000005'),
      project: started,
      code: 'W-02',
      title: 'Install cabinetry',
      createdAt: '2026-10-01T08:10:00.000Z',
      createdByUserId: userId,
    });
    const activeItem = startWorkItem(
      item,
      started,
      '2026-10-01T09:00:00.000Z',
    );

    const record = createWorkRecord({
      id: asWorkRecordId('fc000000-0000-4000-8000-000000000006'),
      project: started,
      workItem: activeItem,
      contractorPartyId: asPartyId(
        'fc000000-0000-4000-8000-000000000007',
      ),
      performedAt: '2026-10-01T12:00:00.000Z',
      description: 'Installed base cabinets',
      materials: [
        {
          id: asWorkMaterialId('fc000000-0000-4000-8000-000000000008'),
          name: 'Moisture-resistant board',
          quantity: '12.5',
          unit: 'm2',
        },
      ],
      assets: [
        {
          id: asProjectAssetId('fc000000-0000-4000-8000-000000000009'),
          assetId: asAssetId('fc000000-0000-4000-8000-000000000010'),
          action: 'affected',
        },
      ],
      recordedAt: '2026-10-03T09:00:00.000Z',
      recordedByUserId: userId,
    });

    expect(record).toMatchObject({
      projectId: started.id,
      workItemId: activeItem.id,
      performedAt: '2026-10-01T12:00:00.000Z',
      recordedAt: '2026-10-03T09:00:00.000Z',
    });
    expect(record.materials[0]).toMatchObject({
      quantity: '12.5',
      unit: 'm2',
    });
    expect(record.assets[0]).toMatchObject({ action: 'affected' });
  });

  it('bounds WorkRecord occurrence between starts, terminal cutoffs and recording time', () => {
    const plannedProject = planImprovementProject(
      project(),
      '2026-09-20T08:00:00.000Z',
    );
    const startedProject = startImprovementProject(
      plannedProject,
      '2026-10-01T08:00:00.000Z',
    );
    const item = createWorkItem({
      id: asWorkItemId('fc000000-0000-4000-8000-000000000011'),
      project: startedProject,
      code: 'W-03',
      title: 'Bounded work',
      createdAt: '2026-10-01T08:05:00.000Z',
      createdByUserId: userId,
    });

    expect(() =>
      createWorkRecord({
        id: asWorkRecordId('fc000000-0000-4000-8000-000000000012'),
        project: startedProject,
        workItem: item,
        performedAt: '2026-10-01T08:30:00.000Z',
        description: 'Item never started',
        recordedAt: '2026-10-01T10:00:00.000Z',
        recordedByUserId: userId,
      }),
    ).toThrowError(/requires started Project and WorkItem/);

    const activeItem = startWorkItem(
      item,
      startedProject,
      '2026-10-01T09:00:00.000Z',
    );

    expect(() =>
      createWorkRecord({
        id: asWorkRecordId('fc000000-0000-4000-8000-000000000013'),
        project: startedProject,
        workItem: activeItem,
        performedAt: '2026-10-01T08:30:00.000Z',
        description: 'Before WorkItem start',
        recordedAt: '2026-10-01T10:00:00.000Z',
        recordedByUserId: userId,
      }),
    ).toThrowError(/before Project or WorkItem startedAt/);

    const completedItem = completeWorkItem(
      activeItem,
      startedProject,
      [],
      '2026-10-01T17:00:00.000Z',
    );
    const completedProject = completeImprovementProject(
      startedProject,
      [completedItem],
      [],
      '2026-10-02T17:00:00.000Z',
    );

    expect(() =>
      createWorkRecord({
        id: asWorkRecordId('fc000000-0000-4000-8000-000000000014'),
        project: completedProject,
        workItem: completedItem,
        performedAt: '2026-10-01T18:00:00.000Z',
        description: 'After WorkItem completion',
        recordedAt: '2026-10-03T08:00:00.000Z',
        recordedByUserId: userId,
      }),
    ).toThrowError(/terminal time/);

    expect(() =>
      createWorkRecord({
        id: asWorkRecordId('fc000000-0000-4000-8000-000000000023'),
        project: startedProject,
        workItem: activeItem,
        performedAt: '2026-10-02T08:00:00.000Z',
        description: 'Future entry',
        recordedAt: '2026-10-01T18:00:00.000Z',
        recordedByUserId: userId,
      }),
    ).toThrowError(/cannot be after recordedAt/);
  });

  it('prevents terminal timestamps from moving behind existing WorkRecord truth', () => {
    const plannedProject = planImprovementProject(
      project(),
      '2026-09-20T08:00:00.000Z',
    );
    const startedProject = startImprovementProject(
      plannedProject,
      '2026-10-01T08:00:00.000Z',
    );
    const item = createWorkItem({
      id: asWorkItemId('fc000000-0000-4000-8000-000000000024'),
      project: startedProject,
      code: 'W-CUTOFF',
      title: 'Temporal cutoff work',
      createdAt: '2026-10-01T08:05:00.000Z',
      createdByUserId: userId,
    });
    const activeItem = startWorkItem(
      item,
      startedProject,
      '2026-10-01T09:00:00.000Z',
    );
    const record = createWorkRecord({
      id: asWorkRecordId('fc000000-0000-4000-8000-000000000025'),
      project: startedProject,
      workItem: activeItem,
      performedAt: '2026-10-02T14:00:00.000Z',
      description: 'Completed physical work',
      recordedAt: '2026-10-03T09:00:00.000Z',
      recordedByUserId: userId,
    });

    expect(() =>
      completeWorkItem(
        activeItem,
        startedProject,
        [record],
        '2026-10-02T12:00:00.000Z',
      ),
    ).toThrowError(/cannot predate existing WorkRecord history/);

    expect(() =>
      cancelWorkItem(
        activeItem,
        [record],
        '2026-10-02T12:00:00.000Z',
      ),
    ).toThrowError(/cannot predate existing WorkRecord history/);

    expect(() =>
      cancelImprovementProject(
        startedProject,
        [record],
        '2026-10-02T12:00:00.000Z',
      ),
    ).toThrowError(/cannot predate existing WorkRecord history/);

    const completedItem = completeWorkItem(
      activeItem,
      startedProject,
      [record],
      '2026-10-02T15:00:00.000Z',
    );
    expect(() =>
      completeImprovementProject(
        startedProject,
        [completedItem],
        [record],
        '2026-10-02T14:30:00.000Z',
      ),
    ).toThrowError(/cannot predate a WorkItem terminal timestamp/);
  });

  it('keeps ProjectAsset actions as work semantics instead of Asset truth', () => {
    const plannedProject = planImprovementProject(
      project(),
      '2026-09-20T08:00:00.000Z',
    );
    const startedProject = startImprovementProject(
      plannedProject,
      '2026-10-01T08:00:00.000Z',
    );
    const item = createWorkItem({
      id: asWorkItemId('fc000000-0000-4000-8000-000000000015'),
      project: startedProject,
      code: 'W-05',
      title: 'Boiler work',
      createdAt: '2026-10-01T08:05:00.000Z',
      createdByUserId: userId,
    });
    const activeItem = startWorkItem(
      item,
      startedProject,
      '2026-10-01T09:00:00.000Z',
    );
    const record = createWorkRecord({
      id: asWorkRecordId('fc000000-0000-4000-8000-000000000016'),
      project: startedProject,
      workItem: activeItem,
      performedAt: '2026-10-01T12:00:00.000Z',
      description: 'Boiler installation/removal work',
      assets: [
        {
          id: asProjectAssetId('fc000000-0000-4000-8000-000000000017'),
          assetId: asAssetId('fc000000-0000-4000-8000-000000000018'),
          action: 'removal_work',
        },
        {
          id: asProjectAssetId('fc000000-0000-4000-8000-000000000019'),
          assetId: asAssetId('fc000000-0000-4000-8000-000000000020'),
          action: 'installation_work',
        },
      ],
      recordedAt: '2026-10-02T12:00:00.000Z',
      recordedByUserId: userId,
    });
    expect(record.assets.map((asset) => asset.action)).toEqual([
      'removal_work',
      'installation_work',
    ]);
  });

  it('keeps cancellation monotonic and terminal', () => {
    const item = createWorkItem({
      id: asWorkItemId('fc000000-0000-4000-8000-000000000021'),
      project: project(),
      code: 'W-06',
      title: 'Optional work',
      createdAt: '2026-09-19T11:00:00.000Z',
      createdByUserId: userId,
    });
    const cancelled = cancelWorkItem(
      item,
      [],
      '2026-09-19T12:00:00.000Z',
    );
    expect(cancelled.status).toBe('cancelled');
    expect(() =>
      cancelWorkItem(cancelled, [], '2026-09-19T13:00:00.000Z'),
    ).toThrowError(/cannot transition/);
  });
});
