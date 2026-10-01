import type { StaffResponse } from '@portfolio/contracts';
import type { ReactNode } from 'react';
import { WorkspaceLink } from './WorkspaceLink.js';
import {
  dashboardRoute,
  discoveryRoute,
  inspectionSchemasRoute,
  partiesRoute,
  propertiesRoute,
  propertyRoute,
  staffRoute,
  workRoute,
  type WorkspaceRoute,
} from './workspace-route.js';
import type { NavigateWorkspace } from './use-workspace-navigation.js';

interface WorkspaceNavigationProps {
  readonly navigate: NavigateWorkspace;
  readonly route: WorkspaceRoute;
  readonly staffRole: StaffResponse['role'] | null;
}

function navClass(active: boolean): string {
  return 'nav-item' + (active ? ' nav-item-active' : '');
}

function NavGroup({
  id,
  label,
  children,
}: {
  readonly id: string;
  readonly label: string;
  readonly children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={id}
      className="nav-group"
      data-nav-group={id.replace('nav-group-', '')}
    >
      <p className="nav-group-label" id={id}>
        {label}
      </p>
      <div className="nav-group-links">{children}</div>
    </section>
  );
}

export function WorkspaceNavigation({
  navigate,
  route,
  staffRole,
}: WorkspaceNavigationProps) {
  const hasPropertyContext = route.kind === 'property' || route.kind === 'unit';
  const hasAdministration =
    staffRole === 'admin' || staffRole === 'manager';

  return (
    <nav aria-label="Primary">
      <NavGroup id="nav-group-workspace" label="Workspace">
        <WorkspaceLink
          ariaCurrent={route.kind === 'dashboard' ? 'page' : undefined}
          className={navClass(route.kind === 'dashboard')}
          navigate={navigate}
          route={dashboardRoute(route.asOf)}
        >
          Overview
        </WorkspaceLink>
        <WorkspaceLink
          ariaCurrent={route.kind === 'work' ? 'page' : undefined}
          className={navClass(route.kind === 'work')}
          navigate={navigate}
          route={workRoute(route.asOf)}
        >
          Work
        </WorkspaceLink>
        <WorkspaceLink
          ariaCurrent={route.kind === 'discovery' ? 'page' : undefined}
          className={navClass(route.kind === 'discovery')}
          navigate={navigate}
          route={discoveryRoute(route.asOf)}
        >
          Find
        </WorkspaceLink>
      </NavGroup>

      <NavGroup id="nav-group-portfolio" label="Portfolio">
        <WorkspaceLink
          ariaCurrent={route.kind === 'properties' ? 'page' : undefined}
          className={navClass(route.kind === 'properties')}
          navigate={navigate}
          route={propertiesRoute(route.asOf)}
        >
          Properties
        </WorkspaceLink>
        <WorkspaceLink
          ariaCurrent={route.kind === 'parties' ? 'page' : undefined}
          className={navClass(route.kind === 'parties')}
          navigate={navigate}
          route={partiesRoute(route.asOf)}
        >
          Parties
        </WorkspaceLink>
      </NavGroup>

      {hasPropertyContext ? (
        <NavGroup id="nav-group-current-context" label="Current context">
          <WorkspaceLink
            ariaCurrent={route.kind === 'property' ? 'page' : undefined}
            className={navClass(route.kind === 'property')}
            navigate={navigate}
            route={propertyRoute(route.propertyId, route.asOf)}
          >
            Property
          </WorkspaceLink>
          {route.kind === 'unit' ? (
            <WorkspaceLink
              ariaCurrent="page"
              className="nav-item nav-item-active"
              navigate={navigate}
              route={route}
            >
              Unit dossier
            </WorkspaceLink>
          ) : null}
        </NavGroup>
      ) : null}

      {hasAdministration ? (
        <NavGroup id="nav-group-administration" label="Administration">
          {staffRole === 'admin' ? (
            <WorkspaceLink
              ariaCurrent={route.kind === 'staff' ? 'page' : undefined}
              className={navClass(route.kind === 'staff')}
              navigate={navigate}
              route={staffRoute(route.asOf)}
            >
              Staff
            </WorkspaceLink>
          ) : null}
          <WorkspaceLink
            ariaCurrent={route.kind === 'inspection-schemas' ? 'page' : undefined}
            className={navClass(route.kind === 'inspection-schemas')}
            navigate={navigate}
            route={inspectionSchemasRoute(route.asOf)}
          >
            Inspection schemas
          </WorkspaceLink>
        </NavGroup>
      ) : null}
    </nav>
  );
}
