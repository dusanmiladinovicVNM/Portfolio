const SWISS_TIME_ZONE = 'Europe/Zurich';

function pad2(value: string | number): string {
  return String(value).padStart(2, '0');
}

export function localDateOnly(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: SWISS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((entry) => entry.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function formatSwissDate(value: string | null | undefined): string {
  if (!value) return '—';
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  if (!match) return value;
  return `${match[3]}.${match[2]}.${match[1]}`;
}

export function formatSwissDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;

  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: SWISS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(parsed);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((entry) => entry.type === type)?.value ?? '';

  return `${part('day')}.${part('month')}.${part('year')} ${part('hour')}:${part('minute')}`;
}

function swissWallClockMatches(
  instant: Date,
  date: string,
  time: string,
): boolean {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: SWISS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((entry) => entry.type === type)?.value ?? '';
  return (
    `${part('year')}-${part('month')}-${part('day')}` === date &&
    `${part('hour')}:${part('minute')}` === time
  );
}

export function swissLocalDateTimeToInstant(
  date: string,
  time: string,
): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(date)) return null;
  if (!/^\d{2}:\d{2}$/u.test(time)) return null;

  const candidates = ['+01:00', '+02:00']
    .map((offset) => new Date(`${date}T${time}:00${offset}`))
    .filter((candidate) => !Number.isNaN(candidate.getTime()))
    .filter((candidate) => swissWallClockMatches(candidate, date, time));

  // Reject DST gaps and ambiguous repeated wall-clock times instead of silently
  // choosing a different instant.
  if (candidates.length !== 1) return null;
  return candidates[0]!.toISOString();
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
  if (event.precision === 'date') return formatSwissDate(event.occurredOn);
  if (!event.occurredAt) return formatSwissDate(event.occurredOn);
  return formatSwissDateTime(event.occurredAt);
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

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export function isInternalUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

export function formatTimelineValue(
  value: string | number | boolean | null,
): string {
  if (value === null) return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (isInternalUuid(value)) return 'Internal reference';
  if (typeof value === 'string') {
    if (/^\d{4}-\d{2}-\d{2}$/u.test(value)) return formatSwissDate(value);
    if (/^\d{4}-\d{2}-\d{2}T/u.test(value)) return formatSwissDateTime(value);
  }
  return String(value);
}
