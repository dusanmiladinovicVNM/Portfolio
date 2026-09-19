import { describe, expect, it } from 'vitest';
import {
  asAssetId,
  asMaintenanceIssueId,
  asMaintenanceWorkOrderId,
  asPropertyId,
  asServiceEventId,
  asUserId,
  assignMaintenanceWorkOrder,
  cancelMaintenanceIssue,
  completeMaintenanceWorkOrder,
  createMaintenanceIssue,
  createMaintenanceWorkOrder,
  createMaintenanceWorkOrderServiceEventLink,
  resolveMaintenanceIssue,
  startMaintenanceWorkOrder,
} from '../src/index.js';

const actor = asUserId('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
const propertyId = asPropertyId('11111111-1111-4111-8111-111111111111');
const assetId = asAssetId('22222222-2222-4222-8222-222222222222');

function issue() {
  return createMaintenanceIssue({
    id: asMaintenanceIssueId('33333333-3333-4333-8333-333333333333'),
    code: 'MI-1',
    propertyId,
    assetId,
    title: 'Boiler fault',
    priority: 'high',
    reportedAt: '2026-09-19T08:00:00.000Z',
    recordedAt: '2026-09-19T08:05:00.000Z',
    recordedByUserId: actor,
  });
}

function assignedOrder() {
  const draft = createMaintenanceWorkOrder({
    id: asMaintenanceWorkOrderId(
      '44444444-4444-4444-8444-444444444444',
    ),
    issue: issue(),
    code: 'MWO-1',
    title: 'Diagnose boiler',
    createdAt: '2026-09-19T08:10:00.000Z',
    createdByUserId: actor,
  });
  return assignMaintenanceWorkOrder(
    draft,
    { kind: 'user', userId: actor },
    '2026-09-19T08:15:00.000Z',
  );
}

describe('Maintenance domain', () => {
  it('keeps reported occurrence before immutable recording provenance', () => {
    expect(() =>
      createMaintenanceIssue({
        id: asMaintenanceIssueId(
          '33333333-3333-4333-8333-333333333334',
        ),
        code: 'MI-2',
        propertyId,
        title: 'Leak',
        priority: 'normal',
        reportedAt: '2026-09-19T09:00:00.000Z',
        recordedAt: '2026-09-19T08:00:00.000Z',
        recordedByUserId: actor,
      }),
    ).toThrowError(
      expect.objectContaining({ code: 'MAINTENANCE_TIMESTAMP_ORDER_INVALID' }),
    );
  });

  it('requires completed work before Issue resolution', () => {
    expect(() =>
      resolveMaintenanceIssue(
        issue(),
        [],
        '2026-09-19T10:00:00.000Z',
      ),
    ).toThrowError(
      expect.objectContaining({
        code: 'MAINTENANCE_ISSUE_COMPLETED_WORK_REQUIRED',
      }),
    );
  });

  it('requires every WorkOrder cancelled before Issue cancellation', () => {
    const order = assignedOrder();
    expect(() =>
      cancelMaintenanceIssue(
        issue(),
        [order],
        '2026-09-19T10:00:00.000Z',
      ),
    ).toThrowError(
      expect.objectContaining({
        code: 'MAINTENANCE_ISSUE_NON_CANCELLED_WORK_ORDERS',
      }),
    );
  });

  it('does not allow reassignment time to move backwards', () => {
    const order = assignedOrder();
    expect(() =>
      assignMaintenanceWorkOrder(
        order,
        { kind: 'user', userId: actor },
        '2026-09-19T08:14:59.000Z',
      ),
    ).toThrowError(
      expect.objectContaining({ code: 'MAINTENANCE_TIMESTAMP_ORDER_INVALID' }),
    );
  });

  it('requires WorkOrder completion after every linked service occurrence', () => {
    const started = startMaintenanceWorkOrder(
      assignedOrder(),
      '2026-09-19T08:20:00.000Z',
    );

    expect(() =>
      completeMaintenanceWorkOrder(
        started,
        '2026-09-19T08:30:00.000Z',
        [{ performedAt: '2026-09-19T08:31:00.000Z' }],
      ),
    ).toThrowError(
      expect.objectContaining({
        code: 'MAINTENANCE_WORK_ORDER_COMPLETION_BEFORE_SERVICE',
      }),
    );
  });

  it('links ServiceEvent only to the exact Issue Asset and execution interval', () => {
    const started = startMaintenanceWorkOrder(
      assignedOrder(),
      '2026-09-19T08:20:00.000Z',
    );

    expect(() =>
      createMaintenanceWorkOrderServiceEventLink({
        issue: issue(),
        workOrder: started,
        serviceEvent: {
          id: asServiceEventId(
            '55555555-5555-4555-8555-555555555555',
          ),
          assetId: asAssetId(
            '66666666-6666-4666-8666-666666666666',
          ),
          performedAt: '2026-09-19T08:25:00.000Z',
          recordedAt: '2026-09-19T08:26:00.000Z',
        },
        linkedAt: '2026-09-19T08:27:00.000Z',
        linkedByUserId: actor,
      }),
    ).toThrowError(
      expect.objectContaining({
        code: 'MAINTENANCE_SERVICE_EVENT_ASSET_MISMATCH',
      }),
    );

    const link = createMaintenanceWorkOrderServiceEventLink({
      issue: issue(),
      workOrder: started,
      serviceEvent: {
        id: asServiceEventId('55555555-5555-4555-8555-555555555555'),
        assetId,
        performedAt: '2026-09-19T08:25:00.000Z',
        recordedAt: '2026-09-19T08:26:00.000Z',
      },
      linkedAt: '2026-09-19T08:27:00.000Z',
      linkedByUserId: actor,
    });

    expect(link).toMatchObject({
      workOrderId: started.id,
      serviceEventId: '55555555-5555-4555-8555-555555555555',
    });
  });
});
