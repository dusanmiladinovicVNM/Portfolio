import {
  DomainError,
  type Cost,
  type CostId,
  type CostSource,
  type PartyId,
} from '@portfolio/domain';
import {
  requireCapability,
  type Actor,
} from '../security/access.js';
import type { CostRepository } from './cost-repository.js';

async function ledgerEntry(repository: CostRepository, cost: Cost) {
  const [reversal, incomingCorrection] = await Promise.all([
    repository.getReversalByCostId(cost.id),
    repository.getReversalByReplacementCostId(cost.id),
  ]);
  return { cost, reversal, incomingCorrection };
}

export async function getCostQuery(
  repository: CostRepository,
  actor: Actor,
  costId: CostId,
) {
  requireCapability(actor, 'costs:read');
  const cost = await repository.getCostById(costId);
  if (!cost) {
    throw new DomainError('COST_NOT_FOUND', 'Cost not found.');
  }
  return ledgerEntry(repository, cost);
}

export async function listCostsBySourceQuery(
  repository: CostRepository,
  actor: Actor,
  source: CostSource,
) {
  requireCapability(actor, 'costs:read');
  const costs = await repository.listCostsBySource(source);
  return Promise.all(costs.map((cost) => ledgerEntry(repository, cost)));
}

export async function listCostsBySupplierQuery(
  repository: CostRepository,
  actor: Actor,
  partyId: PartyId,
) {
  requireCapability(actor, 'costs:read');
  const costs = await repository.listCostsBySupplier(partyId);
  return Promise.all(costs.map((cost) => ledgerEntry(repository, cost)));
}

export async function listCostsByInvoiceReferenceQuery(
  repository: CostRepository,
  actor: Actor,
  invoiceReference: string,
) {
  requireCapability(actor, 'costs:read');
  const normalized = invoiceReference.trim();
  if (!normalized) {
    throw new DomainError(
      'COST_INVOICE_REFERENCE_REQUIRED',
      'Invoice reference is required.',
    );
  }
  const costs = await repository.listCostsByInvoiceReference(normalized);
  return Promise.all(costs.map((cost) => ledgerEntry(repository, cost)));
}
