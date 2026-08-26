jest.mock('@shopify/react-native-skia', () => ({ ImageFormat: { JPEG: 3 }, Skia: {} }));

import { assertMetadataFreeJpeg, targetDimensions } from './processor.native';

describe('native canonical rendering policy', () => {
  it('downscales the longest edge to 2048 without upscaling', () => {
    expect(targetDimensions(4096, 1024)).toEqual({ width: 2048, height: 512 });
    expect(targetDimensions(800, 600)).toEqual({ width: 800, height: 600 });
  });

  it.each([0xe1, 0xed, 0xfe])('rejects JPEG marker 0x%s that can carry selected-source metadata', (marker) => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, marker, 0x00, 0x02, 0xff, 0xd9]);
    expect(() => assertMetadataFreeJpeg(bytes)).toThrow('unsafe_jpeg_metadata');
  });

  it('rejects metadata markers found after scan data', () => {
    const bytes = new Uint8Array([
      0xff, 0xd8,
      0xff, 0xda, 0x00, 0x02,
      0x12, 0x34,
      0xff, 0xe1, 0x00, 0x02,
      0xff, 0xd9,
    ]);
    expect(() => assertMetadataFreeJpeg(bytes)).toThrow('unsafe_jpeg_metadata');
  });

  it('accepts a complete JPEG without EXIF, IPTC or comments', () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x02, 0xff, 0xda, 0x00, 0x02, 0xff, 0xd9]);
    expect(() => assertMetadataFreeJpeg(bytes)).not.toThrow();
  });

  it('rejects non-JPEG and truncated output', () => {
    expect(() => assertMetadataFreeJpeg(new Uint8Array([1, 2, 3]))).toThrow('invalid_rendered_jpeg');
    expect(() => assertMetadataFreeJpeg(new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 0x00]))).toThrow('invalid_rendered_jpeg');
  });
});
