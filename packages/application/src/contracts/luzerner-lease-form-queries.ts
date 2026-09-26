import {
  DomainError,
  type LeaseAgreementId,
  type LuzernerLeaseFormDraft,
} from '@portfolio/domain';
import { requireCapability, type Actor } from '../security/access.js';
import type { LeaseRepository } from './lease-repository.js';

export async function getLuzernerLeaseFormQuery(
  repository: LeaseRepository,
  actor: Actor,
  agreementId: LeaseAgreementId,
): Promise<LuzernerLeaseFormDraft> {
  requireCapability(actor, 'contracts:read');

  if (!(await repository.getAgreementById(agreementId))) {
    throw new DomainError(
      'LEASE_AGREEMENT_NOT_FOUND',
      'Lease agreement not found.',
    );
  }

  const form = await repository.getLuzernerLeaseForm(agreementId);
  if (!form) {
    throw new DomainError(
      'LUZERNER_LEASE_FORM_NOT_FOUND',
      'No Luzerner lease form exists for this agreement.',
    );
  }

  return form;
}
