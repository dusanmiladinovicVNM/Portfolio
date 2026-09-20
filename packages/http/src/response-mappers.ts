import type {
  AccessItemResponse,
  AccessItemTransactionResponse,
  AssetConditionAssessmentResponse,
  AssetLocationHistoryResponse,
  AssetReplacementResponse,
  AssetResponse,
  ServiceEventResponse,
  ServicePlanResponse,
  TenancyAssetAssignmentResponse,
  WarrantyClaimResponse,
  WarrantyResponse,
  CostResponse,
  CostReversalResponse,
  DocumentLinkResponse,
  DocumentResponse,
  DocumentVersionResponse,
  ImprovementProjectResponse,
  WorkItemResponse,
  WorkRecordResponse,
  InspectionEvidenceResponse,
  InspectionFindingResponse,
  InspectionFinalSnapshotResponse,
  InspectionItemResponse,
  InspectionResponseDto,
  InspectionSchemaVersionResponse,
  InspectionSignatureResponse,
  LeaseAgreementResponse,
  LeaseAmendmentResponse,
  MaintenanceIssueResponse,
  MaintenanceWorkOrderResponse,
  OwnershipPeriodResponse,
  PartyResponse,
  PropertyResponse,
  SpaceResponse,
  TenancyResponse,
  TenancyTermVersionResponse,
  UnitResponse,
} from '@portfolio/contracts';
import type {
  AccessItem,
  AccessItemTransaction,
  Asset,
  AssetConditionAssessment,
  AssetLocationHistory,
  AssetReplacement,
  ServiceEvent,
  ServicePlan,
  TenancyAssetAssignment,
  Warranty,
  WarrantyClaim,
  Cost,
  CostReversal,
  Document,
  DocumentLink,
  DocumentVersion,
  ImprovementProject,
  WorkItem,
  WorkRecord,
  Inspection,
  InspectionEvidence,
  InspectionFinding,
  InspectionFinalSnapshot,
  InspectionResponse,
  InspectionSchemaVersion,
  InspectionSignature,
  LeaseAgreement,
  LeaseAmendment,
  MaintenanceIssue,
  MaintenanceWorkOrder,
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

export function toInspectionResponse(inspection: Inspection): InspectionResponseDto {
  return {
    id: inspection.id,
    code: inspection.code,
    inspectionType: inspection.inspectionType,
    unitId: inspection.unitId,
    tenancyId: inspection.tenancyId,
    schemaVersionId: inspection.schemaVersionId,
    assignedToUserId: inspection.assignedToUserId,
    createdByUserId: inspection.createdByUserId,
    scheduledFor: inspection.scheduledFor,
    status: inspection.status,
    startedAt: inspection.startedAt,
    lockedAt: inspection.lockedAt,
    finalizedAt: inspection.finalizedAt,
    cancelledAt: inspection.cancelledAt,
    version: inspection.version,
    contentRevision: inspection.contentRevision,
  };
}

export function toInspectionSchemaVersionResponse(
  schema: InspectionSchemaVersion,
): InspectionSchemaVersionResponse {
  return {
    id: schema.id,
    schemaCode: schema.schemaCode,
    versionNumber: schema.versionNumber,
    inspectionType: schema.inspectionType,
    title: schema.title,
    status: schema.status,
    requiredSignatureRoles: [...schema.requiredSignatureRoles],
    sections: schema.sections.map((section) => ({
      id: section.id,
      key: section.key,
      title: section.title,
      description: section.description,
      sortOrder: section.sortOrder,
      items: section.items.map((item) => ({
        id: item.id,
        sectionId: item.sectionId,
        key: item.key,
        type: item.type,
        label: item.label,
        required: item.required,
        sortOrder: item.sortOrder,
        options: item.options.map((option) => ({ ...option })),
        visibleWhen: item.visibleWhen,
        requiredWhen: item.requiredWhen,
      })),
    })),
  };
}

export function toInspectionItemResponse(
  response: InspectionResponse,
): InspectionItemResponse {
  return {
    id: response.id,
    inspectionId: response.inspectionId,
    sectionId: response.sectionId,
    itemId: response.itemId,
    value:
      typeof response.value === 'string' ||
      typeof response.value === 'boolean'
        ? response.value
        : [...response.value],
    comment: response.comment,
    updatedByUserId: response.updatedByUserId,
    updatedAt: response.updatedAt,
  };
}

export function toInspectionFindingResponse(
  finding: InspectionFinding,
): InspectionFindingResponse {
  return {
    id: finding.id,
    inspectionId: finding.inspectionId,
    sectionId: finding.sectionId,
    itemId: finding.itemId,
    severity: finding.severity,
    title: finding.title,
    description: finding.description,
    createdByUserId: finding.createdByUserId,
    createdAt: finding.createdAt,
  };
}

export function toInspectionEvidenceResponse(
  evidence: InspectionEvidence,
): InspectionEvidenceResponse {
  return { ...evidence };
}

export function toInspectionSignatureResponse(
  signature: InspectionSignature,
): InspectionSignatureResponse {
  return { ...signature };
}

export function toInspectionFinalSnapshotResponse(
  snapshot: InspectionFinalSnapshot,
): InspectionFinalSnapshotResponse {
  return {
    id: snapshot.id,
    inspectionId: snapshot.inspectionId,
    snapshotVersion: snapshot.snapshotVersion,
    inspectionVersion: snapshot.inspectionVersion,
    contentRevision: snapshot.contentRevision,
    createdByUserId: snapshot.createdByUserId,
    createdAt: snapshot.createdAt,
  };
}


export function toAssetResponse(asset: Asset): AssetResponse {
  return {
    id: asset.id,
    code: asset.code,
    name: asset.name,
    propertyId: asset.propertyId,
    unitId: asset.unitId,
    spaceId: asset.spaceId,
    manufacturer: asset.manufacturer,
    model: asset.model,
    status: asset.status,
    version: asset.version,
    identifiers: asset.identifiers.map((identifier) => ({
      id: identifier.id,
      assetId: identifier.assetId,
      identifierType: identifier.identifierType,
      value: identifier.value,
      label: identifier.label,
    })),
  };
}

export function toAssetReplacementResponse(
  replacement: AssetReplacement,
): AssetReplacementResponse {
  return {
    id: replacement.id,
    replacedAssetId: replacement.replacedAssetId,
    replacementAssetId: replacement.replacementAssetId,
    replacedByUserId: replacement.replacedByUserId,
    replacedAt: replacement.replacedAt,
  };
}


export function toAssetLocationHistoryResponse(
  location: AssetLocationHistory,
): AssetLocationHistoryResponse {
  return {
    id: location.id,
    assetId: location.assetId,
    propertyId: location.propertyId,
    unitId: location.unitId,
    spaceId: location.spaceId,
    validFrom: location.validFrom,
    validTo: location.validTo,
    changeType: location.changeType,
    changedByUserId: location.changedByUserId,
    reason: location.reason,
  };
}

export function toAssetConditionAssessmentResponse(
  assessment: AssetConditionAssessment,
): AssetConditionAssessmentResponse {
  return {
    id: assessment.id,
    assetId: assessment.assetId,
    condition: assessment.condition,
    assessedAt: assessment.assessedAt,
    assessedByUserId: assessment.assessedByUserId,
    notes: assessment.notes,
  };
}

export function toTenancyAssetAssignmentResponse(
  assignment: TenancyAssetAssignment,
): TenancyAssetAssignmentResponse {
  const snapshot = (value: TenancyAssetAssignment['moveIn']) =>
    value === null
      ? null
      : {
          phase: value.phase,
          presence: value.presence,
          conditionAssessmentId: value.conditionAssessmentId,
          recordedAt: value.recordedAt,
          recordedByUserId: value.recordedByUserId,
          notes: value.notes,
        };

  return {
    id: assignment.id,
    tenancyId: assignment.tenancyId,
    assetId: assignment.assetId,
    assignedAt: assignment.assignedAt,
    assignedByUserId: assignment.assignedByUserId,
    version: assignment.version,
    moveIn: snapshot(assignment.moveIn),
    moveOut: snapshot(assignment.moveOut),
  };
}


export function toWarrantyResponse(warranty: Warranty): WarrantyResponse {
  return {
    id: warranty.id,
    assetId: warranty.assetId,
    warrantyType: warranty.warrantyType,
    providerPartyId: warranty.providerPartyId,
    reference: warranty.reference,
    validFrom: warranty.validFrom,
    validTo: warranty.validTo,
    terms: warranty.terms,
    recordedAt: warranty.recordedAt,
    recordedByUserId: warranty.recordedByUserId,
  };
}

export function toWarrantyClaimResponse(
  claim: WarrantyClaim,
): WarrantyClaimResponse {
  return {
    id: claim.id,
    warrantyId: claim.warrantyId,
    incidentOn: claim.incidentOn,
    description: claim.description,
    status: claim.status,
    providerReference: claim.providerReference,
    submittedAt: claim.submittedAt,
    resolvedAt: claim.resolvedAt,
    closedAt: claim.closedAt,
    cancelledAt: claim.cancelledAt,
    recordedAt: claim.recordedAt,
    recordedByUserId: claim.recordedByUserId,
    version: claim.version,
  };
}

export function toServicePlanResponse(
  plan: ServicePlan,
): ServicePlanResponse {
  return {
    id: plan.id,
    assetId: plan.assetId,
    name: plan.name,
    scheduleKind: plan.scheduleKind,
    firstDueOn: plan.firstDueOn,
    intervalMonths: plan.intervalMonths,
    providerPartyId: plan.providerPartyId,
    notes: plan.notes,
    status: plan.status,
    version: plan.version,
    createdAt: plan.createdAt,
    createdByUserId: plan.createdByUserId,
  };
}

export function toServiceEventResponse(
  event: ServiceEvent,
): ServiceEventResponse {
  return {
    id: event.id,
    assetId: event.assetId,
    servicePlanId: event.servicePlanId,
    warrantyClaimId: event.warrantyClaimId,
    eventType: event.eventType,
    performedAt: event.performedAt,
    providerPartyId: event.providerPartyId,
    description: event.description,
    reference: event.reference,
    parts: event.parts.map((part) => ({
      id: part.id,
      serviceEventId: part.serviceEventId,
      name: part.name,
      partNumber: part.partNumber,
      serialNumber: part.serialNumber,
      quantity: part.quantity,
      notes: part.notes,
    })),
    recordedAt: event.recordedAt,
    recordedByUserId: event.recordedByUserId,
  };
}


export function toImprovementProjectResponse(
  project: ImprovementProject,
): ImprovementProjectResponse {
  return {
    id: project.id,
    code: project.code,
    name: project.name,
    description: project.description,
    propertyId: project.propertyId,
    unitId: project.unitId,
    spaceId: project.spaceId,
    plannedStartOn: project.plannedStartOn,
    plannedEndOn: project.plannedEndOn,
    status: project.status,
    plannedAt: project.plannedAt,
    startedAt: project.startedAt,
    completedAt: project.completedAt,
    cancelledAt: project.cancelledAt,
    version: project.version,
    createdAt: project.createdAt,
    createdByUserId: project.createdByUserId,
  };
}

export function toWorkItemResponse(item: WorkItem): WorkItemResponse {
  return {
    id: item.id,
    projectId: item.projectId,
    code: item.code,
    title: item.title,
    description: item.description,
    status: item.status,
    startedAt: item.startedAt,
    completedAt: item.completedAt,
    cancelledAt: item.cancelledAt,
    version: item.version,
    createdAt: item.createdAt,
    createdByUserId: item.createdByUserId,
  };
}

export function toWorkRecordResponse(record: WorkRecord): WorkRecordResponse {
  return {
    id: record.id,
    projectId: record.projectId,
    workItemId: record.workItemId,
    contractorPartyId: record.contractorPartyId,
    performedAt: record.performedAt,
    description: record.description,
    reference: record.reference,
    materials: record.materials.map((material) => ({
      id: material.id,
      workRecordId: material.workRecordId,
      name: material.name,
      reference: material.reference,
      quantity: material.quantity,
      unit: material.unit,
      notes: material.notes,
    })),
    assets: record.assets.map((asset) => ({
      id: asset.id,
      workRecordId: asset.workRecordId,
      assetId: asset.assetId,
      action: asset.action,
      notes: asset.notes,
    })),
    recordedAt: record.recordedAt,
    recordedByUserId: record.recordedByUserId,
  };
}


export function toCostResponse(cost: Cost): CostResponse {
  return {
    id: cost.id,
    source: cost.source,
    description: cost.description,
    amount: cost.amount,
    currency: cost.currency,
    incurredOn: cost.incurredOn,
    reportingClass: cost.reportingClass,
    supplierPartyId: cost.supplierPartyId,
    invoiceReference: cost.invoiceReference,
    recordedAt: cost.recordedAt,
    recordedByUserId: cost.recordedByUserId,
  };
}

export function toCostReversalResponse(
  reversal: CostReversal,
): CostReversalResponse {
  return {
    id: reversal.id,
    costId: reversal.costId,
    replacementCostId: reversal.replacementCostId,
    reason: reversal.reason,
    recordedAt: reversal.recordedAt,
    recordedByUserId: reversal.recordedByUserId,
  };
}


export function toMaintenanceIssueResponse(
  issue: MaintenanceIssue,
): MaintenanceIssueResponse {
  return {
    id: issue.id,
    code: issue.code,
    propertyId: issue.propertyId,
    unitId: issue.unitId,
    spaceId: issue.spaceId,
    assetId: issue.assetId,
    inspectionFindingId: issue.inspectionFindingId,
    title: issue.title,
    description: issue.description,
    priority: issue.priority,
    status: issue.status,
    reportedAt: issue.reportedAt,
    resolvedAt: issue.resolvedAt,
    cancelledAt: issue.cancelledAt,
    version: issue.version,
    recordedAt: issue.recordedAt,
    recordedByUserId: issue.recordedByUserId,
  };
}

export function toMaintenanceWorkOrderResponse(
  workOrder: MaintenanceWorkOrder,
): MaintenanceWorkOrderResponse {
  return {
    id: workOrder.id,
    issueId: workOrder.issueId,
    code: workOrder.code,
    title: workOrder.title,
    description: workOrder.description,
    assignee: workOrder.assignee,
    status: workOrder.status,
    assignedAt: workOrder.assignedAt,
    startedAt: workOrder.startedAt,
    completedAt: workOrder.completedAt,
    cancelledAt: workOrder.cancelledAt,
    version: workOrder.version,
    createdAt: workOrder.createdAt,
    createdByUserId: workOrder.createdByUserId,
  };
}


export function toAccessItemResponse(item: AccessItem): AccessItemResponse {
  return {
    id: item.id,
    code: item.code,
    kind: item.kind,
    propertyId: item.propertyId,
    unitId: item.unitId,
    spaceId: item.spaceId,
    label: item.label,
    status: item.status,
    retiredAt: item.retiredAt,
    retiredByUserId: item.retiredByUserId,
    retirementReason: item.retirementReason,
    version: item.version,
    recordedAt: item.recordedAt,
    recordedByUserId: item.recordedByUserId,
  };
}

export function toAccessItemTransactionResponse(
  transaction: AccessItemTransaction,
): AccessItemTransactionResponse {
  return {
    id: transaction.id,
    accessItemId: transaction.accessItemId,
    tenancyId: transaction.tenancyId,
    type: transaction.type,
    sequence: transaction.sequence,
    occurredAt: transaction.occurredAt,
    recordedAt: transaction.recordedAt,
    recordedByUserId: transaction.recordedByUserId,
    note: transaction.note,
  };
}
