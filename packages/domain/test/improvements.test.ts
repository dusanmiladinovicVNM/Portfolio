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
      '2026-10-01T17:00:00.000Z',
    );
    const completed = completeImprovementProject(
      started,
      [completedItem],
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

    const record = createWorkRecord({
      id: asWorkRecordId('fc000000-0000-4000-8000-000000000006'),
      project: started,
      workItem: item,
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
      workItemId: item.id,
      performedAt: '2026-10-01T12:00:00.000Z',
      recordedAt: '2026-10-03T09:00:00.000Z',
    });
    expect(record.materials[0]).toMatchObject({
      quantity: '12.5',
      unit: 'm2',
    });
    expect(record.assets[0]).toMatchObject({ action: 'affected' });
  });

  it('does not let work history assert a future or post-terminal occurrence', () => {
    const cancelled = cancelImprovementProject(
      project(),
      '2026-09-20T08:00:00.000Z',
    );
    const item = {
      ...createWorkItem({
        id: asWorkItemId('fc000000-0000-4000-8000-000000000011'),
        project: project(),
        code: 'W-03',
        title: 'Cancelled scope',
        createdAt: '2026-09-19T11:00:00.000Z',
        createdByUserId: userId,
      }),
      status: 'cancelled' as const,
      cancelledAt: '2026-09-20T08:00:00.000Z',
      version: 2,
    };

    expect(() =>
      createWorkRecord({
        id: asWorkRecordId('fc000000-0000-4000-8000-000000000012'),
        project: cancelled,
        workItem: item,
        performedAt: '2026-09-21T08:00:00.000Z',
        description: 'Impossible late work',
        recordedAt: '2026-09-22T08:00:00.000Z',
        recordedByUserId: userId,
      }),
    ).toThrowError(/terminal time/);

    const open = project();
    const openItem = createWorkItem({
      id: asWorkItemId('fc000000-0000-4000-8000-000000000013'),
      project: open,
      code: 'W-04',
      title: 'Future work',
      createdAt: '2026-09-19T11:00:00.000Z',
      createdByUserId: userId,
    });
    expect(() =>
      createWorkRecord({
        id: asWorkRecordId('fc000000-0000-4000-8000-000000000014'),
        project: open,
        workItem: openItem,
        performedAt: '2026-09-21T08:00:00.000Z',
        description: 'Future entry',
        recordedAt: '2026-09-20T08:00:00.000Z',
        recordedByUserId: userId,
      }),
    ).toThrowError(/cannot be after recordedAt/);
  });

  it('keeps ProjectAsset as evidence instead of Asset lifecycle mutation', () => {
    const draft = project();
    const item = createWorkItem({
      id: asWorkItemId('fc000000-0000-4000-8000-000000000015'),
      project: draft,
      code: 'W-05',
      title: 'Replace boiler',
      createdAt: '2026-09-19T11:00:00.000Z',
      createdByUserId: userId,
    });
    const record = createWorkRecord({
      id: asWorkRecordId('fc000000-0000-4000-8000-000000000016'),
      project: draft,
      workItem: item,
      performedAt: '2026-09-18T08:00:00.000Z',
      description: 'Historical boiler works',
      assets: [
        {
          id: asProjectAssetId('fc000000-0000-4000-8000-000000000017'),
          assetId: asAssetId('fc000000-0000-4000-8000-000000000018'),
          action: 'removed',
        },
        {
          id: asProjectAssetId('fc000000-0000-4000-8000-000000000019'),
          assetId: asAssetId('fc000000-0000-4000-8000-000000000020'),
          action: 'installed',
        },
      ],
      recordedAt: '2026-09-19T12:00:00.000Z',
      recordedByUserId: userId,
    });
    expect(record.assets.map((asset) => asset.action)).toEqual([
      'removed',
      'installed',
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
    const cancelled = cancelWorkItem(item, '2026-09-19T12:00:00.000Z');
    expect(cancelled.status).toBe('cancelled');
    expect(() =>
      cancelWorkItem(cancelled, '2026-09-19T13:00:00.000Z'),
    ).toThrowError(/cannot transition/);
  });
});
