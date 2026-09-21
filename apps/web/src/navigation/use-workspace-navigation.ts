import { useCallback, useEffect, useRef, useState } from 'react';
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

export type NavigationBlocker = (next: WorkspaceRoute) => boolean;
export type SetNavigationBlocker = (
  blocker: NavigationBlocker | null,
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
  readonly setNavigationBlocker: SetNavigationBlocker;
} {
  const [route, setRoute] = useState<WorkspaceRoute>(currentRoute);
  const routeRef = useRef(route);
  const blockerRef = useRef<NavigationBlocker | null>(null);

  useEffect(() => {
    routeRef.current = route;
  }, [route]);

  const setNavigationBlocker = useCallback<SetNavigationBlocker>((blocker) => {
    blockerRef.current = blocker;
  }, []);

  useEffect(() => {
    const canonicalHref = workspaceRouteHref(currentRoute());
    if (currentHref() !== canonicalHref) {
      window.history.replaceState(null, '', canonicalHref);
    }

    const onPopState = () => {
      const next = currentRoute();
      const blocker = blockerRef.current;
      if (blocker && !blocker(next)) {
        window.history.pushState(
          null,
          '',
          workspaceRouteHref(routeRef.current),
        );
        return;
      }
      routeRef.current = next;
      setRoute(next);
    };

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!blockerRef.current) return;
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('popstate', onPopState);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('popstate', onPopState);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, []);

  const navigate = useCallback<NavigateWorkspace>((next, options) => {
    const href = workspaceRouteHref(next);
    if (href === currentHref()) {
      routeRef.current = next;
      setRoute(next);
      return;
    }

    const blocker = blockerRef.current;
    if (blocker && !blocker(next)) return;

    if (options?.replace) {
      window.history.replaceState(null, '', href);
    } else {
      window.history.pushState(null, '', href);
    }
    routeRef.current = next;
    setRoute(next);
  }, []);

  return { route, navigate, setNavigationBlocker };
}
