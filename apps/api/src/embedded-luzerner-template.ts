import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { ApplicationError } from '@portfolio/application';
import { CanonicalLuzernerPdfRenderer } from './canonical-luzerner-pdf-renderer.js';
import chunk01 from './luzerner-template-data/chunk-01.js';
import chunk02 from './luzerner-template-data/chunk-02.js';
import chunk03 from './luzerner-template-data/chunk-03.js';

const EXPECTED_TEMPLATE_BYTES = 578_564;
const EXPECTED_TEMPLATE_SHA256 =
  '2d36e644e11fe4ef62728bed5b694a36ba2cfb071ee044fc2e43eff04184ced5';

let cachedTemplate: Uint8Array | null = null;

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function verifyTemplate(template: Uint8Array): void {
  if (template.byteLength !== EXPECTED_TEMPLATE_BYTES) {
    throw new ApplicationError(
      'LUZERNER_PDF_TEMPLATE_INVALID',
      `Embedded Luzerner template has ${template.byteLength} bytes; expected ${EXPECTED_TEMPLATE_BYTES}.`,
    );
  }

  const sha256 = createHash('sha256').update(template).digest('hex');
  if (sha256 !== EXPECTED_TEMPLATE_SHA256) {
    throw new ApplicationError(
      'LUZERNER_PDF_TEMPLATE_INVALID',
      'Embedded Luzerner template checksum does not match the reviewed LU-2020 source.',
    );
  }
}

export function embeddedLuzernerTemplateBytes(): Uint8Array {
  if (cachedTemplate === null) {
    let decompressed: Uint8Array;
    try {
      decompressed = new Uint8Array(
        gunzipSync(decodeBase64(chunk01 + chunk02 + chunk03)),
      );
    } catch {
      throw new ApplicationError(
        'LUZERNER_PDF_TEMPLATE_INVALID',
        'Embedded Luzerner template could not be decompressed.',
      );
    }

    verifyTemplate(decompressed);
    cachedTemplate = decompressed;
  }

  return new Uint8Array(cachedTemplate);
}

export function createEmbeddedLuzernerPdfRenderer(): CanonicalLuzernerPdfRenderer {
  return new CanonicalLuzernerPdfRenderer(embeddedLuzernerTemplateBytes());
}
