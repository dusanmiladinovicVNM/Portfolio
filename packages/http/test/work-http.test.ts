import { describe, expect, it } from 'vitest';
import {
  asInspectionId,
  asPropertyId,
  asUnitId,
  asUserId,
  type DateOnly,
} from '@portfolio/domain';
import { handleWorkHttp } from '../src/work-http-routes.js';
import { InMemoryWorkRepository } from './work-test-deps.js';

const manager = {
  userId: asUserId('10000000-0000-4000-8000-000000000001'),
  role: 'manager' as const,
};

describe('Work HTTP route', () => {
  it('requires an explicit valid queue reference date', async () => {
    const repository = new InMemoryWorkRepository();

    const response = await handleWorkHttp(
      { workRepository: repository },
      manager,
      new Request('https://portfolio.test/work'),
      '/work',
    );

    expect(response?.status).toBe(400);
    expect(repository.lastReferenceDate).toBeNull();
  });

  it('returns the canonical multi-domain queue with the exact reference date', async () => {
    const repository = new InMemoryWorkRepository();
    repository.projection = {
      inspections: [
        {
          kind: 'inspection',
          inspectionId: asInspectionId(
            '20000000-0000-4000-8000-000000000001',
          ),
          inspectionCode: 'INS-WORK-HTTP',
          inspectionType: 'periodic',
          inspectionStatus: 'locked',
          scheduledFor: '2026-09-30' as DateOnly,
          assignedToUserId: manager.userId,
          assignedToDisplayName: 'Manager One',
          assignedToRole: 'manager',
          propertyId: asPropertyId(
            '30000000-0000-4000-8000-000000000001',
          ),
          propertyCode: 'PROP-WORK',
          propertyName: 'Work Property',
          unitId: asUnitId(
            '40000000-0000-4000-8000-000000000001',
          ),
          unitCode: 'UNIT-WORK',
          unitNumber: '1',
        },
      ],
      maintenance: [],
      occupancy: [],
    };

    const response = await handleWorkHttp(
      { workRepository: repository },
      manager,
      new Request('https://portfolio.test/work?asOf=2026-09-30'),
      '/work',
    );

    expect(response?.status).toBe(200);
    expect(repository.lastReferenceDate).toBe('2026-09-30');
    expect(await response?.json()).toEqual({
      data: {
        referenceDate: '2026-09-30',
        items: [
          expect.objectContaining({
            kind: 'inspection',
            attention: 'today',
            inspectionCode: 'INS-WORK-HTTP',
          }),
        ],
      },
    });
  });

  it('does not claim unrelated routes', async () => {
    const repository = new InMemoryWorkRepository();

    const response = await handleWorkHttp(
      { workRepository: repository },
      manager,
      new Request('https://portfolio.test/properties'),
      '/properties',
    );

    expect(response).toBeNull();
  });
});
