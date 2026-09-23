export function normalizeBasePath(basePath: string): string {
  if (basePath === '/') return '';
  const prefixed = basePath.startsWith('/') ? basePath : '/' + basePath;
  return prefixed.replace(/\/$/u, '');
}

export function relativeRuntimePath(
  pathname: string,
  basePath: string,
): string | null {
  const normalizedBasePath = normalizeBasePath(basePath);
  if (!normalizedBasePath) return pathname || '/';
  if (pathname === normalizedBasePath) return '/';
  if (pathname.startsWith(normalizedBasePath + '/')) {
    return pathname.slice(normalizedBasePath.length);
  }
  return null;
}

export function isPublicHealthRuntimePath(
  pathname: string,
  basePath: string,
): boolean {
  const relativePath = relativeRuntimePath(pathname, basePath);
  return relativePath === '/health/live' || relativePath === '/health/ready';
}
