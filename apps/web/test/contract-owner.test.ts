import { describe, expect, it } from 'vitest';
import type {
  LeaseAgreementResponse,
  LeaseAmendmentResponse,
  TenancyResponse,
} from '@portfolio/contracts';
import {
  assertAgreementAmendmentsOwner,
  assertAgreementMutationOwner,
  assertAmendmentMutationOwner,
  assertContractTenanciesOwner,
  assertTenancyAgreementsOwner,
} from '../src/dossier/contract-owner.js';

const unitA = '11111111-1111-4111-8111-111111111111';
const unitB = '22222222-2222-4222-8222-222222222222';
const tenancyA = '33333333-3333-4333-8333-333333333333';
const tenancyB = '44444444-4444-4444-8444-444444444444';
const agreementA = '55555555-5555-4555-8555-555555555555';
const agreementB = '66666666-6666-4666-8666-666666666666';
const amendmentA = '77777777-7777-4777-8777-777777777777';
const amendmentB = '88888888-8888-4888-8888-888888888888';

function tenancy(id: string, unitId: string): TenancyResponse {
  return {
    id,
    unitId,
    code: 'TEN',
    status: 'active',
    plannedStart: null,
    plannedEnd: null,
    actualStart: '2026-01-01',
    actualEnd: null,
    noticeGivenAt: null,
    terminationEffectiveAt: null,
    version: 1,
    parties: [],
  };
}

function agreement(
  id: string,
  tenancyId: string,
  version = 1,
): LeaseAgreementResponse {
  return {
    id,
    tenancyId,
    code: 'AGR',
    agreementType: 'initial',
    predecessorAgreementId: null,
    effectiveFrom: '2026-01-01',
    effectiveTo: null,
    status: 'draft',
    signedAt: null,
    version,
    parties: [],
  };
}

function amendment(
  id: string,
  agreementId: string,
  version = 1,
): LeaseAmendmentResponse {
  return {
    id,
    agreementId,
    code: 'AMD',
    title: 'Change',
    description: null,
    effectiveFrom: '2026-06-01',
    status: 'draft',
    signedAt: null,
    version,
  };
}

describe('Contract dossier owner guards', () => {
  it('rejects cross-owner nested reads', () => {
    expect(() =>
      assertContractTenanciesOwner(unitA, [tenancy(tenancyA, unitA)]),
    ).not.toThrow();
    expect(() =>
      assertContractTenanciesOwner(unitA, [tenancy(tenancyB, unitB)]),
    ).toThrow('another Unit');

    expect(() =>
      assertTenancyAgreementsOwner(
        tenancyA,
        [agreement(agreementA, tenancyA)],
      ),
    ).not.toThrow();
    expect(() =>
      assertTenancyAgreementsOwner(
        tenancyA,
        [agreement(agreementB, tenancyB)],
      ),
    ).toThrow('another Tenancy');

    expect(() =>
      assertAgreementAmendmentsOwner(
        agreementA,
        [amendment(amendmentA, agreementA)],
      ),
    ).not.toThrow();
    expect(() =>
      assertAgreementAmendmentsOwner(
        agreementA,
        [amendment(amendmentB, agreementB)],
      ),
    ).toThrow('another Agreement');
  });

  it('binds Agreement mutation completion to parent, target and CAS version', () => {
    expect(() =>
      assertAgreementMutationOwner(
        tenancyA,
        agreementA,
        2,
        agreement(agreementA, tenancyA, 3),
      ),
    ).not.toThrow();

    expect(() =>
      assertAgreementMutationOwner(
        tenancyA,
        agreementA,
        2,
        agreement(agreementB, tenancyA, 3),
      ),
    ).toThrow('command target');

    expect(() =>
      assertAgreementMutationOwner(
        tenancyA,
        agreementA,
        2,
        agreement(agreementA, tenancyB, 3),
      ),
    ).toThrow('another Tenancy');

    expect(() =>
      assertAgreementMutationOwner(
        tenancyA,
        agreementA,
        2,
        agreement(agreementA, tenancyA, 4),
      ),
    ).toThrow('expected version');
  });

  it('binds Amendment mutation completion to parent, target and CAS version', () => {
    expect(() =>
      assertAmendmentMutationOwner(
        agreementA,
        amendmentA,
        1,
        amendment(amendmentA, agreementA, 2),
      ),
    ).not.toThrow();

    expect(() =>
      assertAmendmentMutationOwner(
        agreementA,
        amendmentA,
        1,
        amendment(amendmentB, agreementA, 2),
      ),
    ).toThrow('command target');

    expect(() =>
      assertAmendmentMutationOwner(
        agreementA,
        amendmentA,
        1,
        amendment(amendmentA, agreementB, 2),
      ),
    ).toThrow('another Agreement');

    expect(() =>
      assertAmendmentMutationOwner(
        agreementA,
        amendmentA,
        1,
        amendment(amendmentA, agreementA, 3),
      ),
    ).toThrow('expected version');
  });
});
