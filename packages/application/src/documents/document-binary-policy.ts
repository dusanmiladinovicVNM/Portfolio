export const MAX_BUFFERED_DOCUMENT_BINARY_BYTES = 16 * 1024 * 1024;

export interface BufferedDocumentBinaryPolicy {
  readonly maxBytes: number;
}

export const DEFAULT_BUFFERED_DOCUMENT_BINARY_POLICY: BufferedDocumentBinaryPolicy =
  Object.freeze({
    maxBytes: MAX_BUFFERED_DOCUMENT_BINARY_BYTES,
  });
