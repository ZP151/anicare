import { describe, expect, it } from 'vitest';

import { inspectJpeg } from './jpeg-policy.js';

const validJpeg = new Uint8Array([
  0xff, 0xd8,
  0xff, 0xe0, 0x00, 0x04, 0x4a, 0x46,
  0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x01, 0x00, 0x01, 0x03,
  0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00,
  0xff, 0xda, 0x00, 0x0c, 0x03, 0x01, 0x00, 0x02, 0x00, 0x03, 0x00, 0x00, 0x3f, 0x00,
  0x00, 0xff, 0xd9,
]);

function withSegment(marker: number): Uint8Array {
  return new Uint8Array([
    ...validJpeg.slice(0, 2),
    0xff, marker, 0x00, 0x02,
    ...validJpeg.slice(2),
  ]);
}

describe('inspectJpeg', () => {
  it('returns bounded dimensions from a structurally complete canonical JPEG', () => {
    expect(inspectJpeg(validJpeg)).toEqual({ width: 1, height: 1 });
  });

  it.each([
    ['APP1 EXIF', withSegment(0xe1)],
    ['APP13 IPTC', withSegment(0xed)],
    ['COM', withSegment(0xfe)],
  ])('rejects %s metadata segments', (_name, bytes) => {
    expect(() => inspectJpeg(bytes)).toThrow('jpeg_metadata_not_allowed');
  });

  it('rejects a truncated scan instead of accepting the JPEG prefix', () => {
    expect(() => inspectJpeg(validJpeg.slice(0, -2))).toThrow('invalid_jpeg');
  });

  it('rejects non-JPEG magic bytes', () => {
    expect(() => inspectJpeg(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toThrow('invalid_jpeg');
  });
});
