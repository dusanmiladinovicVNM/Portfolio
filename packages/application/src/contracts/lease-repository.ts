import type {
  DateOnly,
  LeaseAgreement,
  LeaseAgreementId,
  LuzernerLeaseFormDraft,
  LeaseAmendment,
  LeaseAmendmentId,
  TenancyId,
  TenancyTermVersion,
} from '@portfolio/domain';
import type { LuzernerLeasePdfSnapshot } from './luzerner-lease-pdf-port.js';

export interface AgreementSupersession {
  readonly agreement: LeaseAgreement;
  readonly expectedVersion: number;
}

export interface LeaseRepository {
  getAgreementById(id: LeaseAgreementId): Promise<LeaseAgreement | null>;
  listAgreementsByTenancy(tenancyId: TenancyId): Promise<readonly LeaseAgreement[]>;
  agreementCodeExists(code: string): Promise<boolean>;
  successorExists(predecessorAgreementId: LeaseAgreementId): Promise<boolean>;
  insertAgreement(agreement: LeaseAgreement): Promise<void>;
  replaceAgreementParties(
    agreement: LeaseAgreement,
    expectedVersion: number,
  ): Promise<void>;
  signAgreement(
    agreement: LeaseAgreement,
    expectedVersion: number,
    terms: TenancyTermVersion,
    predecessorToSupersede?: AgreementSupersession,
    expectedLuzernerFormRevision?: number | null,
    luzernerPdfSnapshot?: LuzernerLeasePdfSnapshot | null,
  ): Promise<void>;
  cancelAgreement(
    agreement: LeaseAgreement,
    expectedVersion: number,
  ): Promise<void>;

  getLuzernerLeaseForm(
    agreementId: LeaseAgreementId,
  ): Promise<LuzernerLeaseFormDraft | null>;
  getLuzernerLeasePdfSnapshot(
    agreementId: LeaseAgreementId,
  ): Promise<LuzernerLeasePdfSnapshot | null>;
  insertLuzernerLeaseForm(form: LuzernerLeaseFormDraft): Promise<void>;
  updateLuzernerLeaseForm(
    form: LuzernerLeaseFormDraft,
    expectedRevision: number,
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
