import type { CostRepository } from '@portfolio/application';
import type {
  Cost,
  CostId,
  CostReversal,
  CostSource,
  PartyId,
} from '@portfolio/domain';

function sameSource(left: CostSource, right: CostSource): boolean {
  if (left.kind !== right.kind) return false;
  switch (left.kind) {
    case 'property':
      return right.kind === 'property' && left.propertyId === right.propertyId;
    case 'unit':
      return right.kind === 'unit' && left.unitId === right.unitId;
    case 'space':
      return right.kind === 'space' && left.spaceId === right.spaceId;
    case 'asset':
      return right.kind === 'asset' && left.assetId === right.assetId;
    case 'warranty_claim':
      return (
        right.kind === 'warranty_claim' &&
        left.warrantyClaimId === right.warrantyClaimId
      );
    case 'service_event':
      return (
        right.kind === 'service_event' &&
        left.serviceEventId === right.serviceEventId
      );
    case 'improvement_project':
      return (
        right.kind === 'improvement_project' &&
        left.improvementProjectId === right.improvementProjectId
      );
    case 'work_item':
      return right.kind === 'work_item' && left.workItemId === right.workItemId;
    case 'work_record':
      return (
        right.kind === 'work_record' &&
        left.workRecordId === right.workRecordId
      );
    case 'work_material':
      return (
        right.kind === 'work_material' &&
        left.workMaterialId === right.workMaterialId
      );
  }
}

export class InMemoryCostRepository implements CostRepository {
  readonly costs = new Map<CostId, Cost>();
  readonly reversals = new Map<CostId, CostReversal>();

  async getCostById(id: CostId): Promise<Cost | null> {
    return this.costs.get(id) ?? null;
  }

  async listCostsBySource(source: CostSource): Promise<readonly Cost[]> {
    return [...this.costs.values()].filter((cost) =>
      sameSource(cost.source, source),
    );
  }

  async listCostsBySupplier(partyId: PartyId): Promise<readonly Cost[]> {
    return [...this.costs.values()].filter(
      (cost) => cost.supplierPartyId === partyId,
    );
  }

  async listCostsByInvoiceReference(
    invoiceReference: string,
  ): Promise<readonly Cost[]> {
    return [...this.costs.values()].filter(
      (cost) => cost.invoiceReference === invoiceReference,
    );
  }

  async getReversalByCostId(costId: CostId): Promise<CostReversal | null> {
    return this.reversals.get(costId) ?? null;
  }

  async getReversalByReplacementCostId(
    costId: CostId,
  ): Promise<CostReversal | null> {
    return (
      [...this.reversals.values()].find(
        (reversal) => reversal.replacementCostId === costId,
      ) ?? null
    );
  }

  async insertCost(cost: Cost): Promise<void> {
    this.costs.set(cost.id, cost);
  }

  async insertReversal(reversal: CostReversal): Promise<void> {
    if (this.reversals.has(reversal.costId)) {
      throw new Error('cost already reversed');
    }
    this.reversals.set(reversal.costId, reversal);
  }

  async insertCorrection(
    replacementCost: Cost,
    reversal: CostReversal,
  ): Promise<void> {
    if (this.reversals.has(reversal.costId)) {
      throw new Error('cost already reversed');
    }
    this.costs.set(replacementCost.id, replacementCost);
    this.reversals.set(reversal.costId, reversal);
  }
}
