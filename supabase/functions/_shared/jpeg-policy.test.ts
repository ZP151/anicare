import { describe, expect, it } from 'vitest';

import { inspectJpeg } from './jpeg-policy.js';

// A decoder-valid, synthetic 1x1 baseline JFIF JPEG. The old hand-written
// marker stream was deliberately not used here: parser tests must start from
// an image an ordinary JPEG decoder accepts.
const decoderValidJpeg = Uint8Array.from(atob(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD8qqKKKAP/2Q=='
), (character) => character.charCodeAt(0));

const decoderValidWideJpeg = Uint8Array.from(atob(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAAJABEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD8+qKKK+oPnAooooA//9k='
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

function replaceScanEntropy(bytes: Uint8Array, entropy: readonly number[]): Uint8Array {
  const sos = markerOffset(bytes, 0xda);
  const scanHeaderLength = (bytes[sos + 2]! << 8) | bytes[sos + 3]!;
  const entropyStart = sos + 2 + scanHeaderLength;
  return new Uint8Array([...bytes.slice(0, entropyStart), ...entropy, 0xff, 0xd9]);
}

function huffmanDefinition(bytes: Uint8Array, tableClass: number, tableId: number): Readonly<{
  countsOffset: number;
  symbolsOffset: number;
}> {
  let offset = 2;
  while (offset + 3 < bytes.byteLength) {
    if (bytes[offset] !== 0xff) throw new Error('expected marker');
    const marker = bytes[offset + 1]!;
    if (marker === 0xda) break;
    const length = (bytes[offset + 2]! << 8) | bytes[offset + 3]!;
    const dataStart = offset + 4;
    const end = offset + 2 + length;
    if (marker === 0xc4) {
      let tableOffset = dataStart;
      while (tableOffset < end) {
        const header = bytes[tableOffset++]!;
        const countsOffset = tableOffset;
        let symbolCount = 0;
        for (let index = 0; index < 16; index += 1) symbolCount += bytes[tableOffset + index]!;
        const symbolsOffset = tableOffset + 16;
        if (header >> 4 === tableClass && (header & 0x0f) === tableId) return { countsOffset, symbolsOffset };
        tableOffset = symbolsOffset + symbolCount;
      }
    }
    offset = end;
  }
  throw new Error(`Huffman table ${tableClass}:${tableId} was not found`);
}

function withCompleteTwoSymbolHuffmanTables(bytes: Uint8Array): Uint8Array {
  let withoutHuffmanTables = bytes;
  for (let index = 0; index < 4; index += 1) withoutHuffmanTables = removeSegment(withoutHuffmanTables, 0xc4);
  const counts = [2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  const tableData = [
    0x00, ...counts, 0x00, 0x01,
    0x10, ...counts, 0x00, 0x01,
    0x01, ...counts, 0x00, 0x01,
    0x11, ...counts, 0x00, 0x01,
  ];
  const length = tableData.length + 2;
  const segment = [0xff, 0xc4, length >> 8, length & 0xff, ...tableData];
  return insert(withoutHuffmanTables, markerOffset(withoutHuffmanTables, 0xda), segment);
}

describe('inspectJpeg', () => {
  it.each([
    ['1x1', decoderValidJpeg, { width: 1, height: 1 }],
    ['17x9', decoderValidWideJpeg, { width: 17, height: 9 }],
  ])('returns bounded dimensions from a decoder-valid canonical %s baseline JFIF JPEG', (_name, bytes, dimensions) => {
    expect(inspectJpeg(bytes)).toEqual(dimensions);
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

  it.each([
    ['an oversubscribed Huffman code space', (() => {
      const definition = huffmanDefinition(decoderValidJpeg, 0, 0);
      const copy = decoderValidJpeg.slice();
      copy[definition.countsOffset] = 3;
      copy[definition.countsOffset + 2] = 2;
      return copy;
    })()],
    ['a DC category outside the baseline 0..11 range', (() => {
      const definition = huffmanDefinition(decoderValidJpeg, 0, 0);
      return replaceAt(decoderValidJpeg, definition.symbolsOffset, 12);
    })()],
    ['an AC run/size outside the baseline range', (() => {
      const definition = huffmanDefinition(decoderValidJpeg, 1, 0);
      return replaceAt(decoderValidJpeg, definition.symbolsOffset, 0xfb);
    })()],
    ['a Huffman table that assigns the all-ones code reserved for padding', (() => {
      const completeTables = withCompleteTwoSymbolHuffmanTables(decoderValidJpeg);
      return replaceScanEntropy(completeTables, [0x00, 0x0f]);
    })()],
  ])('rejects %s', (_name, bytes) => {
    expect(() => inspectJpeg(bytes)).toThrow('invalid_jpeg');
  });

  it('rejects a truncated scan instead of accepting the JPEG prefix', () => {
    expect(() => inspectJpeg(decoderValidJpeg.slice(0, -2))).toThrow('invalid_jpeg');
  });

  it('rejects a valid-marker JPEG whose scan is one premature zero entropy byte', () => {
    const prematureEntropyJpeg = replaceScanEntropy(decoderValidJpeg, [0x00]);

    expect(() => inspectJpeg(prematureEntropyJpeg)).toThrow('invalid_jpeg');
  });

  it('rejects SOF dimensions whose MCU workload does not match the scan', () => {
    const sof = markerOffset(decoderValidJpeg, 0xc0);
    const dimensionsWithoutEnoughEntropy = replaceAt(decoderValidJpeg, sof + 8, 17);

    expect(() => inspectJpeg(dimensionsWithoutEnoughEntropy)).toThrow('invalid_jpeg');
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
