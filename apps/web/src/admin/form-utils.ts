export function optionalNumber(
  form: FormData,
  name: string,
): number | undefined {
  const value = String(form.get(name) ?? '').trim();
  return value === '' ? undefined : Number(value);
}

export function optionalString(
  form: FormData,
  name: string,
): string | undefined {
  const value = String(form.get(name) ?? '').trim();
  return value === '' ? undefined : value;
}

export function requiredString(form: FormData, name: string): string {
  return String(form.get(name) ?? '').trim();
}

export function contractErrorMessage(): string {
  return 'Please check the entered values and required fields.';
}
