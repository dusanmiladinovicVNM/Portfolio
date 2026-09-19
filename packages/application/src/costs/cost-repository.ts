import type {
  Cost,
  CostId,
  CostReversal,
  CostSource,
  PartyId,
} from '@portfolio/domain';

export interface CostRepository {
  getCostById(id: CostId): Promise<Cost | null>;
  listCostsBySource(source: CostSource): Promise<readonly Cost[]>;
  listCostsBySupplier(partyId: PartyId): Promise<readonly Cost[]>;
  listCostsByInvoiceReference(
    invoiceReference: string,
  ): Promise<readonly Cost[]>;
  getReversalByCostId(costId: CostId): Promise<CostReversal | null>;
  getReversalByReplacementCostId(
    costId: CostId,
  ): Promise<CostReversal | null>;
  insertCost(cost: Cost): Promise<void>;
  insertReversal(reversal: CostReversal): Promise<void>;
  insertCorrection(
    replacementCost: Cost,
    reversal: CostReversal,
  ): Promise<void>;
}
