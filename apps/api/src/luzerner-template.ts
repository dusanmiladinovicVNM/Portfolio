import { ApplicationError } from '@portfolio/application';
import chunk1 from './luzerner-template-data/chunk-1.js';
import chunk2 from './luzerner-template-data/chunk-2.js';
import chunk3 from './luzerner-template-data/chunk-3.js';
import chunk4 from './luzerner-template-data/chunk-4.js';
import chunk5 from './luzerner-template-data/chunk-5.js';
import chunk6 from './luzerner-template-data/chunk-6.js';
import chunk7 from './luzerner-template-data/chunk-7.js';
import chunk8 from './luzerner-template-data/chunk-8.js';

const GZIP_BASE64 = [
  chunk1,
  chunk2,
  chunk3,
  chunk4,
  chunk5,
  chunk6,
  chunk7,
  chunk8,
].join('');

const EXPECTED_TEMPLATE_BYTES = 578564;

function decodeBase64(value: string): Uint8Array {
  let binary: string;
  try {
    binary = atob(value);
  } catch {
    throw new ApplicationError(
      'LUZERNER_PDF_TEMPLATE_INVALID',
      'Embedded Luzerner PDF template is not valid base64.',
    );
  }

  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function gunzip(content: Uint8Array): Promise<Uint8Array> {
  try {
    const copy = new Uint8Array(content.byteLength);
    copy.set(content);
    const stream = new Blob([copy.buffer])
      .stream()
      .pipeThrough(new DecompressionStream('gzip'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    throw new ApplicationError(
      'LUZERNER_PDF_TEMPLATE_INVALID',
      'Embedded Luzerner PDF template could not be decompressed.',
    );
  }
}

let cachedTemplate: Promise<Uint8Array> | null = null;

export async function loadLuzerner2020PdfTemplate(): Promise<Uint8Array> {
  cachedTemplate ??= (async () => {
    const template = await gunzip(decodeBase64(GZIP_BASE64));
    if (
      template.byteLength !== EXPECTED_TEMPLATE_BYTES ||
      new TextDecoder('latin1').decode(template.subarray(0, 8)) !== '%PDF-1.3'
    ) {
      throw new ApplicationError(
        'LUZERNER_PDF_TEMPLATE_INVALID',
        'Embedded Luzerner PDF template failed its immutable byte contract.',
      );
    }
    return template;
  })();

  const canonical = await cachedTemplate;
  return new Uint8Array(canonical);
}
