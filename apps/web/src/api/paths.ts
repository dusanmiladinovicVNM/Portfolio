export function currentStaffPath(): string {
  return '/me';
}

export function staffPath(): string {
  return '/staff';
}

export function staffInvitePath(userId: string): string {
  return `/staff/${encodeURIComponent(userId)}/invite`;
}

export function staffRolePath(userId: string): string {
  return `/staff/${encodeURIComponent(userId)}/role`;
}

export function staffStatusPath(userId: string): string {
  return `/staff/${encodeURIComponent(userId)}/status`;
}

export function propertiesPath(): string {
  return '/properties';
}

export function unitsPath(): string {
  return '/units';
}

export function spacesPath(): string {
  return '/spaces';
}

export function partiesPath(): string {
  return '/parties';
}

export function reportingDashboardPath(asOf: string): string {
  return `/reporting/dashboard?asOf=${encodeURIComponent(asOf)}`;
}

export function propertyPath(propertyId: string): string {
  return `/properties/${encodeURIComponent(propertyId)}`;
}

export function propertyUnitsPath(propertyId: string): string {
  return `${propertyPath(propertyId)}/units`;
}

export function unitPath(unitId: string): string {
  return '/units/' + encodeURIComponent(unitId);
}

export function unitSpacesPath(unitId: string): string {
  return unitPath(unitId) + '/spaces';
}

export function unitOverviewPath(unitId: string, asOf: string): string {
  return `${unitPath(unitId)}/overview?asOf=${encodeURIComponent(asOf)}`;
}

export function unitDocumentsPath(unitId: string): string {
  return `${unitPath(unitId)}/documents`;
}

export function unitTenanciesPath(unitId: string): string {
  return `${unitPath(unitId)}/tenancies`;
}

export function tenancyPath(tenancyId: string): string {
  return `/tenancies/${encodeURIComponent(tenancyId)}`;
}

export function tenancyPartiesPath(tenancyId: string): string {
  return `${tenancyPath(tenancyId)}/parties`;
}

export function tenancyPlanPath(tenancyId: string): string {
  return `${tenancyPath(tenancyId)}/plan`;
}

export function tenancyActivatePath(tenancyId: string): string {
  return `${tenancyPath(tenancyId)}/activate`;
}

export function tenancyGiveNoticePath(tenancyId: string): string {
  return `${tenancyPath(tenancyId)}/give-notice`;
}

export function tenancyMoveOutPendingPath(tenancyId: string): string {
  return `${tenancyPath(tenancyId)}/move-out-pending`;
}

export function tenancyEndPath(tenancyId: string): string {
  return `${tenancyPath(tenancyId)}/end`;
}

export function tenancyCancelPath(tenancyId: string): string {
  return `${tenancyPath(tenancyId)}/cancel`;
}

export function tenancyAgreementsPath(tenancyId: string): string {
  return `${tenancyPath(tenancyId)}/agreements`;
}

export function tenancyTermsPath(tenancyId: string, at: string): string {
  return `${tenancyPath(tenancyId)}/terms?at=${encodeURIComponent(at)}`;
}

export function agreementPath(agreementId: string): string {
  return `/agreements/${encodeURIComponent(agreementId)}`;
}

export function agreementSignPath(agreementId: string): string {
  return `${agreementPath(agreementId)}/sign`;
}

export function agreementCancelPath(agreementId: string): string {
  return `${agreementPath(agreementId)}/cancel`;
}

export function agreementAmendmentsPath(agreementId: string): string {
  return `${agreementPath(agreementId)}/amendments`;
}

export function amendmentPath(amendmentId: string): string {
  return `/amendments/${encodeURIComponent(amendmentId)}`;
}

export function amendmentSignPath(amendmentId: string): string {
  return `${amendmentPath(amendmentId)}/sign`;
}

export function amendmentCancelPath(amendmentId: string): string {
  return `${amendmentPath(amendmentId)}/cancel`;
}

export function partiesByIdsPath(ids: readonly string[]): string {
  const uniqueIds = [...new Set(ids)].sort();
  const search = new URLSearchParams();
  for (const id of uniqueIds) {
    search.append('id', id);
  }
  return `/parties?${search.toString()}`;
}

export function agreementDocumentsPath(agreementId: string): string {
  return `/agreements/${encodeURIComponent(agreementId)}/documents`;
}

export function amendmentDocumentsPath(amendmentId: string): string {
  return `/amendments/${encodeURIComponent(amendmentId)}/documents`;
}

export function documentsPath(): string {
  return '/documents';
}

export function documentPath(documentId: string): string {
  return `/documents/${encodeURIComponent(documentId)}`;
}

export function documentVersionsPath(documentId: string): string {
  return `${documentPath(documentId)}/versions`;
}

export function documentVersionUploadPath(
  documentId: string,
  fileName: string,
  expectedDocumentRevision: number,
): string {
  const search = new URLSearchParams({
    fileName,
    expectedDocumentRevision: String(expectedDocumentRevision),
  });
  return `${documentVersionsPath(documentId)}?${search.toString()}`;
}

export function documentLinksPath(documentId: string): string {
  return `${documentPath(documentId)}/links`;
}

export function documentVersionFinalizePath(versionId: string): string {
  return `/document-versions/${encodeURIComponent(versionId)}/finalize`;
}

export function documentVersionContentPath(versionId: string): string {
  return `/document-versions/${encodeURIComponent(versionId)}/content`;
}

export function assetsPath(): string {
  return '/assets';
}

export function unitAssetsPath(unitId: string): string {
  return `${unitPath(unitId)}/assets`;
}

export function assetPath(assetId: string): string {
  return `/assets/${encodeURIComponent(assetId)}`;
}

export function assetMetadataPath(assetId: string): string {
  return `${assetPath(assetId)}/metadata`;
}

export function assetMovePath(assetId: string): string {
  return `${assetPath(assetId)}/move`;
}

export function assetStatusPath(assetId: string): string {
  return `${assetPath(assetId)}/status`;
}

export function assetReplacementPath(assetId: string): string {
  return `${assetPath(assetId)}/replacement`;
}

export function assetReplacementLinksPath(assetId: string): string {
  return `${assetPath(assetId)}/replacements`;
}

export function assetLocationHistoryPath(assetId: string): string {
  return `${assetPath(assetId)}/location-history`;
}

export function assetWarrantiesPath(assetId: string): string {
  return `${assetPath(assetId)}/warranties`;
}

export function warrantyClaimsPath(warrantyId: string): string {
  return `/warranties/${encodeURIComponent(warrantyId)}/claims`;
}

export function warrantyClaimSubmitPath(claimId: string): string {
  return `/warranty-claims/${encodeURIComponent(claimId)}/submit`;
}

export function warrantyClaimResolvePath(claimId: string): string {
  return `/warranty-claims/${encodeURIComponent(claimId)}/resolve`;
}

export function warrantyClaimClosePath(claimId: string): string {
  return `/warranty-claims/${encodeURIComponent(claimId)}/close`;
}

export function warrantyClaimCancelPath(claimId: string): string {
  return `/warranty-claims/${encodeURIComponent(claimId)}/cancel`;
}

export function assetServicePlansPath(assetId: string): string {
  return `${assetPath(assetId)}/service-plans`;
}

export function servicePlanStatusPath(planId: string): string {
  return `/service-plans/${encodeURIComponent(planId)}/status`;
}

export function metersPath(): string {
  return '/meters';
}

export function unitMetersPath(unitId: string): string {
  return `${unitPath(unitId)}/meters`;
}

export function meterPath(meterId: string): string {
  return `/meters/${encodeURIComponent(meterId)}`;
}

export function meterRetirePath(meterId: string): string {
  return `${meterPath(meterId)}/retire`;
}

export function meterReadingsPath(meterId: string): string {
  return `${meterPath(meterId)}/readings`;
}

export function meterReadingBoundariesPath(readingId: string): string {
  return `/meter-readings/${encodeURIComponent(readingId)}/boundaries`;
}

export function tenancyMeterReadingBoundariesPath(
  tenancyId: string,
): string {
  return `${tenancyPath(tenancyId)}/meter-reading-boundaries`;
}

export function maintenanceIssuesPath(): string {
  return '/maintenance-issues';
}

export function unitMaintenanceIssuesPath(unitId: string): string {
  return `${unitPath(unitId)}/maintenance-issues`;
}

export function maintenanceIssuePath(issueId: string): string {
  return `/maintenance-issues/${encodeURIComponent(issueId)}`;
}

export function maintenanceIssueStatusPath(issueId: string): string {
  return `${maintenanceIssuePath(issueId)}/status`;
}

export function maintenanceIssueWorkOrdersPath(issueId: string): string {
  return `${maintenanceIssuePath(issueId)}/work-orders`;
}

export function maintenanceWorkOrderPath(workOrderId: string): string {
  return `/maintenance-work-orders/${encodeURIComponent(workOrderId)}`;
}

export function maintenanceWorkOrderAssignPath(workOrderId: string): string {
  return `${maintenanceWorkOrderPath(workOrderId)}/assign`;
}

export function maintenanceWorkOrderStatusPath(workOrderId: string): string {
  return `${maintenanceWorkOrderPath(workOrderId)}/status`;
}

export function maintenanceWorkOrderServiceEventsPath(
  workOrderId: string,
): string {
  return `${maintenanceWorkOrderPath(workOrderId)}/service-events`;
}

export function assetServiceEventsPath(assetId: string): string {
  return `${assetPath(assetId)}/service-events`;
}

export function inspectionSchemasPath(): string {
  return '/inspection-schemas';
}

export function inspectionStaffPath(): string {
  return '/inspection-staff';
}

export function assignedInspectionsPath(): string {
  return '/inspections/assigned-to-me';
}

export function inspectionOrchestrationPath(
  inspectionId: string,
): string {
  return `${inspectionPath(inspectionId)}/orchestration`;
}

export function unitInspectionsPath(unitId: string): string {
  return `/units/${encodeURIComponent(unitId)}/inspections`;
}

export function inspectionPath(inspectionId: string): string {
  return `/inspections/${encodeURIComponent(inspectionId)}`;
}

export function inspectionStartPath(inspectionId: string): string {
  return `${inspectionPath(inspectionId)}/start`;
}

export function inspectionSectionPath(
  inspectionId: string,
  sectionId: string,
): string {
  return `${inspectionPath(inspectionId)}/sections/${encodeURIComponent(sectionId)}`;
}


export function inspectionFindingsPath(inspectionId: string): string {
  return `${inspectionPath(inspectionId)}/findings`;
}

export function inspectionEvidencePath(inspectionId: string): string {
  return `${inspectionPath(inspectionId)}/evidence`;
}


export function inspectionLockPath(inspectionId: string): string {
  return `${inspectionPath(inspectionId)}/lock`;
}

export function inspectionUnlockPath(inspectionId: string): string {
  return `${inspectionPath(inspectionId)}/unlock`;
}

export function inspectionSignaturesPath(inspectionId: string): string {
  return `${inspectionPath(inspectionId)}/signatures`;
}

export function inspectionFinalizePath(inspectionId: string): string {
  return `${inspectionPath(inspectionId)}/finalize`;
}

export function inspectionFinalReportPath(inspectionId: string): string {
  return `${inspectionPath(inspectionId)}/final-report`;
}


export function inspectionBinaryUploadPath(
  inspectionId: string,
  purpose: 'photo' | 'attachment' | 'signature',
  uploadKey: string,
  fileName: string,
): string {
  const params = new URLSearchParams({
    purpose,
    uploadKey,
    fileName,
  });
  return `${inspectionPath(inspectionId)}/binaries?${params.toString()}`;
}
