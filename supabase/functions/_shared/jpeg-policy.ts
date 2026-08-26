export const MAX_JPEG_DIMENSION = 2048;

export type JpegDimensions = Readonly<{ width: number; height: number }>;

function invalidJpeg(): never {
  throw new Error('invalid_jpeg');
}

function metadataNotAllowed(): never {
  throw new Error('jpeg_metadata_not_allowed');
}

function readUint16(bytes: Uint8Array, offset: number): number {
  if (offset + 1 >= bytes.byteLength) invalidJpeg();
  return (bytes[offset]! << 8) | bytes[offset + 1]!;
}

function readSegment(bytes: Uint8Array, offset: number): Readonly<{ dataStart: number; end: number }> {
  const length = readUint16(bytes, offset);
  if (length < 2) invalidJpeg();
  const dataStart = offset + 2;
  const end = dataStart + length - 2;
  if (end > bytes.byteLength) invalidJpeg();
  return { dataStart, end };
}

function isStartOfFrame(marker: number): boolean {
  return marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
}

function parseFrame(bytes: Uint8Array, dataStart: number, end: number): Readonly<{ dimensions: JpegDimensions; components: readonly number[] }> {
  if (end - dataStart < 6 || bytes[dataStart] !== 8) invalidJpeg();
  const height = readUint16(bytes, dataStart + 1);
  const width = readUint16(bytes, dataStart + 3);
  const componentCount = bytes[dataStart + 5]!;
  if ((componentCount !== 1 && componentCount !== 3) || height === 0 || width === 0 ||
      width > MAX_JPEG_DIMENSION || height > MAX_JPEG_DIMENSION ||
      end - dataStart !== 6 + (componentCount * 3)) {
    invalidJpeg();
  }

  const components: number[] = [];
  for (let index = dataStart + 6; index < end; index += 3) {
    const id = bytes[index]!;
    const sampling = bytes[index + 1]!;
    if (id === 0 || components.includes(id) || sampling === 0) invalidJpeg();
    components.push(id);
  }
  return { dimensions: { width, height }, components };
}

function validateQuantizationTables(bytes: Uint8Array, dataStart: number, end: number): void {
  let offset = dataStart;
  while (offset < end) {
    const precisionAndId = bytes[offset++]!;
    const precision = precisionAndId >> 4;
    if (precision > 1 || (precisionAndId & 0x0f) > 3) invalidJpeg();
    const tableBytes = precision === 0 ? 64 : 128;
    if (offset + tableBytes > end) invalidJpeg();
    offset += tableBytes;
  }
  if (offset !== end) invalidJpeg();
}

function validateHuffmanTables(bytes: Uint8Array, dataStart: number, end: number): void {
  let offset = dataStart;
  while (offset < end) {
    const tableClassAndId = bytes[offset++]!;
    if ((tableClassAndId >> 4) > 1 || (tableClassAndId & 0x0f) > 3 || offset + 16 > end) invalidJpeg();
    let symbols = 0;
    for (let index = 0; index < 16; index += 1) symbols += bytes[offset + index]!;
    if (symbols === 0 || symbols > 256 || offset + 16 + symbols > end) invalidJpeg();
    offset += 16 + symbols;
  }
  if (offset !== end) invalidJpeg();
}

function parseScanHeader(
  bytes: Uint8Array,
  dataStart: number,
  end: number,
  components: readonly number[],
): void {
  if (dataStart >= end) invalidJpeg();
  const componentCount = bytes[dataStart]!;
  if (componentCount !== components.length || end - dataStart !== 4 + (componentCount * 2)) invalidJpeg();
  const seen = new Set<number>();
  let offset = dataStart + 1;
  for (let index = 0; index < componentCount; index += 1) {
    const id = bytes[offset++]!;
    const tableSelectors = bytes[offset++]!;
    if (!components.includes(id) || seen.has(id) || (tableSelectors >> 4) > 1 || (tableSelectors & 0x0f) > 1) invalidJpeg();
    seen.add(id);
  }
  if (bytes[offset] !== 0 || bytes[offset + 1] !== 63 || bytes[offset + 2] !== 0) invalidJpeg();
}

function inspectEntropy(bytes: Uint8Array, offset: number, dimensions: JpegDimensions): JpegDimensions {
  let sawEntropy = false;
  while (offset < bytes.byteLength) {
    const current = bytes[offset++]!;
    if (current !== 0xff) {
      sawEntropy = true;
      continue;
    }
    if (offset >= bytes.byteLength) invalidJpeg();
    const marker = bytes[offset++]!;
    if (marker === 0x00) {
      sawEntropy = true;
      continue;
    }
    if (marker >= 0xd0 && marker <= 0xd7) {
      if (!sawEntropy) invalidJpeg();
      continue;
    }
    if (marker === 0xd9 && sawEntropy && offset === bytes.byteLength) return dimensions;
    invalidJpeg();
  }
  invalidJpeg();
}

/**
 * Accepts only canonical baseline JPEG marker streams. It intentionally
 * rejects metadata-capable APP markers (except APP0/JFIF), comments, multiple
 * scans, progressive JPEGs, and any bytes after EOI.
 */
export function inspectJpeg(bytes: Uint8Array): JpegDimensions {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) invalidJpeg();

  let offset = 2;
  let frame: Readonly<{ dimensions: JpegDimensions; components: readonly number[] }> | null = null;
  while (offset < bytes.byteLength) {
    if (bytes[offset] !== 0xff) invalidJpeg();
    while (offset < bytes.byteLength && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.byteLength) invalidJpeg();
    const marker = bytes[offset++]!;
    if (marker === 0x00 || marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      invalidJpeg();
    }
    if (marker === 0xe1 || marker === 0xed || marker === 0xfe || (marker >= 0xe2 && marker <= 0xef)) metadataNotAllowed();

    const segment = readSegment(bytes, offset);
    offset = segment.end;
    if (marker === 0xe0) continue;
    if (isStartOfFrame(marker)) {
      if (marker !== 0xc0 || frame !== null) invalidJpeg();
      frame = parseFrame(bytes, segment.dataStart, segment.end);
      continue;
    }
    if (marker === 0xdb) {
      validateQuantizationTables(bytes, segment.dataStart, segment.end);
      continue;
    }
    if (marker === 0xc4) {
      validateHuffmanTables(bytes, segment.dataStart, segment.end);
      continue;
    }
    if (marker === 0xdd) {
      if (segment.end - segment.dataStart !== 2) invalidJpeg();
      continue;
    }
    if (marker === 0xda) {
      if (!frame) invalidJpeg();
      parseScanHeader(bytes, segment.dataStart, segment.end, frame.components);
      return inspectEntropy(bytes, segment.end, frame.dimensions);
    }
    invalidJpeg();
  }
  invalidJpeg();
}
