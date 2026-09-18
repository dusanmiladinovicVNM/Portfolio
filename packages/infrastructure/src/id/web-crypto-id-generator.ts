import type { IdGenerator } from '@portfolio/application';

export class WebCryptoIdGenerator implements IdGenerator {
  next(): string {
    return globalThis.crypto.randomUUID();
  }
}
