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
  return `/units/${encodeURIComponent(unitId)}`;
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

export function tenancyAgreementsPath(tenancyId: string): string {
  return `/tenancies/${encodeURIComponent(tenancyId)}/agreements`;
}

export function tenancyTermsPath(tenancyId: string, at: string): string {
  return `/tenancies/${encodeURIComponent(tenancyId)}/terms?at=${encodeURIComponent(at)}`;
}

export function agreementAmendmentsPath(agreementId: string): string {
  return `/agreements/${encodeURIComponent(agreementId)}/amendments`;
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
