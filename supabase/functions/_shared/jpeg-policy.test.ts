import { describe, expect, it } from 'vitest';

import { inspectJpeg } from './jpeg-policy.js';

// A decoder-valid, synthetic 1x1 baseline JFIF JPEG. The old hand-written
// marker stream was deliberately not used here: parser tests must start from
// an image an ordinary JPEG decoder accepts.
const decoderValidJpeg = Uint8Array.from(atob(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD8qqKKKAP/2Q=='
), (character) => character.charCodeAt(0));

function markerOffset(bytes: Uint8Array, marker: number): number {
  for (let offset = 2; offset + 1 < bytes.byteLength; offset += 1) {
    if (bytes[offset] === 0xff && bytes[offset + 1] === marker) return offset;
  }
  throw new Error(`marker ${marker.toString(16)} was not found`);
}

function insert(bytes: Uint8Array, offset: number, segment: readonly number[]): Uint8Array {
  return new Uint8Array([...bytes.slice(0, offset), ...segment, ...bytes.slice(offset)]);
}

function removeSegment(bytes: Uint8Array, marker: number): Uint8Array {
  const offset = markerOffset(bytes, marker);
  const length = (bytes[offset + 2]! << 8) | bytes[offset + 3]!;
  return new Uint8Array([...bytes.slice(0, offset), ...bytes.slice(offset + 2 + length)]);
}

function replaceAt(bytes: Uint8Array, offset: number, value: number): Uint8Array {
  const copy = bytes.slice();
  copy[offset] = value;
  return copy;
}

function duplicateJfif(bytes: Uint8Array): Uint8Array {
  const length = (bytes[4]! << 8) | bytes[5]!;
  return insert(bytes, 2 + 2 + length, [...bytes.slice(2, 2 + 2 + length)]);
}

describe('inspectJpeg', () => {
  it('returns bounded dimensions from a decoder-valid canonical baseline JFIF JPEG', () => {
    expect(inspectJpeg(decoderValidJpeg)).toEqual({ width: 1, height: 1 });
  });

  it.each([
    ['APP1 EXIF', [0xff, 0xe1, 0x00, 0x02]],
    ['APP13 IPTC', [0xff, 0xed, 0x00, 0x02]],
    ['COM', [0xff, 0xfe, 0x00, 0x02]],
    ['arbitrary APP0/AHM1 payload', [0xff, 0xe0, 0x00, 0x06, 0x41, 0x48, 0x4d, 0x31]],
  ])('rejects %s metadata segments', (_name, segment) => {
    expect(() => inspectJpeg(insert(decoderValidJpeg, 2, segment))).toThrow('jpeg_metadata_not_allowed');
  });

  it('rejects a duplicate minimal JFIF APP0 instead of treating it as harmless metadata', () => {
    expect(() => inspectJpeg(duplicateJfif(decoderValidJpeg))).toThrow('jpeg_metadata_not_allowed');
  });

  it.each([
    ['invalid sampling nibbles', (() => {
      const sof = markerOffset(decoderValidJpeg, 0xc0);
      return replaceAt(decoderValidJpeg, sof + 11, 0xf1);
    })()],
    ['invalid quantization selector', (() => {
      const sof = markerOffset(decoderValidJpeg, 0xc0);
      return replaceAt(decoderValidJpeg, sof + 12, 4);
    })()],
    ['missing DQT', removeSegment(decoderValidJpeg, 0xdb)],
    ['missing DHT', removeSegment(decoderValidJpeg, 0xc4)],
    ['invalid SOS table selector', (() => {
      const sos = markerOffset(decoderValidJpeg, 0xda);
      return replaceAt(decoderValidJpeg, sos + 6, 0x44);
    })()],
  ])('rejects %s', (_name, bytes) => {
    expect(() => inspectJpeg(bytes)).toThrow('invalid_jpeg');
  });

  it('rejects a truncated scan instead of accepting the JPEG prefix', () => {
    expect(() => inspectJpeg(decoderValidJpeg.slice(0, -2))).toThrow('invalid_jpeg');
  });

  it.each([
    ['an unannounced restart marker', insert(decoderValidJpeg, decoderValidJpeg.byteLength - 2, [0xff, 0xd0])],
    ['bytes after EOI', new Uint8Array([...decoderValidJpeg, 0x00])],
  ])('rejects %s in the entropy/EOI boundary', (_name, bytes) => {
    expect(() => inspectJpeg(bytes)).toThrow('invalid_jpeg');
  });

  it('rejects non-JPEG magic bytes', () => {
    expect(() => inspectJpeg(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toThrow('invalid_jpeg');
  });
});
