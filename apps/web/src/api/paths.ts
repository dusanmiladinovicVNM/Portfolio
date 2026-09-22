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

export function documentVersionsPath(
  documentId: string,
  expectedDocumentRevision?: number,
): string {
  const base = `${documentPath(documentId)}/versions`;
  return expectedDocumentRevision === undefined
    ? base
    : `${base}?expectedDocumentRevision=${encodeURIComponent(String(expectedDocumentRevision))}`;
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
