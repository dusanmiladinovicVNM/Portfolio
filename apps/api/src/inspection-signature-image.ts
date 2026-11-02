import { deflateSync, inflateSync } from 'node:zlib';

/**
 * An exact, already integrity-verified signature binary prepared for a PDF image
 * XObject. No browser canvas, external converter, or provider URL is involved.
 */
export interface SignaturePdfImage {
  readonly width: number;
  readonly height: number;
  readonly format: 'flate' | 'dct';
  readonly data: Uint8Array;
}

const MAX_SIGNATURE_PIXELS = 4_000_000;
const PNG_MAGIC = [137, 80, 78, 71, 13, 10, 26, 10] as const;

function assertDimensions(width: number, height: number): void {
  if (
    !Number.isInteger(width) || !Number.isInteger(height) ||
    width < 1 || height < 1 ||
    width * height > MAX_SIGNATURE_PIXELS
  ) {
    throw new Error('Signature image dimensions exceed the bounded PDF rendering limit.');
  }
}

function pngImage(content: Uint8Array): SignaturePdfImage {
  const source = Buffer.from(content);
  if (source.length < 45 || PNG_MAGIC.some((byte, index) => source[index] !== byte)) {
    throw new Error('Signature PNG has an invalid header.');
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  let channels = 0;
  let seenHeader = false;
  let seenEnd = false;
  const idat: Buffer[] = [];

  while (offset + 12 <= source.length) {
    const length = source.readUInt32BE(offset);
    const start = offset + 8;
    const end = start + length;
    if (end + 4 > source.length) {
      throw new Error('Signature PNG has a truncated chunk.');
    }
    const type = source.toString('ascii', offset + 4, offset + 8);
    if (type === 'IHDR') {
      if (seenHeader || length !== 13) {
        throw new Error('Signature PNG has an invalid IHDR.');
      }
      seenHeader = true;
      width = source.readUInt32BE(start);
      height = source.readUInt32BE(start + 4);
      assertDimensions(width, height);
      const depth = source[start + 8];
      const colorType = source[start + 9];
      if (depth !== 8 || source[start + 10] !== 0 ||
          source[start + 11] !== 0 || source[start + 12] !== 0) {
        throw new Error('Signature PNG must use 8-bit, non-interlaced pixels.');
      }
      channels = colorType === 6 ? 4 : colorType === 2 ? 3 :
        colorType === 4 ? 2 : colorType === 0 ? 1 : 0;
      if (!channels) {
        throw new Error('Signature PNG color type is unsupported; use a truecolor PNG.');
      }
    } else if (type === 'IDAT') {
      if (!seenHeader) throw new Error('Signature PNG has IDAT before IHDR.');
      idat.push(source.subarray(start, end));
    } else if (type === 'IEND') {
      seenEnd = true;
      break;
    }
    offset = end + 4;
  }
  if (!seenHeader || !seenEnd || idat.length === 0) {
    throw new Error('Signature PNG is missing required image data.');
  }

  const rowBytes = width * channels;
  const expectedBytes = (rowBytes + 1) * height;
  const inflated = inflateSync(Buffer.concat(idat), {
    maxOutputLength: expectedBytes,
  });
  if (inflated.length !== expectedBytes) {
    throw new Error('Signature PNG decompressed to an unexpected length.');
  }

  const rgb = Buffer.alloc(width * height * 3);
  let previous = Buffer.alloc(rowBytes);
  let cursor = 0;
  let dest = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = inflated[cursor++]!;
    const line = Buffer.alloc(rowBytes);
    for (let i = 0; i < rowBytes; i += 1) {
      const raw = inflated[cursor++]!;
      const left = i >= channels ? line[i - channels]! : 0;
      const above = previous[i]!;
      const upperLeft = i >= channels ? previous[i - channels]! : 0;
      let predictor = 0;
      if (filter === 1) predictor = left;
      else if (filter === 2) predictor = above;
      else if (filter === 3) predictor = Math.floor((left + above) / 2);
      else if (filter === 4) {
        const p = left + above - upperLeft;
        const dl = Math.abs(p - left);
        const da = Math.abs(p - above);
        const du = Math.abs(p - upperLeft);
        predictor = dl <= da && dl <= du ? left : da <= du ? above : upperLeft;
      } else if (filter !== 0) {
        throw new Error('Signature PNG uses an invalid scanline filter.');
      }
      line[i] = (raw + predictor) & 255;
    }
    for (let x = 0; x < width; x += 1) {
      const index = x * channels;
      const grayscale = channels === 1 || channels === 2;
      const r = line[index]!;
      const g = grayscale ? r : line[index + 1]!;
      const b = grayscale ? r : line[index + 2]!;
      const alpha = channels === 2 ? line[index + 1]! :
        channels === 4 ? line[index + 3]! : 255;
      // Composite onto white, matching the signature canvas's paper.
      rgb[dest++] = Math.round((r * alpha + 255 * (255 - alpha)) / 255);
      rgb[dest++] = Math.round((g * alpha + 255 * (255 - alpha)) / 255);
      rgb[dest++] = Math.round((b * alpha + 255 * (255 - alpha)) / 255);
    }
    previous = line;
  }

  return { width, height, format: 'flate', data: deflateSync(rgb) };
}

function jpegImage(content: Uint8Array): SignaturePdfImage {
  const data = Buffer.from(content);
  if (data.length < 12 || data[0] !== 0xff || data[1] !== 0xd8) {
    throw new Error('Signature JPEG has an invalid header.');
  }
  let offset = 2;
  while (offset + 4 <= data.length) {
    if (data[offset++] !== 0xff) throw new Error('Signature JPEG has an invalid marker.');
    while (data[offset] === 0xff) offset += 1;
    const marker = data[offset++]!;
    if (marker === 0xda || marker === 0xd9) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > data.length) break;
    const length = data.readUInt16BE(offset);
    if (length < 2 || offset + length > data.length) {
      throw new Error('Signature JPEG has an invalid segment length.');
    }
    if ([0xc0, 0xc1, 0xc2].includes(marker)) {
      if (length < 8 || data[offset + 2] !== 8 || data[offset + 7] !== 3) {
        throw new Error('Signature JPEG must use 8-bit, three-component RGB data.');
      }
      const height = data.readUInt16BE(offset + 3);
      const width = data.readUInt16BE(offset + 5);
      assertDimensions(width, height);
      return { width, height, format: 'dct', data };
    }
    offset += length;
  }
  throw new Error('Signature JPEG has no supported SOF marker.');
}

export function prepareSignaturePdfImage(
  mimeType: string,
  content: Uint8Array,
): SignaturePdfImage {
  const mime = mimeType.trim().toLowerCase();
  if (mime === 'image/png') return pngImage(content);
  if (mime === 'image/jpeg') return jpegImage(content);
  // A document-version file is never silently represented by its filename.
  throw new Error(
    'Graphical Inspection PDF signatures require PNG or JPEG. ' +
    'WebP/PDF signature evidence must be explicitly converted and re-signed before finalization.',
  );
}
