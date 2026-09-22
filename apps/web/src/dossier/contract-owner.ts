import type {
  LeaseAgreementResponse,
  LeaseAmendmentResponse,
  TenancyResponse,
} from '@portfolio/contracts';

export function assertContractTenanciesOwner(
  unitId: string,
  tenancies: readonly TenancyResponse[],
): void {
  if (tenancies.some((tenancy) => tenancy.unitId !== unitId)) {
    throw new Error(
      'Contract Tenancy list contains a Tenancy owned by another Unit.',
    );
  }
}

export function assertTenancyAgreementsOwner(
  tenancyId: string,
  agreements: readonly LeaseAgreementResponse[],
): void {
  if (agreements.some((agreement) => agreement.tenancyId !== tenancyId)) {
    throw new Error(
      'Tenancy Agreement list contains an Agreement owned by another Tenancy.',
    );
  }
}

export function assertAgreementAmendmentsOwner(
  agreementId: string,
  amendments: readonly LeaseAmendmentResponse[],
): void {
  if (amendments.some((amendment) => amendment.agreementId !== agreementId)) {
    throw new Error(
      'Agreement Amendment list contains an Amendment owned by another Agreement.',
    );
  }
}

export function assertAgreementMutationOwner(
  tenancyId: string,
  agreementId: string,
  expectedVersion: number,
  agreement: LeaseAgreementResponse,
): void {
  if (agreement.id !== agreementId) {
    throw new Error(
      'Agreement mutation response does not match the command target.',
    );
  }
  if (agreement.tenancyId !== tenancyId) {
    throw new Error(
      'Agreement mutation response belongs to another Tenancy.',
    );
  }
  if (agreement.version !== expectedVersion + 1) {
    throw new Error(
      'Agreement mutation response does not advance the expected version.',
    );
  }
}

export function assertAmendmentMutationOwner(
  agreementId: string,
  amendmentId: string,
  expectedVersion: number,
  amendment: LeaseAmendmentResponse,
): void {
  if (amendment.id !== amendmentId) {
    throw new Error(
      'Amendment mutation response does not match the command target.',
    );
  }
  if (amendment.agreementId !== agreementId) {
    throw new Error(
      'Amendment mutation response belongs to another Agreement.',
    );
  }
  if (amendment.version !== expectedVersion + 1) {
    throw new Error(
      'Amendment mutation response does not advance the expected version.',
    );
  }
}
