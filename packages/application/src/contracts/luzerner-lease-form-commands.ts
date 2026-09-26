import {
  DomainError,
  createLuzernerLeaseFormDraft,
  reviseLuzernerLeaseFormDraft,
  type LeaseAgreementId,
  type LuzernerLeaseFormContentInput,
  type LuzernerLeaseFormDraft,
} from '@portfolio/domain';
import { requireCapability, type Actor } from '../security/access.js';
import type { LeaseRepository } from './lease-repository.js';

async function requireAgreement(
  repository: LeaseRepository,
  agreementId: LeaseAgreementId,
) {
  const agreement = await repository.getAgreementById(agreementId);
  if (!agreement) {
    throw new DomainError(
      'LEASE_AGREEMENT_NOT_FOUND',
      'Lease agreement not found.',
    );
  }
  return agreement;
}

export async function saveLuzernerLeaseFormCommand(
  repository: LeaseRepository,
  actor: Actor,
  agreementId: LeaseAgreementId,
  expectedRevision: number | null,
  content: LuzernerLeaseFormContentInput,
): Promise<LuzernerLeaseFormDraft> {
  requireCapability(actor, 'contracts:write');

  const agreement = await requireAgreement(repository, agreementId);
  if (agreement.status !== 'draft') {
    throw new DomainError(
      'LUZERNER_LEASE_FORM_AGREEMENT_NOT_DRAFT',
      'The Luzerner lease form can only be edited while its agreement is draft.',
    );
  }

  const current = await repository.getLuzernerLeaseForm(agreementId);

  if (expectedRevision === null) {
    if (current !== null) {
      throw new DomainError(
        'LUZERNER_LEASE_FORM_ALREADY_EXISTS',
        'A Luzerner lease form already exists for this agreement.',
      );
    }

    const created = createLuzernerLeaseFormDraft(agreementId, content);
    await repository.insertLuzernerLeaseForm(created);
    return created;
  }

  if (current === null) {
    throw new DomainError(
      'LUZERNER_LEASE_FORM_NOT_FOUND',
      'The Luzerner lease form does not exist.',
    );
  }

  if (current.revision !== expectedRevision) {
    throw new DomainError(
      'LUZERNER_LEASE_FORM_REVISION_CONFLICT',
      'The Luzerner lease form changed since the caller last read it.',
    );
  }

  const revised = reviseLuzernerLeaseFormDraft(current, content);
  await repository.updateLuzernerLeaseForm(revised, expectedRevision);
  return revised;
}
