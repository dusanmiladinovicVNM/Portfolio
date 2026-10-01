import { describe, expect, it } from 'vitest';
import type { AssetResponse } from '@portfolio/contracts';
import type { PortfolioApi } from '../src/api/portfolio-api.js';
import { readMaintenanceAssetEnrichment } from '../src/dossier/maintenance-asset-enrichment.js';

const assetId = '11111111-1111-4111-8111-111111111111';
const otherAssetId = '22222222-2222-4222-8222-222222222222';

function asset(overrides: Partial<AssetResponse> = {}): AssetResponse {
  return {
    id: assetId,
    code: 'AST-1',
    name: 'Asset 1',
    propertyId: '33333333-3333-4333-8333-333333333333',
    unitId: null,
    spaceId: null,
    manufacturer: null,
    model: null,
    status: 'active',
    version: 1,
    identifiers: [],
    ...overrides,
  };
}

function apiReturning(value: AssetResponse): Pick<PortfolioApi, 'get'> {
  return {
    get: async () => value,
  } as unknown as Pick<PortfolioApi, 'get'>;
}

function apiFailing(): Pick<PortfolioApi, 'get'> {
  return {
    get: async () => {
      throw new Error('Current Asset lookup unavailable');
    },
  } as unknown as Pick<PortfolioApi, 'get'>;
}

describe('Maintenance Asset enrichment', () => {
  it('returns the exact current Asset when enrichment succeeds', async () => {
    await expect(
      readMaintenanceAssetEnrichment(apiReturning(asset()), assetId),
    ).resolves.toEqual(asset());
  });

  it('degrades an ordinary current Asset read failure to unavailable context', async () => {
    await expect(
      readMaintenanceAssetEnrichment(apiFailing(), assetId),
    ).resolves.toBeNull();
  });

  it('fails closed when the current Asset endpoint returns another identity', async () => {
    await expect(
      readMaintenanceAssetEnrichment(
        apiReturning(asset({ id: otherAssetId })),
        assetId,
      ),
    ).rejects.toThrow(
      'Maintenance current Asset lookup crossed its identity boundary.',
    );
  });
});
