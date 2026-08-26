jest.mock('@shopify/react-native-skia', () => ({ ImageFormat: { JPEG: 3 }, Skia: {} }));

import { assertMetadataFreeJpeg, targetDimensions } from './processor.native';

function decodeBase64(value: string): Uint8Array {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const output: number[] = [];
  let bits = 0;
  let bitCount = 0;
  for (const character of value) {
    if (character === '=') break;
    const digit = alphabet.indexOf(character);
    if (digit < 0) continue;
    bits = (bits << 6) | digit;
    bitCount += 6;
    if (bitCount >= 8) {
      bitCount -= 8;
      output.push((bits >> bitCount) & 0xff);
    }
  }
  return new Uint8Array(output);
}

const SYNTHETIC_ONE_PIXEL_JPEG = decodeBase64(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD8qqKKKAP/2Q==',
);

const STRUCTURAL_SOS = [0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00];
const STRUCTURAL_FRAME = [0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01, 0x11, 0x00];

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
      ...STRUCTURAL_FRAME,
      ...STRUCTURAL_SOS,
      0x12,
      0xff, 0xe1, 0x00, 0x02,
      0xff, 0xd9,
    ]);
    expect(() => assertMetadataFreeJpeg(bytes)).toThrow('unsafe_jpeg_metadata');
  });

  it('accepts a decoder-valid synthetic JPEG without EXIF, IPTC or comments', () => {
    expect(() => assertMetadataFreeJpeg(SYNTHETIC_ONE_PIXEL_JPEG)).not.toThrow();
  });

  it.each([
    ['empty entropy scan', [0xff, 0xd8, ...STRUCTURAL_FRAME, ...STRUCTURAL_SOS, 0xff, 0xd9]],
    ['restart marker before entropy', [0xff, 0xd8, 0xff, 0xd0, ...STRUCTURAL_FRAME, ...STRUCTURAL_SOS, 0x01, 0xff, 0xd9]],
    ['nested SOI', [0xff, 0xd8, 0xff, 0xd8, ...STRUCTURAL_FRAME, ...STRUCTURAL_SOS, 0x01, 0xff, 0xd9]],
    ['short SOS header', [0xff, 0xd8, ...STRUCTURAL_FRAME, 0xff, 0xda, 0x00, 0x02, 0xff, 0xd9]],
    ['invalid SOS approximation bits', [0xff, 0xd8, ...STRUCTURAL_FRAME, ...STRUCTURAL_SOS.slice(0, -1), 0xee, 0x01, 0xff, 0xd9]],
    ['marker immediately after SOS', [0xff, 0xd8, ...STRUCTURAL_FRAME, ...STRUCTURAL_SOS, 0xff, 0xdb, 0x00, 0x02, 0xff, 0xd9]],
    ['trailing bytes after EOI', [0xff, 0xd8, ...STRUCTURAL_FRAME, ...STRUCTURAL_SOS, 0x01, 0xff, 0xd9, 0x00]],
    ['repeated EOI', [0xff, 0xd8, ...STRUCTURAL_FRAME, ...STRUCTURAL_SOS, 0x01, 0xff, 0xd9, 0xff, 0xd9]],
  ])('rejects structurally invalid JPEG: %s', (_name, values) => {
    expect(() => assertMetadataFreeJpeg(new Uint8Array(values as number[]))).toThrow('invalid_rendered_jpeg');
  });

  it('handles byte stuffing and permits restart markers only after real entropy', () => {
    const bytes = new Uint8Array([
      0xff, 0xd8, ...STRUCTURAL_FRAME, ...STRUCTURAL_SOS,
      0x11, 0xff, 0x00, 0x22, 0xff, 0xd0, 0x33,
      0xff, 0xd9,
    ]);
    expect(() => assertMetadataFreeJpeg(bytes)).not.toThrow();
  });

  it('rejects non-JPEG and truncated output', () => {
    expect(() => assertMetadataFreeJpeg(new Uint8Array([1, 2, 3]))).toThrow('invalid_rendered_jpeg');
    expect(() => assertMetadataFreeJpeg(new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 0x00]))).toThrow('invalid_rendered_jpeg');
  });
});
