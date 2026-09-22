export interface Sha256Port {
  digest(content: Uint8Array): Promise<string>;
}
