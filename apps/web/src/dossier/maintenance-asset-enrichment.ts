import {
  assetResponseSchema,
  type AssetResponse,
} from '@portfolio/contracts';
import { assetPath } from '../api/paths.js';
import type {
  PortfolioApi,
  PortfolioApiRequestOptions,
} from '../api/portfolio-api.js';

export async function readMaintenanceAssetEnrichment(
  api: Pick<PortfolioApi, 'get'>,
  assetId: string,
  options?: PortfolioApiRequestOptions,
): Promise<AssetResponse | null> {
  let asset: AssetResponse;

  try {
    asset = await api.get(
      assetPath(assetId),
      assetResponseSchema,
      options,
    );
  } catch {
    return null;
  }

  if (asset.id !== assetId) {
    throw new Error(
      'Maintenance current Asset lookup crossed its identity boundary.',
    );
  }

  return asset;
}
