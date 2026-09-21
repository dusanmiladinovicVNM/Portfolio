import { describe, expect, it } from 'vitest';
import {
  asUnitId,
  asUserId,
  createUnitTimelineEvent,
} from '../src/index.js';

const unitId = asUnitId('11111111-1111-4111-8111-111111111111');
const actor = asUserId('22222222-2222-4222-8222-222222222222');

describe('Unit timeline event model', () => {
  it('preserves date-only business facts without inventing clock precision', () => {
    const event = createUnitTimelineEvent({
      eventKey: 'tenancy.started:33333333-3333-4333-8333-333333333333',
      unitId,
      category: 'tenancy',
      eventType: 'tenancy.started',
      precision: 'date',
      occurredOn: '2026-09-20',
      occurredAt: null,
      recordedAt: null,
      recordedByUserId: null,
      sourceType: 'tenancy',
      sourceId: '33333333-3333-4333-8333-333333333333',
      relatedEntityType: null,
      relatedEntityId: null,
      details: { code: 'TEN-001' },
    });

    expect(event).toMatchObject({
      precision: 'date',
      occurredOn: '2026-09-20',
      occurredAt: null,
    });
  });

  it('canonicalizes instant events and requires occurredOn to match UTC date', () => {
    const event = createUnitTimelineEvent({
      eventKey: 'meter.reading:44444444-4444-4444-8444-444444444444',
      unitId,
      category: 'meter',
      eventType: 'meter.reading',
      precision: 'instant',
      occurredOn: '2026-09-19',
      occurredAt: '2026-09-20T00:30:00+02:00',
      recordedAt: '2026-09-20T03:00:00+02:00',
      recordedByUserId: actor,
      sourceType: 'meter_reading',
      sourceId: '44444444-4444-4444-8444-444444444444',
      relatedEntityType: 'meter',
      relatedEntityId: '55555555-5555-4555-8555-555555555555',
      details: { value: '123.450000' },
    });

    expect(event).toMatchObject({
      occurredOn: '2026-09-19',
      occurredAt: '2026-09-19T22:30:00.000Z',
      recordedAt: '2026-09-20T01:00:00.000Z',
    });

    expect(() =>
      createUnitTimelineEvent({
        ...event,
        occurredOn: '2026-09-20',
      }),
    ).toThrowError(
      expect.objectContaining({ code: 'UNIT_TIMELINE_INVALID_EVENT' }),
    );
  });

  it('rejects eventKey drift from eventType plus canonical source identity', () => {
    expect(() =>
      createUnitTimelineEvent({
        eventKey: 'nonsense',
        unitId,
        category: 'meter',
        eventType: 'meter.reading',
        precision: 'instant',
        occurredOn: '2026-09-20',
        occurredAt: '2026-09-20T10:00:00Z',
        recordedAt: '2026-09-20T10:01:00Z',
        recordedByUserId: actor,
        sourceType: 'meter_reading',
        sourceId: '44444444-4444-4444-8444-444444444444',
        relatedEntityType: 'meter',
        relatedEntityId: '55555555-5555-4555-8555-555555555555',
        details: {},
      }),
    ).toThrowError(
      expect.objectContaining({ code: 'UNIT_TIMELINE_INVALID_EVENT' }),
    );
  });

  it('rejects event type/category drift and fake date-only instants', () => {
    expect(() =>
      createUnitTimelineEvent({
        eventKey: 'bad',
        unitId,
        category: 'asset',
        eventType: 'tenancy.ended',
        precision: 'date',
        occurredOn: '2026-09-20',
        occurredAt: null,
        recordedAt: null,
        recordedByUserId: null,
        sourceType: 'tenancy',
        sourceId: '33333333-3333-4333-8333-333333333333',
        relatedEntityType: null,
        relatedEntityId: null,
        details: {},
      }),
    ).toThrowError(
      expect.objectContaining({ code: 'UNIT_TIMELINE_INVALID_EVENT' }),
    );

    expect(() =>
      createUnitTimelineEvent({
        eventKey: 'bad-date',
        unitId,
        category: 'tenancy',
        eventType: 'tenancy.started',
        precision: 'date',
        occurredOn: '2026-09-20',
        occurredAt: '2026-09-20T00:00:00Z',
        recordedAt: null,
        recordedByUserId: null,
        sourceType: 'tenancy',
        sourceId: '33333333-3333-4333-8333-333333333333',
        relatedEntityType: null,
        relatedEntityId: null,
        details: {},
      }),
    ).toThrowError(
      expect.objectContaining({ code: 'UNIT_TIMELINE_INVALID_EVENT' }),
    );
  });
});
