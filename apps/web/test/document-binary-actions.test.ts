import { describe, expect, it } from 'vitest';
import { canOpenDocumentMimeType } from '../src/documents/DocumentBinaryActions.js';

describe('Document binary browser policy', () => {
  it('allows inline Open only for passive dossier formats', () => {
    expect(canOpenDocumentMimeType('application/pdf')).toBe(true);
    expect(canOpenDocumentMimeType('image/png')).toBe(true);
    expect(canOpenDocumentMimeType('image/jpeg')).toBe(true);
    expect(canOpenDocumentMimeType('image/webp')).toBe(true);
    expect(canOpenDocumentMimeType('image/gif')).toBe(true);
  });

  it('keeps active or executable-capable formats download-only', () => {
    expect(canOpenDocumentMimeType('text/html')).toBe(false);
    expect(canOpenDocumentMimeType('image/svg+xml')).toBe(false);
    expect(canOpenDocumentMimeType('application/javascript')).toBe(false);
    expect(canOpenDocumentMimeType('application/octet-stream')).toBe(false);
  });
});
