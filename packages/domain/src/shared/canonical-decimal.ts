const CANONICAL_DECIMAL = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;

export function normalizeCanonicalDecimal(
  value: string,
): string | null {
  const normalized = value.trim();
  return CANONICAL_DECIMAL.test(normalized) ? normalized : null;
}

export function isCanonicalDecimal(value: string): boolean {
  return normalizeCanonicalDecimal(value) === value;
}
