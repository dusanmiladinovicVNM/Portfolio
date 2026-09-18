import { asDateOnly, type DateOnly } from '../shared/date-only.js';
import { DomainError } from '../shared/domain-error.js';
import type {
  LeaseAgreementId,
  LeaseAmendmentId,
} from '../shared/entity-id.js';

export const LEASE_AMENDMENT_STATUSES = ['draft', 'signed', 'cancelled'] as const;
export type LeaseAmendmentStatus = (typeof LEASE_AMENDMENT_STATUSES)[number];

export interface LeaseAmendment {
  readonly id: LeaseAmendmentId;
  readonly agreementId: LeaseAgreementId;
  readonly code: string;
  readonly title: string;
  readonly description: string | null;
  readonly effectiveFrom: DateOnly;
  readonly status: LeaseAmendmentStatus;
  readonly signedAt: DateOnly | null;
  readonly version: number;
}

export interface CreateLeaseAmendmentInput {
  id: LeaseAmendmentId;
  agreementId: LeaseAgreementId;
  code: string;
  title: string;
  description?: string | null;
  effectiveFrom: string;
}

function required(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new DomainError('LEASE_AMENDMENT_REQUIRED_FIELD', `${field} is required.`);
  }
  return normalized;
}

export function createLeaseAmendment(
  input: CreateLeaseAmendmentInput,
): LeaseAmendment {
  return {
    id: input.id,
    agreementId: input.agreementId,
    code: required(input.code, 'code'),
    title: required(input.title, 'title'),
    description: input.description?.trim() || null,
    effectiveFrom: asDateOnly(input.effectiveFrom),
    status: 'draft',
    signedAt: null,
    version: 1,
  };
}

export function signLeaseAmendment(
  amendment: LeaseAmendment,
  signedAtValue: string,
): LeaseAmendment {
  if (amendment.status !== 'draft') {
    throw new DomainError(
      'LEASE_AMENDMENT_INVALID_TRANSITION',
      `Cannot sign amendment from status ${amendment.status}.`,
    );
  }

  return {
    ...amendment,
    status: 'signed',
    signedAt: asDateOnly(signedAtValue),
    version: amendment.version + 1,
  };
}

export function cancelLeaseAmendment(
  amendment: LeaseAmendment,
): LeaseAmendment {
  if (amendment.status !== 'draft') {
    throw new DomainError(
      'LEASE_AMENDMENT_INVALID_TRANSITION',
      'Only a draft amendment can be cancelled.',
    );
  }

  return {
    ...amendment,
    status: 'cancelled',
    version: amendment.version + 1,
  };
}
