import { DomainError } from './domain-error.js';

const EXPLICIT_OFFSET_INSTANT =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/;

export function asInstant(
  value: string,
  field = 'timestamp',
  errorCode = 'INVALID_INSTANT',
): string {
  const normalized = value.trim();

  if (
    !EXPLICIT_OFFSET_INSTANT.test(normalized) ||
    Number.isNaN(Date.parse(normalized))
  ) {
    throw new DomainError(
      errorCode,
      `${field} must be a valid ISO timestamp with an explicit UTC offset.`,
    );
  }

  return new Date(normalized).toISOString();
}

export function hasExplicitInstantOffset(value: string): boolean {
  const normalized = value.trim();
  return (
    EXPLICIT_OFFSET_INSTANT.test(normalized) &&
    !Number.isNaN(Date.parse(normalized))
  );
}
