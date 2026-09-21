export function localDateOnly(now = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatExactMoney(currency: string, amount: string): string {
  const [whole = '0', fraction = '00'] = amount.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, '’');
  return `${currency} ${grouped}.${fraction}`;
}


interface TimelineOccurrence {
  readonly precision: 'date' | 'instant';
  readonly occurredOn: string;
  readonly occurredAt: string | null;
}

export function formatTimelineOccurrence(event: TimelineOccurrence): string {
  if (event.precision === 'date') return event.occurredOn;
  if (!event.occurredAt) return event.occurredOn;

  const parsed = new Date(event.occurredAt);
  if (Number.isNaN(parsed.getTime())) return event.occurredAt;

  return `${new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(parsed)} UTC`;
}

export function formatTimelineEventType(eventType: string): string {
  const [, action = eventType] = eventType.split('.', 2);
  return action
    .replaceAll('_', ' ')
    .replace(/^./, (letter) => letter.toUpperCase());
}

export function formatDetailKey(key: string): string {
  return key
    .replaceAll('_', ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, (letter) => letter.toUpperCase());
}

export function formatTimelineValue(
  value: string | number | boolean | null,
): string {
  if (value === null) return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}
