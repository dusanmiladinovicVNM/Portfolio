import {
  DomainError,
  inspectLuzernerLeaseFormReadiness,
  type LeaseAgreementId,
  type Party,
  type PartyAddress,
} from '@portfolio/domain';
import { requireCapability, type Actor } from '../security/access.js';
import type { PartyRepository } from '../parties/party-repository.js';
import type { PortfolioRepository } from '../portfolio/portfolio-repository.js';
import type { TenancyRepository } from '../tenancy/tenancy-repository.js';
import type { LeaseRepository } from './lease-repository.js';
import type {
  LuzernerLeasePdfParty,
  LuzernerLeasePdfPort,
} from './luzerner-lease-pdf-port.js';

export interface RenderLuzernerLeasePdfDependencies {
  readonly leaseRepository: LeaseRepository;
  readonly tenancyRepository: TenancyRepository;
  readonly portfolioRepository: PortfolioRepository;
  readonly partyRepository: PartyRepository;
  readonly luzernerLeasePdfPort: LuzernerLeasePdfPort;
}

const LANDLORD_ADDRESS_ORDER = [
  'legal',
  'mailing',
  'residential',
  'billing',
  'other',
] as const;
const TENANT_ADDRESS_ORDER = [
  'residential',
  'mailing',
  'legal',
  'billing',
  'other',
] as const;

function addressRank(
  address: PartyAddress,
  order: readonly PartyAddress['addressType'][],
): readonly [number, number, string] {
  const typeRank = order.indexOf(address.addressType);
  return [
    address.isPrimary ? 0 : 1,
    typeRank === -1 ? order.length : typeRank,
    String(address.id),
  ];
}

function compareTuple(
  left: readonly [number, number, string],
  right: readonly [number, number, string],
): number {
  if (left[0] !== right[0]) return left[0] - right[0];
  if (left[1] !== right[1]) return left[1] - right[1];
  return left[2].localeCompare(right[2]);
}

function presentationParty(
  party: Party,
  addressOrder: readonly PartyAddress['addressType'][],
): LuzernerLeasePdfParty {
  const address = [...party.addresses].sort((left, right) =>
    compareTuple(
      addressRank(left, addressOrder),
      addressRank(right, addressOrder),
    ),
  )[0];

  return {
    displayName: party.displayName,
    addressLine: address
      ? [address.line1, address.line2].filter(Boolean).join(', ')
      : null,
    postalCode: address?.postalCode ?? null,
    city: address?.city ?? null,
  };
}

function requireParties(
  available: readonly Party[],
  ids: readonly string[],
): Map<string, Party> {
  const byId = new Map(available.map((party) => [String(party.id), party]));
  for (const id of ids) {
    if (!byId.has(id)) {
      throw new DomainError(
        'LUZERNER_PDF_PARTY_NOT_FOUND',
        'A contract party required for PDF rendering no longer exists.',
      );
    }
  }
  return byId;
}

export async function renderLuzernerLeasePdfCommand(
  deps: RenderLuzernerLeasePdfDependencies,
  actor: Actor,
  agreementId: LeaseAgreementId,
) {
  requireCapability(actor, 'contracts:read');

  const agreement = await deps.leaseRepository.getAgreementById(agreementId);
  if (!agreement) {
    throw new DomainError(
      'LEASE_AGREEMENT_NOT_FOUND',
      'Lease agreement not found.',
    );
  }
  if (agreement.status === 'cancelled') {
    throw new DomainError(
      'LUZERNER_PDF_CANCELLED_AGREEMENT',
      'A cancelled Agreement cannot produce a Luzerner contract PDF.',
    );
  }

  const form = await deps.leaseRepository.getLuzernerLeaseForm(agreement.id);
  if (!form) {
    throw new DomainError(
      'LUZERNER_LEASE_FORM_NOT_FOUND',
      'No Luzerner lease form exists for this agreement.',
    );
  }
  const readiness = inspectLuzernerLeaseFormReadiness(form.content);
  if (!readiness.ready) {
    throw new DomainError(
      'LUZERNER_LEASE_FORM_INCOMPLETE',
      'The Luzerner lease form is incomplete: ' + readiness.missing.join(', '),
    );
  }

  const tenancy = await deps.tenancyRepository.getById(agreement.tenancyId);
  if (!tenancy) {
    throw new DomainError('TENANCY_NOT_FOUND', 'Tenancy not found.');
  }
  const unit = await deps.portfolioRepository.getUnitById(tenancy.unitId);
  if (!unit) {
    throw new DomainError('UNIT_NOT_FOUND', 'Unit not found.');
  }
  const property = await deps.portfolioRepository.getPropertyById(
    unit.propertyId,
  );
  if (!property) {
    throw new DomainError('PROPERTY_NOT_FOUND', 'Property not found.');
  }

  const partyIds = [...new Set(agreement.parties.map((entry) => String(entry.partyId)))];
  const parties = await deps.partyRepository.getByIds(
    agreement.parties.map((entry) => entry.partyId),
  );
  const partyById = requireParties(parties, partyIds);

  const primaryTenantId =
    tenancy.parties.find(
      (entry) =>
        entry.isPrimary &&
        (entry.role === 'tenant' || entry.role === 'co_tenant'),
    )?.partyId ?? null;

  const landlords = agreement.parties
    .filter((entry) => entry.role === 'landlord')
    .sort((left, right) => String(left.partyId).localeCompare(String(right.partyId)))
    .map((entry) =>
      presentationParty(
        partyById.get(String(entry.partyId))!,
        LANDLORD_ADDRESS_ORDER,
      ),
    );

  const landlordRepresentatives = agreement.parties
    .filter((entry) => entry.role === 'authorized_signatory')
    .sort((left, right) => String(left.partyId).localeCompare(String(right.partyId)))
    .map((entry) =>
      presentationParty(
        partyById.get(String(entry.partyId))!,
        LANDLORD_ADDRESS_ORDER,
      ),
    );

  const tenants = agreement.parties
    .filter((entry) => entry.role === 'tenant' || entry.role === 'co_tenant')
    .sort((left, right) => {
      const leftPrimary = left.partyId === primaryTenantId ? 0 : 1;
      const rightPrimary = right.partyId === primaryTenantId ? 0 : 1;
      if (leftPrimary !== rightPrimary) return leftPrimary - rightPrimary;
      if (left.role !== right.role) return left.role === 'tenant' ? -1 : 1;
      return String(left.partyId).localeCompare(String(right.partyId));
    })
    .map((entry) =>
      presentationParty(
        partyById.get(String(entry.partyId))!,
        TENANT_ADDRESS_ORDER,
      ),
    );

  return deps.luzernerLeasePdfPort.renderLuzernerLeaseAgreement({
    agreementCode: agreement.code,
    agreementEffectiveFrom: agreement.effectiveFrom,
    form: form.content,
    property: {
      street: property.street,
      houseNumber: property.houseNumber,
      postalCode: property.postalCode,
      city: property.city,
    },
    unit: {
      unitNumber: unit.unitNumber,
      unitType: unit.unitType,
      rooms: unit.rooms,
    },
    landlords,
    landlordRepresentatives,
    tenants,
  });
}
