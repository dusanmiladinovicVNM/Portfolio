import { useCallback, useEffect, useState } from 'react';
import {
  parseWorkspaceLocation,
  workspaceRouteHref,
  type WorkspaceRoute,
} from './workspace-route.js';

export interface NavigateWorkspaceOptions {
  readonly replace?: boolean;
}

export type NavigateWorkspace = (
  route: WorkspaceRoute,
  options?: NavigateWorkspaceOptions,
) => void;

function currentRoute(): WorkspaceRoute {
  return parseWorkspaceLocation(window.location.pathname, window.location.search);
}

function currentHref(): string {
  return `${window.location.pathname}${window.location.search}`;
}

export function useWorkspaceNavigation(): {
  readonly route: WorkspaceRoute;
  readonly navigate: NavigateWorkspace;
} {
  const [route, setRoute] = useState<WorkspaceRoute>(currentRoute);

  useEffect(() => {
    const canonicalHref = workspaceRouteHref(currentRoute());
    if (currentHref() !== canonicalHref) {
      window.history.replaceState(null, '', canonicalHref);
    }

    const onPopState = () => setRoute(currentRoute());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigate = useCallback<NavigateWorkspace>((next, options) => {
    const href = workspaceRouteHref(next);
    if (options?.replace) {
      window.history.replaceState(null, '', href);
    } else {
      window.history.pushState(null, '', href);
    }
    setRoute(next);
  }, []);

  return { route, navigate };
}
