import type {
  DocumentLinkResponse,
  DocumentResponse,
  DocumentVersionResponse,
  LeaseAgreementResponse,
  LeaseAmendmentResponse,
  OwnershipPeriodResponse,
  PartyResponse,
  PropertyResponse,
  SpaceResponse,
  TenancyResponse,
  TenancyTermVersionResponse,
  UnitResponse,
} from '@portfolio/contracts';
import type {
  Document,
  DocumentLink,
  DocumentVersion,
  LeaseAgreement,
  LeaseAmendment,
  OwnershipPeriod,
  Party,
  Property,
  Space,
  Tenancy,
  TenancyTermVersion,
  Unit,
} from '@portfolio/domain';

export function toPropertyResponse(property: Property): PropertyResponse {
  return {
    id: property.id,
    code: property.code,
    name: property.name,
    propertyType: property.propertyType,
    street: property.street,
    houseNumber: property.houseNumber,
    postalCode: property.postalCode,
    city: property.city,
    countryCode: property.countryCode,
    yearBuilt: property.yearBuilt,
    status: property.status,
  };
}

export function toUnitResponse(unit: Unit): UnitResponse {
  return {
    id: unit.id,
    propertyId: unit.propertyId,
    code: unit.code,
    unitNumber: unit.unitNumber,
    unitType: unit.unitType,
    floor: unit.floor,
    areaM2: unit.areaM2,
    rooms: unit.rooms,
    status: unit.status,
    notes: unit.notes,
  };
}

export function toSpaceResponse(space: Space): SpaceResponse {
  return {
    id: space.id,
    unitId: space.unitId,
    code: space.code,
    name: space.name,
    spaceType: space.spaceType,
    areaM2: space.areaM2,
    sortOrder: space.sortOrder,
    active: space.active,
  };
}

export function toPartyResponse(party: Party): PartyResponse {
  const common = {
    id: party.id,
    code: party.code,
    displayName: party.displayName,
    status: party.status,
    contactPoints: party.contactPoints.map((contact) => ({
      id: contact.id,
      partyId: contact.partyId,
      contactType: contact.contactType,
      value: contact.value,
      label: contact.label,
      isPrimary: contact.isPrimary,
    })),
    addresses: party.addresses.map((address) => ({
      id: address.id,
      partyId: address.partyId,
      addressType: address.addressType,
      line1: address.line1,
      line2: address.line2,
      postalCode: address.postalCode,
      city: address.city,
      region: address.region,
      countryCode: address.countryCode,
      isPrimary: address.isPrimary,
    })),
  };

  return party.partyType === 'person'
    ? {
        ...common,
        partyType: 'person',
        firstName: party.firstName,
        middleName: party.middleName,
        lastName: party.lastName,
      }
    : {
        ...common,
        partyType: 'company',
        legalName: party.legalName,
      };
}

export function toOwnershipPeriodResponse(
  period: OwnershipPeriod,
): OwnershipPeriodResponse {
  return {
    id: period.id,
    unitId: period.unitId,
    validFrom: period.validFrom,
    validTo: period.validTo,
    owners: period.owners.map((owner) => ({
      partyId: owner.partyId,
      sharePercent: owner.shareBasisPoints / 100,
    })),
  };
}

export function toTenancyResponse(tenancy: Tenancy): TenancyResponse {
  return {
    id: tenancy.id,
    code: tenancy.code,
    unitId: tenancy.unitId,
    status: tenancy.status,
    plannedStart: tenancy.plannedStart,
    plannedEnd: tenancy.plannedEnd,
    actualStart: tenancy.actualStart,
    actualEnd: tenancy.actualEnd,
    noticeGivenAt: tenancy.noticeGivenAt,
    terminationEffectiveAt: tenancy.terminationEffectiveAt,
    version: tenancy.version,
    parties: tenancy.parties.map((party) => ({
      id: party.id,
      tenancyId: party.tenancyId,
      partyId: party.partyId,
      role: party.role,
      isPrimary: party.isPrimary,
    })),
  };
}

export function toLeaseAgreementResponse(
  agreement: LeaseAgreement,
): LeaseAgreementResponse {
  return {
    id: agreement.id,
    tenancyId: agreement.tenancyId,
    code: agreement.code,
    agreementType: agreement.agreementType,
    predecessorAgreementId: agreement.predecessorAgreementId,
    effectiveFrom: agreement.effectiveFrom,
    effectiveTo: agreement.effectiveTo,
    status: agreement.status,
    signedAt: agreement.signedAt,
    version: agreement.version,
    parties: agreement.parties.map((party) => ({
      id: party.id,
      agreementId: party.agreementId,
      partyId: party.partyId,
      role: party.role,
    })),
  };
}

export function toLeaseAmendmentResponse(
  amendment: LeaseAmendment,
): LeaseAmendmentResponse {
  return {
    id: amendment.id,
    agreementId: amendment.agreementId,
    code: amendment.code,
    title: amendment.title,
    description: amendment.description,
    effectiveFrom: amendment.effectiveFrom,
    status: amendment.status,
    signedAt: amendment.signedAt,
    version: amendment.version,
  };
}

export function toTenancyTermVersionResponse(
  terms: TenancyTermVersion,
): TenancyTermVersionResponse {
  return {
    id: terms.id,
    tenancyId: terms.tenancyId,
    sourceType: terms.sourceType,
    sourceAgreementId: terms.sourceAgreementId,
    sourceAmendmentId: terms.sourceAmendmentId,
    effectiveFrom: terms.effectiveFrom,
    currency: terms.currency,
    baseRent: terms.baseRent,
    serviceCharge: terms.serviceCharge,
    utilitiesAdvance: terms.utilitiesAdvance,
    parkingRent: terms.parkingRent,
    otherRecurringCharge: terms.otherRecurringCharge,
    depositRequired: terms.depositRequired,
    billingFrequency: terms.billingFrequency,
    noticePeriodTenantDays: terms.noticePeriodTenantDays,
    noticePeriodLandlordDays: terms.noticePeriodLandlordDays,
  };
}

export function toDocumentResponse(document: Document): DocumentResponse {
  return {
    id: document.id,
    code: document.code,
    title: document.title,
    category: document.category,
    status: document.status,
    latestVersionNumber: document.latestVersionNumber,
    revision: document.revision,
  };
}

export function toDocumentVersionResponse(
  version: DocumentVersion,
): DocumentVersionResponse {
  return {
    id: version.id,
    documentId: version.documentId,
    versionNumber: version.versionNumber,
    fileName: version.fileName,
    mimeType: version.mimeType,
    byteSize: version.byteSize,
    sha256: version.sha256,
    status: version.status,
    finalizedAt: version.finalizedAt,
  };
}

export function toDocumentLinkResponse(
  link: DocumentLink,
): DocumentLinkResponse {
  return {
    id: link.id,
    documentId: link.documentId,
    documentVersionId: link.documentVersionId,
    relation: link.relation,
    targetType: link.targetType,
    targetId: link.targetId,
  };
}
