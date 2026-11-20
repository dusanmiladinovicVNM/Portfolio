import {
  asDateOnly,
  type Inspection,
  type OwnershipPeriod,
  type PartyId,
  type Tenancy,
} from '@portfolio/domain';

/**
 * Shared business predicates for signatory Party roles.
 *
 * The form's selectable Party list and the actual signature command MUST
 * use the same rules. The command still verifies the Party exists and
 * rechecks these predicates at POST time; the list never grants authority.
 */
export function inspectionTenantSignerPartyIds(
  tenancy: Tenancy | null,
): readonly PartyId[] {
  if (!tenancy) return [];
  return [...new Set(
    tenancy.parties
      .filter((entry) => entry.role === 'tenant' || entry.role === 'co_tenant')
      .map((entry) => entry.partyId),
  )];
}

export function inspectionLandlordSignerPartyIds(
  inspection: Inspection,
  ownershipPeriods: readonly OwnershipPeriod[],
): readonly PartyId[] {
  if (!inspection.lockedAt) return [];
  const lockedDate = asDateOnly(
    new Date(inspection.lockedAt).toISOString().slice(0, 10),
  );
  return [...new Set(
    ownershipPeriods
      .filter(
        (period) =>
          period.unitId === inspection.unitId &&
          period.validFrom <= lockedDate &&
          (period.validTo === null || period.validTo >= lockedDate),
      )
      .flatMap((period) => period.owners.map((owner) => owner.partyId)),
  )];
}
