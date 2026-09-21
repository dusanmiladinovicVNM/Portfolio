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
