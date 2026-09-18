import type { ClockPort } from '@portfolio/application';

export class SystemClock implements ClockPort {
  now(): string {
    return new Date().toISOString();
  }
}
