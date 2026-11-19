import type { MouseEvent, ReactNode } from 'react';
import {
  workspaceRouteHref,
  type WorkspaceRoute,
} from './workspace-route.js';
import type { NavigateWorkspace } from './use-workspace-navigation.js';

interface WorkspaceLinkProps {
  readonly route: WorkspaceRoute;
  readonly navigate: NavigateWorkspace;
  readonly className: string;
  readonly children: ReactNode;
  readonly ariaCurrent?: 'page' | undefined;
  readonly ariaLabel?: string | undefined;
}

export function WorkspaceLink({
  route,
  navigate,
  className,
  children,
  ariaCurrent,
  ariaLabel,
}: WorkspaceLinkProps) {
  function onClick(event: MouseEvent<HTMLAnchorElement>) {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    event.preventDefault();
    navigate(route);
  }

  return (
    <a
      aria-current={ariaCurrent}
      aria-label={ariaLabel}
      className={className}
      href={workspaceRouteHref(route)}
      onClick={onClick}
    >
      {children}
    </a>
  );
}
