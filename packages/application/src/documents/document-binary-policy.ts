import { ApplicationError } from '../shared/application-error.js';

export const MAX_BUFFERED_DOCUMENT_BINARY_BYTES = 16 * 1024 * 1024;

export interface BufferedDocumentBinaryPolicy {
  readonly maxBytes: number;
}

export const DEFAULT_BUFFERED_DOCUMENT_BINARY_POLICY: BufferedDocumentBinaryPolicy =
  Object.freeze({
    maxBytes: MAX_BUFFERED_DOCUMENT_BINARY_BYTES,
  });

export function assertBufferedDocumentBinaryWriteSize(
  byteLength: number,
  policy: BufferedDocumentBinaryPolicy = DEFAULT_BUFFERED_DOCUMENT_BINARY_POLICY,
): void {
  if (byteLength > policy.maxBytes) {
    throw new ApplicationError(
      'DOCUMENT_BINARY_UPLOAD_LIMIT_EXCEEDED',
      `Buffered Document binary writes support up to ${policy.maxBytes} bytes.`,
    );
  }
}
