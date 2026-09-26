import type {
  LeaseAgreementId,
  LuzernLeaseProfile,
} from '@portfolio/domain';

export interface LuzernLeaseProfileRepository {
  getByAgreementId(
    agreementId: LeaseAgreementId,
  ): Promise<LuzernLeaseProfile | null>;

  save(
    profile: LuzernLeaseProfile,
    expectedRevision: number | null,
  ): Promise<void>;
}
