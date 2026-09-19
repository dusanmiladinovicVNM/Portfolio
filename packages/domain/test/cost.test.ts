import { describe, expect, it } from 'vitest';
import {
  asCostId,
  asCostReversalId,
  asImprovementProjectId,
  asPartyId,
  asPropertyId,
  asUserId,
  createCost,
  createCostReversal,
} from '../src/index.js';

const userId = asUserId('ab000000-0000-4000-8000-000000000001');

describe('Unified Cost Ledger domain', () => {
  it('creates one exact positive monetary allocation to one source', () => {
    const cost = createCost({
      id: asCostId('ab000000-0000-4000-8000-000000000002'),
      source: {
        kind: 'improvement_project',
        improvementProjectId: asImprovementProjectId(
          'ab000000-0000-4000-8000-000000000003',
        ),
      },
      description: 'Cabinet installation',
      amount: '1250.5',
      currency: 'eur',
      incurredOn: '2026-09-18',
      reportingClass: 'capex',
      supplierPartyId: asPartyId(
        'ab000000-0000-4000-8000-000000000004',
      ),
      invoiceReference: ' INV-77 ',
      recordedAt: '2026-09-19T10:00:00.000Z',
      recordedByUserId: userId,
    });

    expect(cost).toMatchObject({
      amount: '1250.50',
      currency: 'EUR',
      incurredOn: '2026-09-18',
      reportingClass: 'capex',
      invoiceReference: 'INV-77',
      source: { kind: 'improvement_project' },
    });
  });

  it('rejects zero or future financial facts', () => {
    expect(() =>
      createCost({
        id: asCostId('ab000000-0000-4000-8000-000000000005'),
        source: {
          kind: 'property',
          propertyId: asPropertyId(
            'ab000000-0000-4000-8000-000000000006',
          ),
        },
        description: 'Impossible zero',
        amount: '0',
        currency: 'EUR',
        incurredOn: '2026-09-19',
        reportingClass: 'opex',
        recordedAt: '2026-09-19T10:00:00.000Z',
        recordedByUserId: userId,
      }),
    ).toThrowError(/greater than zero/);

    expect(() =>
      createCost({
        id: asCostId('ab000000-0000-4000-8000-000000000007'),
        source: {
          kind: 'property',
          propertyId: asPropertyId(
            'ab000000-0000-4000-8000-000000000008',
          ),
        },
        description: 'Future cost',
        amount: '10',
        currency: 'EUR',
        incurredOn: '2026-09-20',
        reportingClass: 'opex',
        recordedAt: '2026-09-19T23:00:00.000Z',
        recordedByUserId: userId,
      }),
    ).toThrowError(/UTC recording date/);
  });

  it('rejects unsupported three-letter currency codes', () => {
    expect(() =>
      createCost({
        id: asCostId('ab000000-0000-4000-8000-000000000016'),
        source: {
          kind: 'property',
          propertyId: asPropertyId(
            'ab000000-0000-4000-8000-000000000017',
          ),
        },
        description: 'Unsupported currency',
        amount: '10',
        currency: 'ZZZ',
        incurredOn: '2026-09-18',
        reportingClass: 'opex',
        recordedAt: '2026-09-19T10:00:00.000Z',
        recordedByUserId: userId,
      }),
    ).toThrowError(/Cost currency must be one of/);
  });

  it('preserves correction history as reversal plus replacement', () => {
    const original = createCost({
      id: asCostId('ab000000-0000-4000-8000-000000000009'),
      source: {
        kind: 'property',
        propertyId: asPropertyId(
          'ab000000-0000-4000-8000-000000000010',
        ),
      },
      description: 'Wrong amount',
      amount: '1000',
      currency: 'CHF',
      incurredOn: '2026-09-10',
      reportingClass: 'unclassified',
      recordedAt: '2026-09-19T09:00:00.000Z',
      recordedByUserId: userId,
    });
    const replacement = createCost({
      id: asCostId('ab000000-0000-4000-8000-000000000011'),
      source: original.source,
      description: 'Correct amount',
      amount: '950',
      currency: 'CHF',
      incurredOn: '2026-09-10',
      reportingClass: 'opex',
      recordedAt: '2026-09-19T11:00:00.000Z',
      recordedByUserId: userId,
    });

    const reversal = createCostReversal({
      id: asCostReversalId('ab000000-0000-4000-8000-000000000012'),
      cost: original,
      replacementCost: replacement,
      reason: 'Invoice amount corrected',
      recordedAt: '2026-09-19T11:00:00.000Z',
      recordedByUserId: userId,
    });

    expect(reversal).toMatchObject({
      costId: original.id,
      replacementCostId: replacement.id,
    });

    const otherUserId = asUserId(
      'ab000000-0000-4000-8000-000000000018',
    );
    const replacementByOtherUser = createCost({
      id: asCostId('ab000000-0000-4000-8000-000000000019'),
      source: original.source,
      description: 'Different recorder',
      amount: '925',
      currency: 'CHF',
      incurredOn: '2026-09-10',
      reportingClass: 'opex',
      recordedAt: '2026-09-19T12:00:00.000Z',
      recordedByUserId: otherUserId,
    });

    expect(() =>
      createCostReversal({
        id: asCostReversalId('ab000000-0000-4000-8000-000000000020'),
        cost: replacement,
        replacementCost: replacementByOtherUser,
        reason: 'Recorder mismatch',
        recordedAt: '2026-09-19T12:00:00.000Z',
        recordedByUserId: userId,
      }),
    ).toThrowError(/same recordedByUserId/);
  });

  it('rejects reversal before original recording time', () => {
    const original = createCost({
      id: asCostId('ab000000-0000-4000-8000-000000000013'),
      source: {
        kind: 'property',
        propertyId: asPropertyId(
          'ab000000-0000-4000-8000-000000000014',
        ),
      },
      description: 'Original',
      amount: '50',
      currency: 'EUR',
      incurredOn: '2026-09-18',
      reportingClass: 'opex',
      recordedAt: '2026-09-19T10:00:00.000Z',
      recordedByUserId: userId,
    });

    expect(() =>
      createCostReversal({
        id: asCostReversalId('ab000000-0000-4000-8000-000000000015'),
        cost: original,
        reason: 'Impossible reversal',
        recordedAt: '2026-09-19T09:00:00.000Z',
        recordedByUserId: userId,
      }),
    ).toThrowError(/before the original Cost/);
  });
});
