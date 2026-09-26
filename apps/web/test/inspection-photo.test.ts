import { describe, expect, it } from 'vitest';
import {
  INSPECTION_PHOTO_JPEG_QUALITY,
  INSPECTION_PHOTO_MAX_EDGE_PX,
  prepareInspectionPhoto,
  scaledInspectionPhotoDimensions,
  type DecodedInspectionPhoto,
  type InspectionPhotoRuntime,
} from '../src/dossier/inspection-photo.js';

function photoFile(
  name: string,
  type: string,
  bytes: number,
): File {
  return new File([new Uint8Array(bytes)], name, {
    type,
    lastModified: 123,
  });
}

function runtime(
  options: {
    readonly width: number;
    readonly height: number;
    readonly encodedBytes: number;
  },
  calls: {
    decoded: number;
    encoded: Array<{
      width: number;
      height: number;
      quality: number;
    }>;
    disposed: number;
  },
): InspectionPhotoRuntime {
  return {
    decode: async () => {
      calls.decoded += 1;
      const decoded: DecodedInspectionPhoto = {
        width: options.width,
        height: options.height,
        draw: () => undefined,
        dispose: () => {
          calls.disposed += 1;
        },
      };
      return decoded;
    },
    encodeJpeg: async (_decoded, width, height, quality) => {
      calls.encoded.push({ width, height, quality });
      return new Blob([new Uint8Array(options.encodedBytes)], {
        type: 'image/jpeg',
      });
    },
  };
}

describe('Inspection photo preparation', () => {
  it('keeps a small JPEG byte-for-byte without decoding or recompressing it', async () => {
    const source = photoFile('small.jpg', 'image/jpeg', 200_000);
    const calls = { decoded: 0, encoded: [] as Array<never>, disposed: 0 };

    const prepared = await prepareInspectionPhoto(
      source,
      runtime(
        { width: 4000, height: 3000, encodedBytes: 100_000 },
        calls as {
          decoded: number;
          encoded: Array<{ width: number; height: number; quality: number }>;
          disposed: number;
        },
      ),
    );

    expect(prepared.file).toBe(source);
    expect(prepared.compressed).toBe(false);
    expect(prepared.preparedBytes).toBe(source.size);
    expect(calls.decoded).toBe(0);
    expect(calls.disposed).toBe(0);
  });

  it('downscales and compresses a large landscape JPEG before upload', async () => {
    const source = photoFile('room.jpeg', 'image/jpeg', 3_000_000);
    const calls = {
      decoded: 0,
      encoded: [] as Array<{ width: number; height: number; quality: number }>,
      disposed: 0,
    };

    const prepared = await prepareInspectionPhoto(
      source,
      runtime(
        { width: 4000, height: 3000, encodedBytes: 700_000 },
        calls,
      ),
    );

    expect(prepared.compressed).toBe(true);
    expect(prepared.file.name).toBe('room.jpg');
    expect(prepared.file.type).toBe('image/jpeg');
    expect(prepared.file.size).toBe(700_000);
    expect(prepared.originalWidth).toBe(4000);
    expect(prepared.originalHeight).toBe(3000);
    expect(prepared.preparedWidth).toBe(2048);
    expect(prepared.preparedHeight).toBe(1536);
    expect(calls.encoded).toEqual([
      {
        width: 2048,
        height: 1536,
        quality: INSPECTION_PHOTO_JPEG_QUALITY,
      },
    ]);
    expect(calls.disposed).toBe(1);
  });

  it('never replaces the source when JPEG encoding would make it larger', async () => {
    const source = photoFile('already-efficient.jpg', 'image/jpeg', 2_000_000);
    const calls = {
      decoded: 0,
      encoded: [] as Array<{ width: number; height: number; quality: number }>,
      disposed: 0,
    };

    const prepared = await prepareInspectionPhoto(
      source,
      runtime(
        { width: 1600, height: 1200, encodedBytes: 2_100_000 },
        calls,
      ),
    );

    expect(prepared.file).toBe(source);
    expect(prepared.compressed).toBe(false);
    expect(prepared.preparedWidth).toBe(1600);
    expect(prepared.preparedHeight).toBe(1200);
    expect(calls.disposed).toBe(1);
  });

  it('rejects unsupported photo formats instead of silently uploading them as photos', async () => {
    await expect(
      prepareInspectionPhoto(
        photoFile('camera.heic', 'image/heic', 2_000_000),
      ),
    ).rejects.toThrow('Photo evidence must be JPEG, PNG, or WebP.');
  });

  it('scales portrait images by their longest edge', () => {
    expect(scaledInspectionPhotoDimensions(1500, 3000)).toEqual({
      width: 1024,
      height: INSPECTION_PHOTO_MAX_EDGE_PX,
    });
  });
});
