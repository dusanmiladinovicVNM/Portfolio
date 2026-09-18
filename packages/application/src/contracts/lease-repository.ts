import type {
  DateOnly,
  LeaseAgreement,
  LeaseAgreementId,
  LeaseAmendment,
  LeaseAmendmentId,
  TenancyId,
  TenancyTermVersion,
} from '@portfolio/domain';

export interface LeaseRepository {
  getAgreementById(id: LeaseAgreementId): Promise<LeaseAgreement | null>;
  listAgreementsByTenancy(tenancyId: TenancyId): Promise<readonly LeaseAgreement[]>;
  agreementCodeExists(code: string): Promise<boolean>;
  insertAgreement(agreement: LeaseAgreement): Promise<void>;
  signAgreement(
    agreement: LeaseAgreement,
    expectedVersion: number,
    terms: TenancyTermVersion,
  ): Promise<void>;
  cancelAgreement(
    agreement: LeaseAgreement,
    expectedVersion: number,
  ): Promise<void>;

  getAmendmentById(id: LeaseAmendmentId): Promise<LeaseAmendment | null>;
  listAmendmentsByAgreement(
    agreementId: LeaseAgreementId,
  ): Promise<readonly LeaseAmendment[]>;
  amendmentCodeExists(code: string): Promise<boolean>;
  insertAmendment(amendment: LeaseAmendment): Promise<void>;
  signAmendment(
    amendment: LeaseAmendment,
    expectedVersion: number,
    terms: TenancyTermVersion,
  ): Promise<void>;
  cancelAmendment(
    amendment: LeaseAmendment,
    expectedVersion: number,
  ): Promise<void>;

  getEffectiveTermsAt(
    tenancyId: TenancyId,
    effectiveAt: DateOnly,
  ): Promise<TenancyTermVersion | null>;
}
