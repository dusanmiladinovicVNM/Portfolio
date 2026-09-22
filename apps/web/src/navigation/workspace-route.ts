import {
  entityIdSchema,
  reportingAsOfQuerySchema,
} from '@portfolio/contracts';
import { localDateOnly } from '../presentation/format.js';

export const DOSSIER_TABS = [
  'overview',
  'spaces',
  'tenancies',
  'contracts',
  'inspections',
  'timeline',
  'documents',
  'assets',
  'meters',
] as const;
export type DossierTab = (typeof DOSSIER_TABS)[number];

export type WorkspaceRoute =
  | {
      readonly kind: 'dashboard';
      readonly asOf: string;
    }
  | {
      readonly kind: 'parties';
      readonly asOf: string;
    }
  | {
      readonly kind: 'property';
      readonly propertyId: string;
      readonly asOf: string;
    }
  | {
      readonly kind: 'unit';
      readonly propertyId: string;
      readonly unitId: string;
      readonly tab: DossierTab;
      readonly asOf: string;
      readonly tenancyId?: string;
      readonly agreementId?: string;
      readonly amendmentId?: string;
      readonly inspectionId?: string;
      readonly inspectionSectionId?: string;
      readonly assetId?: string;
      readonly meterId?: string;
    };

export function workspaceRouteOwnerKey(route: WorkspaceRoute): string {
  if (route.kind === 'dashboard') return 'dashboard';
  if (route.kind === 'parties') return 'parties';
  if (route.kind === 'property') return 'property:' + route.propertyId;
  return 'unit:' + route.propertyId + ':' + route.unitId;
}

export function isWorkspaceAsOf(value: string): boolean {
  return reportingAsOfQuerySchema.safeParse({ asOf: value }).success;
}

function requireWorkspaceAsOf(value: string): string {
  const parsed = reportingAsOfQuerySchema.safeParse({ asOf: value });
  if (!parsed.success) {
    throw new Error('Workspace asOf must be a valid DateOnly value.');
  }
  return parsed.data.asOf;
}

function readAsOf(search: URLSearchParams, fallback: string): string {
  const parsed = reportingAsOfQuerySchema.safeParse({
    asOf: search.get('asOf') ?? fallback,
  });
  return parsed.success ? parsed.data.asOf : fallback;
}

function readTab(search: URLSearchParams): DossierTab {
  const value = search.get('tab');
  return DOSSIER_TABS.includes(value as DossierTab)
    ? (value as DossierTab)
    : 'overview';
}

function readEntityId(value: string | undefined): string | null {
  if (!value) return null;

  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return null;
  }

  const parsed = entityIdSchema.safeParse(decoded);
  return parsed.success ? parsed.data : null;
}

export function dashboardRoute(asOf: string): WorkspaceRoute {
  return { kind: 'dashboard', asOf: requireWorkspaceAsOf(asOf) };
}

export function partiesRoute(asOf: string): WorkspaceRoute {
  return { kind: 'parties', asOf: requireWorkspaceAsOf(asOf) };
}

export function propertyRoute(
  propertyId: string,
  asOf: string,
): WorkspaceRoute {
  return {
    kind: 'property',
    propertyId,
    asOf: requireWorkspaceAsOf(asOf),
  };
}

export interface UnitRouteSelection {
  readonly tenancyId?: string;
  readonly agreementId?: string;
  readonly amendmentId?: string;
  readonly inspectionId?: string;
  readonly inspectionSectionId?: string;
  readonly assetId?: string;
  readonly meterId?: string;
}

export function unitRoute(
  propertyId: string,
  unitId: string,
  asOf: string,
  tab: DossierTab = 'overview',
  selection: UnitRouteSelection = {},
): WorkspaceRoute {
  const tenancyId =
    tab === 'contracts' ? selection.tenancyId : undefined;
  const agreementId =
    tab === 'contracts' && tenancyId ? selection.agreementId : undefined;
  const amendmentId =
    tab === 'contracts' && tenancyId && agreementId
      ? selection.amendmentId
      : undefined;
  const inspectionId =
    tab === 'inspections' ? selection.inspectionId : undefined;
  const inspectionSectionId =
    tab === 'inspections' && inspectionId
      ? selection.inspectionSectionId
      : undefined;
  const assetId =
    tab === 'assets' ? selection.assetId : undefined;
  const meterId =
    tab === 'meters' ? selection.meterId : undefined;

  return {
    kind: 'unit',
    propertyId,
    unitId,
    tab,
    asOf: requireWorkspaceAsOf(asOf),
    ...(tenancyId ? { tenancyId } : {}),
    ...(agreementId ? { agreementId } : {}),
    ...(amendmentId ? { amendmentId } : {}),
    ...(inspectionId ? { inspectionId } : {}),
    ...(inspectionSectionId ? { inspectionSectionId } : {}),
    ...(assetId ? { assetId } : {}),
    ...(meterId ? { meterId } : {}),
  };
}

export function parseWorkspaceLocation(
  pathname: string,
  searchValue: string,
  fallbackAsOf = localDateOnly(),
): WorkspaceRoute {
  const search = new URLSearchParams(
    searchValue.startsWith('?') ? searchValue.slice(1) : searchValue,
  );
  const asOf = readAsOf(search, fallbackAsOf);
  const segments = pathname.split('/').filter(Boolean);

  if (
    segments.length === 4 &&
    segments[0] === 'properties' &&
    segments[2] === 'units'
  ) {
    const propertyId = readEntityId(segments[1]);
    const unitId = readEntityId(segments[3]);
    if (propertyId && unitId) {
      const tab = readTab(search);
      const tenancyId =
        tab === 'contracts'
          ? readEntityId(search.get('tenancyId') ?? undefined)
          : null;
      const agreementId =
        tab === 'contracts' && tenancyId
          ? readEntityId(search.get('agreementId') ?? undefined)
          : null;
      const amendmentId =
        tab === 'contracts' && tenancyId && agreementId
          ? readEntityId(search.get('amendmentId') ?? undefined)
          : null;
      const inspectionId =
        tab === 'inspections'
          ? readEntityId(search.get('inspectionId') ?? undefined)
          : null;
      const inspectionSectionId =
        tab === 'inspections' && inspectionId
          ? readEntityId(search.get('sectionId') ?? undefined)
          : null;
      const assetId =
        tab === 'assets'
          ? readEntityId(search.get('assetId') ?? undefined)
          : null;
      const meterId =
        tab === 'meters'
          ? readEntityId(search.get('meterId') ?? undefined)
          : null;

      return unitRoute(propertyId, unitId, asOf, tab, {
        ...(tenancyId ? { tenancyId } : {}),
        ...(agreementId ? { agreementId } : {}),
        ...(amendmentId ? { amendmentId } : {}),
        ...(inspectionId ? { inspectionId } : {}),
        ...(inspectionSectionId ? { inspectionSectionId } : {}),
        ...(assetId ? { assetId } : {}),
        ...(meterId ? { meterId } : {}),
      });
    }
  }

  if (segments.length === 1 && segments[0] === 'parties') {
    return partiesRoute(asOf);
  }

  if (segments.length === 2 && segments[0] === 'properties') {
    const propertyId = readEntityId(segments[1]);
    if (propertyId) return propertyRoute(propertyId, asOf);
  }

  return dashboardRoute(asOf);
}

export function workspaceRouteHref(route: WorkspaceRoute): string {
  const search = new URLSearchParams();

  if (route.kind === 'unit') {
    search.set('tab', route.tab);
    if (route.tab === 'contracts' && route.tenancyId) {
      search.set('tenancyId', route.tenancyId);
      if (route.agreementId) {
        search.set('agreementId', route.agreementId);
        if (route.amendmentId) {
          search.set('amendmentId', route.amendmentId);
        }
      }
    }
    if (route.tab === 'inspections' && route.inspectionId) {
      search.set('inspectionId', route.inspectionId);
      if (route.inspectionSectionId) {
        search.set('sectionId', route.inspectionSectionId);
      }
    }
    if (route.tab === 'assets' && route.assetId) {
      search.set('assetId', route.assetId);
    }
    if (route.tab === 'meters' && route.meterId) {
      search.set('meterId', route.meterId);
    }
  }
  search.set('asOf', route.asOf);

  if (route.kind === 'dashboard') {
    return '/dashboard?' + search.toString();
  }
  if (route.kind === 'parties') {
    return '/parties?' + search.toString();
  }
  if (route.kind === 'property') {
    return `/properties/${encodeURIComponent(route.propertyId)}?${search.toString()}`;
  }

  return `/properties/${encodeURIComponent(route.propertyId)}/units/${encodeURIComponent(route.unitId)}?${search.toString()}`;
}
