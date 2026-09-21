import { describe, expect, it } from 'vitest';
import {
  leaseAgreementListResponseSchema,
  leaseAmendmentListResponseSchema,
  tenancyListResponseSchema,
} from '@portfolio/contracts';
import {
  agreementAmendmentsPath,
  tenancyAgreementsPath,
  tenancyTermsPath,
  unitTenanciesPath,
} from '../src/api/paths.js';

describe('Tenancy and Contract dossier contracts', () => {
  it('keeps Unit/Tenancy/Agreement reads explicitly scoped', () => {
    const unitId = '11111111-1111-4111-8111-111111111111';
    const tenancyId = '22222222-2222-4222-8222-222222222222';
    const agreementId = '33333333-3333-4333-8333-333333333333';

    expect(unitTenanciesPath(unitId)).toBe(`/units/${unitId}/tenancies`);
    expect(tenancyAgreementsPath(tenancyId)).toBe(
      `/tenancies/${tenancyId}/agreements`,
    );
    expect(tenancyTermsPath(tenancyId, '2025-06-30')).toBe(
      `/tenancies/${tenancyId}/terms?at=2025-06-30`,
    );
    expect(agreementAmendmentsPath(agreementId)).toBe(
      `/agreements/${agreementId}/amendments`,
    );
  });

  it('provides named list schemas for existing HTTP envelopes', () => {
    expect(tenancyListResponseSchema.parse({ items: [] })).toEqual({ items: [] });
    expect(leaseAgreementListResponseSchema.parse({ items: [] })).toEqual({
      items: [],
    });
    expect(leaseAmendmentListResponseSchema.parse({ items: [] })).toEqual({
      items: [],
    });
  });
});
