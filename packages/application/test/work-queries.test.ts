import { describe, expect, it } from 'vitest';
import {
  listOperationalWorkQuery,
  type Actor,
  type OperationalWorkProjection,
  type WorkRepository,
} from '../src/index.js';
import {
  asInspectionId,
  asLeaseAgreementId,
  asMaintenanceIssueId,
  asPropertyId,
  asTenancyId,
  asUnitId,
  asUserId,
  type DateOnly,
} from '@portfolio/domain';

const inspectorId = asUserId('10000000-0000-4000-8000-000000000001');
const otherUserId = asUserId('10000000-0000-4000-8000-000000000002');
const propertyId = asPropertyId('20000000-0000-4000-8000-000000000001');
const unitId = asUnitId('30000000-0000-4000-8000-000000000001');

const manager: Actor = {
  userId: otherUserId,
  role: 'manager',
};

const inspector: Actor = {
  userId: inspectorId,
  role: 'inspector',
};

class FakeWorkRepository implements WorkRepository {
  readCount = 0;
  lastOperationalDate: DateOnly | null = null;

  constructor(readonly projection: OperationalWorkProjection) {}

  async getOperationalWork(operationalDate: DateOnly) {
    this.readCount += 1;
    this.lastOperationalDate = operationalDate;
    return this.projection;
  }
}

function projection(): OperationalWorkProjection {
  return {
    inspections: [
      {
        kind: 'inspection',
        inspectionId: asInspectionId(
          '40000000-0000-4000-8000-000000000001',
        ),
        inspectionCode: 'INS-MINE',
        inspectionType: 'move_in',
        inspectionStatus: 'draft',
        scheduledFor: '2026-09-30' as DateOnly,
        assignedToUserId: inspectorId,
        assignedToDisplayName: 'Inspector One',
        assignedToRole: 'inspector',
        propertyId,
        propertyCode: 'PROP-1',
        propertyName: 'Property One',
        unitId,
        unitCode: 'UNIT-1',
        unitNumber: '1',
      },
      {
        kind: 'inspection',
        inspectionId: asInspectionId(
          '40000000-0000-4000-8000-000000000002',
        ),
        inspectionCode: 'INS-OTHER',
        inspectionType: 'periodic',
        inspectionStatus: 'in_progress',
        scheduledFor: '2026-09-29' as DateOnly,
        assignedToUserId: otherUserId,
        assignedToDisplayName: 'Manager One',
        assignedToRole: 'manager',
        propertyId,
        propertyCode: 'PROP-1',
        propertyName: 'Property One',
        unitId,
        unitCode: 'UNIT-1',
        unitNumber: '1',
      },
    ],
    maintenance: [
      {
        kind: 'maintenance',
        issueId: asMaintenanceIssueId(
          '50000000-0000-4000-8000-000000000001',
        ),
        issueCode: 'MI-URGENT',
        title: 'Heating failure',
        priority: 'urgent',
        reportedAt: '2026-09-28T10:00:00.000Z',
        propertyId,
        propertyCode: 'PROP-1',
        propertyName: 'Property One',
        unitId,
        unitCode: 'UNIT-1',
        unitNumber: '1',
        activeWorkOrderCount: 1,
        assignedUserIds: [inspectorId],
      },
      {
        kind: 'maintenance',
        issueId: asMaintenanceIssueId(
          '50000000-0000-4000-8000-000000000002',
        ),
        issueCode: 'MI-NORMAL',
        title: 'Paint touch-up',
        priority: 'normal',
        reportedAt: '2026-09-28T11:00:00.000Z',
        propertyId,
        propertyCode: 'PROP-1',
        propertyName: 'Property One',
        unitId,
        unitCode: 'UNIT-1',
        unitNumber: '1',
        activeWorkOrderCount: 0,
        assignedUserIds: [],
      },
    ],
    occupancy: [
      {
        kind: 'occupancy',
        reason: 'contract_draft',
        tenancyId: asTenancyId(
          '60000000-0000-4000-8000-000000000001',
        ),
        tenancyCode: 'TEN-1',
        tenancyStatus: 'planned',
        agreementId: asLeaseAgreementId(
          '70000000-0000-4000-8000-000000000001',
        ),
        agreementCode: 'AGR-1',
        dueDate: '2026-10-01' as DateOnly,
        propertyId,
        propertyCode: 'PROP-1',
        propertyName: 'Property One',
        unitId,
        unitCode: 'UNIT-1',
        unitNumber: '1',
      },
    ],
  };
}

function itemCodeForTest(
  item: Awaited<ReturnType<typeof listOperationalWorkQuery>>['items'][number],
): string {
  if (item.kind === 'inspection') return item.inspectionCode;
  if (item.kind === 'maintenance') return item.issueCode;
  return `${item.tenancyCode}:${item.reason}`;
}

describe('Operational Work query', () => {
  it('derives attention and a stable cross-domain order without persisting tasks', async () => {
    const repository = new FakeWorkRepository(projection());

    const result = await listOperationalWorkQuery(
      repository,
      manager,
      '2026-09-30',
      '2026-10-01',
    );

    expect(repository.readCount).toBe(1);
    expect(repository.lastOperationalDate).toBe('2026-10-01');
    expect(
      result.items.map((item) => [item.kind, item.attention]),
    ).toEqual([
      ['maintenance', 'urgent'],
      ['inspection', 'overdue'],
      ['inspection', 'today'],
      ['occupancy', 'upcoming'],
      ['maintenance', 'normal'],
    ]);
  });

  it('uses queue date only for attention without rewinding the canonical Work set', async () => {
    const repository = new FakeWorkRepository(projection());

    const earlier = await listOperationalWorkQuery(
      repository,
      manager,
      '2026-09-29',
      '2026-10-01',
    );
    const later = await listOperationalWorkQuery(
      repository,
      manager,
      '2026-10-02',
      '2026-10-01',
    );

    expect(repository.readCount).toBe(2);
    expect(repository.lastOperationalDate).toBe('2026-10-01');
    expect(
      earlier.items.map((item) => [item.kind, itemCodeForTest(item)]).sort(),
    ).toEqual(
      later.items.map((item) => [item.kind, itemCodeForTest(item)]).sort(),
    );
    expect(
      earlier.items.find(
        (item) =>
          item.kind === 'inspection' &&
          item.inspectionCode === 'INS-MINE',
      )?.attention,
    ).toBe('upcoming');
    expect(
      later.items.find(
        (item) =>
          item.kind === 'inspection' &&
          item.inspectionCode === 'INS-MINE',
      )?.attention,
    ).toBe('overdue');
  });

  it('scopes inspectors to their own canonical Inspection and assigned Maintenance work', async () => {
    const repository = new FakeWorkRepository(projection());

    const result = await listOperationalWorkQuery(
      repository,
      inspector,
      '2026-09-30',
      '2026-10-01',
    );

    expect(result.items).toHaveLength(2);
    expect(result.items.map((item) => item.kind)).toEqual([
      'maintenance',
      'inspection',
    ]);
    expect(
      result.items.some((item) => item.kind === 'occupancy'),
    ).toBe(false);
    expect(
      result.items.find((item) => item.kind === 'inspection'),
    ).toMatchObject({
      inspectionCode: 'INS-MINE',
      attention: 'today',
    });

    const maintenance = result.items.find(
      (item) => item.kind === 'maintenance',
    );
    expect(maintenance).toMatchObject({
      issueCode: 'MI-URGENT',
      attention: 'urgent',
    });
    expect(maintenance).not.toHaveProperty('assignedUserIds');
  });
});
