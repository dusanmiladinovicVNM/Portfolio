import { WorkspaceLink } from '../navigation/WorkspaceLink.js';
import {
  unitRoute,
  type DossierTab,
  type UnitRouteSelection,
} from '../navigation/workspace-route.js';
import type { NavigateWorkspace } from '../navigation/use-workspace-navigation.js';

interface UnitDossierNavigationProps {
  readonly propertyId: string;
  readonly unitId: string;
  readonly asOf: string;
  readonly tab: DossierTab;
  readonly selection: UnitRouteSelection;
  readonly navigate: NavigateWorkspace;
}

type DossierGroupId = 'occupancy' | 'operations' | 'unit' | 'records';

interface DossierNavigationItem {
  readonly tab: DossierTab;
  readonly label: string;
  readonly description: string;
}

interface DossierNavigationGroup {
  readonly id: DossierGroupId;
  readonly label: string;
  readonly description: string;
  readonly items: readonly DossierNavigationItem[];
}

const overviewItem: DossierNavigationItem = {
  tab: 'overview',
  label: 'Overview',
  description: 'Unit status, occupancy, contract coverage and current attention.',
};

const groups: readonly DossierNavigationGroup[] = [
  {
    id: 'occupancy',
    label: 'Occupancy',
    description: 'People, tenancy lifecycle and contractual records.',
    items: [
      { tab: 'tenancies', label: 'Tenancies', description: 'Occupancy lifecycle and tenant relationships.' },
      { tab: 'contracts', label: 'Contracts', description: 'Agreements, amendments and signed documents.' },
    ],
  },
  {
    id: 'operations',
    label: 'Operations',
    description: 'Field work and issues that require action.',
    items: [
      { tab: 'inspections', label: 'Inspections', description: 'Inspect, review, sign and complete.' },
      { tab: 'maintenance', label: 'Maintenance', description: 'Issues, work orders and service activity.' },
    ],
  },
  {
    id: 'unit',
    label: 'Unit & equipment',
    description: 'Physical structure and controlled Unit inventory.',
    items: [
      { tab: 'spaces', label: 'Spaces', description: 'Rooms and other physical spaces.' },
      { tab: 'assets', label: 'Assets', description: 'Located equipment and asset records.' },
      { tab: 'keys', label: 'Keys', description: 'Key inventory and custody.' },
      { tab: 'meters', label: 'Meters', description: 'Meter inventory and readings.' },
    ],
  },
  {
    id: 'records',
    label: 'Records',
    description: 'Read-oriented history and documents.',
    items: [
      { tab: 'timeline', label: 'Timeline', description: 'Chronological Unit history.' },
      { tab: 'documents', label: 'Documents', description: 'Unit-level document records.' },
    ],
  },
];

function selectionForTab(tab: DossierTab, selection: UnitRouteSelection): UnitRouteSelection {
  if (tab === 'contracts') {
    return {
      ...(selection.tenancyId ? { tenancyId: selection.tenancyId } : {}),
      ...(selection.agreementId ? { agreementId: selection.agreementId } : {}),
      ...(selection.amendmentId ? { amendmentId: selection.amendmentId } : {}),
    };
  }
  if (tab === 'inspections') {
    return {
      ...(selection.inspectionId ? { inspectionId: selection.inspectionId } : {}),
      ...(selection.inspectionSectionInstanceId
        ? { inspectionSectionInstanceId: selection.inspectionSectionInstanceId }
        : {}),
    };
  }
  if (tab === 'assets') return selection.assetId ? { assetId: selection.assetId } : {};
  if (tab === 'meters') return selection.meterId ? { meterId: selection.meterId } : {};
  if (tab === 'maintenance') {
    return {
      ...(selection.maintenanceIssueId ? { maintenanceIssueId: selection.maintenanceIssueId } : {}),
      ...(selection.maintenanceWorkOrderId ? { maintenanceWorkOrderId: selection.maintenanceWorkOrderId } : {}),
    };
  }
  return {};
}

function activeContext(tab: DossierTab, selection: UnitRouteSelection): readonly string[] {
  const group = groups.find((candidate) =>
    candidate.items.some((item) => item.tab === tab),
  );
  const item =
    tab === 'overview'
      ? overviewItem
      : group?.items.find((candidate) => candidate.tab === tab);

  const context = ['Unit dossier'];
  if (group) context.push(group.label);
  if (item) context.push(item.label);

  if (tab === 'contracts') {
    if (selection.amendmentId) context.push('Amendment detail');
    else if (selection.agreementId) context.push('Agreement detail');
    else if (selection.tenancyId) context.push('Tenancy contracts');
  } else if (tab === 'inspections' && selection.inspectionId) {
    context.push(selection.inspectionSectionInstanceId ? 'Field section' : 'Inspection detail');
  } else if (tab === 'assets' && selection.assetId) {
    context.push('Asset detail');
  } else if (tab === 'meters' && selection.meterId) {
    context.push('Meter detail');
  } else if (tab === 'maintenance' && selection.maintenanceIssueId) {
    context.push(selection.maintenanceWorkOrderId ? 'Work order detail' : 'Issue detail');
  }

  return context;
}

function DossierLink({
  item,
  propertyId,
  unitId,
  asOf,
  tab,
  selection,
  navigate,
}: UnitDossierNavigationProps & { readonly item: DossierNavigationItem }) {
  const active = tab === item.tab;
  return (
    <WorkspaceLink
      ariaCurrent={active ? 'page' : undefined}
      className={`dossier-nav-link ${active ? 'dossier-nav-link-active' : ''}`}
      navigate={navigate}
      route={unitRoute(propertyId, unitId, asOf, item.tab, selectionForTab(item.tab, selection))}
    >
      <span>{item.label}</span>
      <small>{item.description}</small>
    </WorkspaceLink>
  );
}

export function UnitDossierNavigation(props: UnitDossierNavigationProps) {
  const context = activeContext(props.tab, props.selection);

  return (
    <div className="dossier-navigation-shell">
      <nav
        aria-label="Unit dossier navigation"
        className="dossier-navigation"
        data-unit-dossier-navigation
      >
        <div className="dossier-nav-overview">
          <DossierLink item={overviewItem} {...props} />
        </div>

        <div className="dossier-nav-groups">
          {groups.map((group) => {
            const active = group.items.some((item) => item.tab === props.tab);
            return (
              <section
                className={`dossier-nav-group ${active ? 'dossier-nav-group-active' : ''}`}
                data-dossier-nav-group={group.id}
                key={group.id}
              >
                <div className="dossier-nav-group-heading">
                  <strong>{group.label}</strong>
                  <small>{group.description}</small>
                </div>
                <div className="dossier-nav-group-links">
                  {group.items.map((item) => (
                    <DossierLink item={item} key={item.tab} {...props} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </nav>

      <nav
        aria-label="Unit dossier context"
        className="dossier-context-trail"
        data-unit-dossier-context
      >
        {context.map((label, index) => (
          <span key={`${index}:${label}`}>
            {index > 0 ? <span aria-hidden="true">›</span> : null}
            <strong aria-current={index === context.length - 1 ? 'page' : undefined}>
              {label}
            </strong>
          </span>
        ))}
      </nav>
    </div>
  );
}
