export const INSPECTION_PHOTO_ACCEPT =
  'image/jpeg,image/png,image/webp';
export const INSPECTION_PHOTO_RECOMPRESS_THRESHOLD_BYTES =
  1536 * 1024;
export const INSPECTION_PHOTO_MAX_SOURCE_BYTES = 32 * 1024 * 1024;
export const INSPECTION_PHOTO_MAX_EDGE_PX = 2048;
export const INSPECTION_PHOTO_MAX_SOURCE_PIXELS = 80_000_000;
export const INSPECTION_PHOTO_JPEG_QUALITY = 0.82;

const SUPPORTED_PHOTO_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

export interface DecodedInspectionPhoto {
  readonly width: number;
  readonly height: number;
  readonly draw: (
    context: CanvasRenderingContext2D,
    width: number,
    height: number,
  ) => void;
  readonly dispose: () => void;
}

export interface InspectionPhotoRuntime {
  readonly decode: (file: File) => Promise<DecodedInspectionPhoto>;
  readonly encodeJpeg: (
    decoded: DecodedInspectionPhoto,
    width: number,
    height: number,
    quality: number,
  ) => Promise<Blob>;
}

export interface PreparedInspectionPhoto {
  readonly file: File;
  readonly compressed: boolean;
  readonly originalBytes: number;
  readonly preparedBytes: number;
  readonly originalWidth: number | null;
  readonly originalHeight: number | null;
  readonly preparedWidth: number | null;
  readonly preparedHeight: number | null;
}

function inferredMimeType(file: File): string | null {
  const declared = file.type.trim().toLowerCase();
  if (declared === 'image/jpg') return 'image/jpeg';
  if (SUPPORTED_PHOTO_MIME_TYPES.has(declared)) return declared;

  const name = file.name.trim().toLowerCase();
  if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg';
  if (name.endsWith('.png')) return 'image/png';
  if (name.endsWith('.webp')) return 'image/webp';
  return null;
}

function normalizedSourceFile(file: File, mimeType: string): File {
  if (file.type.trim().toLowerCase() === mimeType) return file;
  return new File([file], file.name, {
    type: mimeType,
    lastModified: file.lastModified,
  });
}

function jpegFileName(name: string): string {
  const trimmed = name.trim();
  const base = trimmed.replace(/\.[^.]+$/, '') || 'inspection-photo';
  return `${base}.jpg`;
}

export function scaledInspectionPhotoDimensions(
  width: number,
  height: number,
): { readonly width: number; readonly height: number } {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    throw new Error('Photo dimensions are invalid.');
  }

  const longestEdge = Math.max(width, height);
  const scale = Math.min(1, INSPECTION_PHOTO_MAX_EDGE_PX / longestEdge);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

async function decodeBrowserPhoto(file: File): Promise<DecodedInspectionPhoto> {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(file);
    return {
      width: bitmap.width,
      height: bitmap.height,
      draw: (context, width, height) => {
        context.drawImage(bitmap, 0, 0, width, height);
      },
      dispose: () => bitmap.close(),
    };
  }

  const url = URL.createObjectURL(file);
  const image = new Image();
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Photo could not be decoded.'));
      image.src = url;
    });
  } catch (cause) {
    URL.revokeObjectURL(url);
    throw cause;
  }

  return {
    width: image.naturalWidth,
    height: image.naturalHeight,
    draw: (context, width, height) => {
      context.drawImage(image, 0, 0, width, height);
    },
    dispose: () => URL.revokeObjectURL(url),
  };
}

async function encodeBrowserJpeg(
  decoded: DecodedInspectionPhoto,
  width: number,
  height: number,
  quality: number,
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) {
    throw new Error('Browser image canvas is unavailable.');
  }

  decoded.draw(context, width, height);
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/jpeg', quality);
  });
  canvas.width = 0;
  canvas.height = 0;

  if (!blob || blob.size === 0) {
    throw new Error('Photo compression did not produce a valid JPEG.');
  }
  return blob;
}

const browserRuntime: InspectionPhotoRuntime = {
  decode: decodeBrowserPhoto,
  encodeJpeg: encodeBrowserJpeg,
};

export async function prepareInspectionPhoto(
  source: File,
  runtime: InspectionPhotoRuntime = browserRuntime,
): Promise<PreparedInspectionPhoto> {
  if (source.size === 0) {
    throw new Error('Choose a non-empty photo.');
  }
  if (source.size > INSPECTION_PHOTO_MAX_SOURCE_BYTES) {
    throw new Error(
      'Photo source files are limited to 32 MiB before browser compression.',
    );
  }

  const mimeType = inferredMimeType(source);
  if (!mimeType) {
    throw new Error('Photo evidence must be JPEG, PNG, or WebP.');
  }

  const normalized = normalizedSourceFile(source, mimeType);
  if (normalized.size <= INSPECTION_PHOTO_RECOMPRESS_THRESHOLD_BYTES) {
    return {
      file: normalized,
      compressed: false,
      originalBytes: source.size,
      preparedBytes: normalized.size,
      originalWidth: null,
      originalHeight: null,
      preparedWidth: null,
      preparedHeight: null,
    };
  }

  let decoded: DecodedInspectionPhoto;
  try {
    decoded = await runtime.decode(normalized);
  } catch {
    throw new Error(
      'Large photo could not be decoded safely for browser compression.',
    );
  }

  try {
    const pixels = decoded.width * decoded.height;
    if (
      !Number.isSafeInteger(pixels) ||
      pixels <= 0 ||
      pixels > INSPECTION_PHOTO_MAX_SOURCE_PIXELS
    ) {
      throw new Error(
        'Photo dimensions are too large for safe browser compression.',
      );
    }

    const preparedDimensions = scaledInspectionPhotoDimensions(
      decoded.width,
      decoded.height,
    );
    const encoded = await runtime.encodeJpeg(
      decoded,
      preparedDimensions.width,
      preparedDimensions.height,
      INSPECTION_PHOTO_JPEG_QUALITY,
    );

    if (encoded.size >= normalized.size) {
      return {
        file: normalized,
        compressed: false,
        originalBytes: source.size,
        preparedBytes: normalized.size,
        originalWidth: decoded.width,
        originalHeight: decoded.height,
        preparedWidth: decoded.width,
        preparedHeight: decoded.height,
      };
    }

    const file = new File([encoded], jpegFileName(normalized.name), {
      type: 'image/jpeg',
      lastModified: normalized.lastModified,
    });
    return {
      file,
      compressed: true,
      originalBytes: source.size,
      preparedBytes: file.size,
      originalWidth: decoded.width,
      originalHeight: decoded.height,
      preparedWidth: preparedDimensions.width,
      preparedHeight: preparedDimensions.height,
    };
  } finally {
    decoded.dispose();
  }
}
