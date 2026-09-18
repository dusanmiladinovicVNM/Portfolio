import { asDateOnly, type DateOnly } from '../shared/date-only.js';
import { DomainError } from '../shared/domain-error.js';
import type {
  LeaseAgreementId,
  LeaseAgreementPartyId,
  PartyId,
  TenancyId,
} from '../shared/entity-id.js';

export const LEASE_AGREEMENT_TYPES = ['initial', 'renewal', 'replacement'] as const;
export const LEASE_AGREEMENT_STATUSES = [
  'draft',
  'signed',
  'superseded',
  'terminated',
  'cancelled',
] as const;
export const LEASE_AGREEMENT_PARTY_ROLES = [
  'landlord',
  'tenant',
  'co_tenant',
  'guarantor',
  'authorized_signatory',
] as const;

export type LeaseAgreementType = (typeof LEASE_AGREEMENT_TYPES)[number];
export type LeaseAgreementStatus = (typeof LEASE_AGREEMENT_STATUSES)[number];
export type LeaseAgreementPartyRole = (typeof LEASE_AGREEMENT_PARTY_ROLES)[number];

export interface LeaseAgreementParty {
  readonly id: LeaseAgreementPartyId;
  readonly agreementId: LeaseAgreementId;
  readonly partyId: PartyId;
  readonly role: LeaseAgreementPartyRole;
}

export interface LeaseAgreement {
  readonly id: LeaseAgreementId;
  readonly tenancyId: TenancyId;
  readonly code: string;
  readonly agreementType: LeaseAgreementType;
  readonly effectiveFrom: DateOnly;
  readonly effectiveTo: DateOnly | null;
  readonly status: LeaseAgreementStatus;
  readonly signedAt: DateOnly | null;
  readonly version: number;
  readonly parties: readonly LeaseAgreementParty[];
}

export interface CreateLeaseAgreementPartyInput {
  id: LeaseAgreementPartyId;
  partyId: PartyId;
  role: LeaseAgreementPartyRole;
}

export interface CreateLeaseAgreementInput {
  id: LeaseAgreementId;
  tenancyId: TenancyId;
  code: string;
  agreementType: LeaseAgreementType;
  effectiveFrom: string;
  effectiveTo?: string | null;
  parties: readonly CreateLeaseAgreementPartyInput[];
}

function required(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new DomainError('LEASE_AGREEMENT_REQUIRED_FIELD', `${field} is required.`);
  }
  return normalized;
}

function validateParties(
  agreementId: LeaseAgreementId,
  inputs: readonly CreateLeaseAgreementPartyInput[],
): readonly LeaseAgreementParty[] {
  const seen = new Set<string>();

  return inputs.map((input) => {
    const key = `${input.partyId}:${input.role}`;
    if (seen.has(key)) {
      throw new DomainError(
        'LEASE_AGREEMENT_PARTY_ALREADY_EXISTS',
        'The same party cannot have the same agreement role twice.',
      );
    }
    seen.add(key);

    return {
      id: input.id,
      agreementId,
      partyId: input.partyId,
      role: input.role,
    };
  });
}

export function createLeaseAgreement(
  input: CreateLeaseAgreementInput,
): LeaseAgreement {
  const effectiveFrom = asDateOnly(input.effectiveFrom);
  const effectiveTo =
    input.effectiveTo === undefined || input.effectiveTo === null
      ? null
      : asDateOnly(input.effectiveTo);

  if (effectiveTo !== null && effectiveTo < effectiveFrom) {
    throw new DomainError(
      'LEASE_AGREEMENT_INVALID_PERIOD',
      'effectiveTo cannot be earlier than effectiveFrom.',
    );
  }

  return {
    id: input.id,
    tenancyId: input.tenancyId,
    code: required(input.code, 'code'),
    agreementType: input.agreementType,
    effectiveFrom,
    effectiveTo,
    status: 'draft',
    signedAt: null,
    version: 1,
    parties: validateParties(input.id, input.parties),
  };
}

export function signLeaseAgreement(
  agreement: LeaseAgreement,
  signedAtValue: string,
): LeaseAgreement {
  if (agreement.status !== 'draft') {
    throw new DomainError(
      'LEASE_AGREEMENT_INVALID_TRANSITION',
      `Cannot sign agreement from status ${agreement.status}.`,
    );
  }

  const hasLandlord = agreement.parties.some((party) => party.role === 'landlord');
  const hasTenant = agreement.parties.some(
    (party) => party.role === 'tenant' || party.role === 'co_tenant',
  );

  if (!hasLandlord || !hasTenant) {
    throw new DomainError(
      'LEASE_AGREEMENT_MISSING_REQUIRED_PARTIES',
      'A signed lease agreement requires at least one landlord and one tenant/co-tenant.',
    );
  }

  return {
    ...agreement,
    status: 'signed',
    signedAt: asDateOnly(signedAtValue),
    version: agreement.version + 1,
  };
}

export function cancelLeaseAgreement(
  agreement: LeaseAgreement,
): LeaseAgreement {
  if (agreement.status !== 'draft') {
    throw new DomainError(
      'LEASE_AGREEMENT_INVALID_TRANSITION',
      'Only a draft agreement can be cancelled.',
    );
  }

  return {
    ...agreement,
    status: 'cancelled',
    version: agreement.version + 1,
  };
}
