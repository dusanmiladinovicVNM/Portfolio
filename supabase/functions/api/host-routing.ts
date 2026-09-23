import {
  isPublicHealthRuntimePath,
  relativeRuntimePath,
} from '@portfolio/api';

export const SUPABASE_FUNCTION_BASE_PATH = '/api';

export function supabaseRelativePortfolioPath(pathname: string): string | null {
  return relativeRuntimePath(pathname, SUPABASE_FUNCTION_BASE_PATH);
}

export function isSupabasePublicHealthPath(pathname: string): boolean {
  return isPublicHealthRuntimePath(pathname, SUPABASE_FUNCTION_BASE_PATH);
}
