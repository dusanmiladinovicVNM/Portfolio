import type { Sha256Port } from '@portfolio/application';

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

export class WebCryptoSha256 implements Sha256Port {
  async digest(content: Uint8Array): Promise<string> {
    const digest = await globalThis.crypto.subtle.digest(
      'SHA-256',
      toArrayBuffer(content),
    );

    return [...new Uint8Array(digest)]
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
  }
}
