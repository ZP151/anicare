export const MAX_JPEG_DIMENSION = 2048;

export type JpegDimensions = Readonly<{ width: number; height: number }>;

type Frame = Readonly<{
  dimensions: JpegDimensions;
  components: ReadonlyMap<number, FrameComponent>;
}>;

type FrameComponent = Readonly<{
  horizontalSampling: number;
  verticalSampling: number;
  quantizationTable: number;
}>;

type HuffmanTable = ReadonlyArray<ReadonlyMap<number, number>>;

type ScanComponent = Readonly<{
  frame: FrameComponent;
  dcTable: HuffmanTable;
  acTable: HuffmanTable;
}>;

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

function validateJfif(bytes: Uint8Array, dataStart: number, end: number): void {
  // Minimal JFIF has exactly 14 data bytes: identifier, version, density and
  // a zero-sized thumbnail. Any additional bytes could conceal source data.
  if (end - dataStart !== 14 ||
      bytes[dataStart] !== 0x4a || bytes[dataStart + 1] !== 0x46 ||
      bytes[dataStart + 2] !== 0x49 || bytes[dataStart + 3] !== 0x46 ||
      bytes[dataStart + 4] !== 0x00 || bytes[dataStart + 5] !== 0x01 ||
      ![0x01, 0x02].includes(bytes[dataStart + 6]!) ||
      ![0x00, 0x01, 0x02].includes(bytes[dataStart + 7]!) ||
      readUint16(bytes, dataStart + 8) === 0 || readUint16(bytes, dataStart + 10) === 0 ||
      bytes[dataStart + 12] !== 0 || bytes[dataStart + 13] !== 0) {
    metadataNotAllowed();
  }
}

function parseFrame(bytes: Uint8Array, dataStart: number, end: number): Frame {
  if (end - dataStart !== 15 || bytes[dataStart] !== 8) invalidJpeg();
  const height = readUint16(bytes, dataStart + 1);
  const width = readUint16(bytes, dataStart + 3);
  const componentCount = bytes[dataStart + 5]!;
  if (componentCount !== 3 || height === 0 || width === 0 ||
      width > MAX_JPEG_DIMENSION || height > MAX_JPEG_DIMENSION) invalidJpeg();

  const components = new Map<number, FrameComponent>();
  for (let index = dataStart + 6; index < end; index += 3) {
    const id = bytes[index]!;
    const sampling = bytes[index + 1]!;
    const horizontal = sampling >> 4;
    const vertical = sampling & 0x0f;
    const quantizationTable = bytes[index + 2]!;
    if (![1, 2, 3].includes(id) || components.has(id) ||
        horizontal < 1 || horizontal > 4 || vertical < 1 || vertical > 4 ||
        quantizationTable > 3) invalidJpeg();
    components.set(id, { horizontalSampling: horizontal, verticalSampling: vertical, quantizationTable });
  }
  if (components.size !== 3 || !components.has(1) || !components.has(2) || !components.has(3)) invalidJpeg();
  return { dimensions: { width, height }, components };
}

function validateQuantizationTables(bytes: Uint8Array, dataStart: number, end: number, tables: Set<number>): void {
  let offset = dataStart;
  while (offset < end) {
    const precisionAndId = bytes[offset++]!;
    const precision = precisionAndId >> 4;
    const id = precisionAndId & 0x0f;
    if (precision !== 0 || id > 3 || tables.has(id) || offset + 64 > end) invalidJpeg();
    for (let index = 0; index < 64; index += 1) {
      if (bytes[offset + index] === 0) invalidJpeg();
    }
    tables.add(id);
    offset += 64;
  }
  if (offset !== end || tables.size === 0) invalidJpeg();
}

function validateHuffmanTables(bytes: Uint8Array, dataStart: number, end: number, tables: Map<string, HuffmanTable>): void {
  let offset = dataStart;
  while (offset < end) {
    const tableClassAndId = bytes[offset++]!;
    const tableClass = tableClassAndId >> 4;
    const id = tableClassAndId & 0x0f;
    const key = `${tableClass}:${id}`;
    if (tableClass > 1 || id > 3 || offset + 16 > end || tables.has(key)) invalidJpeg();
    let symbols = 0;
    let remainingCodeSpace = 1;
    for (let index = 0; index < 16; index += 1) {
      const count = bytes[offset + index]!;
      symbols += count;
      remainingCodeSpace = (remainingCodeSpace * 2) - count;
      if (remainingCodeSpace < 0) invalidJpeg();
    }
    if (symbols === 0 || symbols > 256 || remainingCodeSpace === 0 || offset + 16 + symbols > end) invalidJpeg();
    const seenSymbols = new Set<number>();
    const codesByLength: Array<Map<number, number>> = Array.from({ length: 16 }, () => new Map<number, number>());
    let code = 0;
    let symbolOffset = 0;
    for (let index = 0; index < symbols; index += 1) {
      const symbol = bytes[offset + 16 + index]!;
      const acSize = symbol & 0x0f;
      const validBaselineSymbol = tableClass === 0
        ? symbol <= 11
        : symbol === 0x00 || symbol === 0xf0 || acSize >= 1 && acSize <= 10;
      if (seenSymbols.has(symbol) || !validBaselineSymbol) invalidJpeg();
      seenSymbols.add(symbol);
    }
    for (let lengthIndex = 0; lengthIndex < 16; lengthIndex += 1) {
      const count = bytes[offset + lengthIndex]!;
      const codes = codesByLength[lengthIndex]!;
      for (let index = 0; index < count; index += 1) {
        codes.set(code++, bytes[offset + 16 + symbolOffset++]!);
      }
      code *= 2;
    }
    if (symbolOffset !== symbols) invalidJpeg();
    tables.set(key, codesByLength);
    offset += 16 + symbols;
  }
  if (offset !== end || tables.size === 0) invalidJpeg();
}

function validateScanHeader(
  bytes: Uint8Array,
  dataStart: number,
  end: number,
  frame: Frame,
  quantizationTables: ReadonlySet<number>,
  huffmanTables: ReadonlyMap<string, HuffmanTable>,
): ReadonlyArray<ScanComponent> {
  const componentCount = bytes[dataStart]!;
  if (componentCount !== 3 || end - dataStart !== 10) invalidJpeg();
  for (const component of frame.components.values()) {
    if (!quantizationTables.has(component.quantizationTable)) invalidJpeg();
  }

  const seenComponents = new Set<number>();
  const scanComponents: ScanComponent[] = [];
  let offset = dataStart + 1;
  for (let index = 0; index < componentCount; index += 1) {
    const id = bytes[offset++]!;
    const tableSelectors = bytes[offset++]!;
    const dc = tableSelectors >> 4;
    const ac = tableSelectors & 0x0f;
    const frameComponent = frame.components.get(id);
    const dcTable = huffmanTables.get(`0:${dc}`);
    const acTable = huffmanTables.get(`1:${ac}`);
    if (!frame.components.has(id) || seenComponents.has(id) || dc > 3 || ac > 3 ||
        !frameComponent || !dcTable || !acTable) invalidJpeg();
    seenComponents.add(id);
    scanComponents.push({ frame: frameComponent, dcTable, acTable });
  }
  if (seenComponents.size !== frame.components.size ||
      bytes[offset] !== 0 || bytes[offset + 1] !== 63 || bytes[offset + 2] !== 0) invalidJpeg();
  return scanComponents;
}

class EntropyReader {
  private offset: number;
  private currentByte = 0;
  private bitsRemaining = 0;

  constructor(private readonly bytes: Uint8Array, offset: number) {
    this.offset = offset;
  }

  readBit(): number {
    if (this.bitsRemaining === 0) {
      if (this.offset >= this.bytes.byteLength) invalidJpeg();
      this.currentByte = this.bytes[this.offset++]!;
      if (this.currentByte === 0xff) {
        if (this.offset >= this.bytes.byteLength || this.bytes[this.offset++] !== 0x00) invalidJpeg();
      }
      this.bitsRemaining = 8;
    }
    this.bitsRemaining -= 1;
    return (this.currentByte >> this.bitsRemaining) & 1;
  }

  readBits(count: number): void {
    for (let index = 0; index < count; index += 1) this.readBit();
  }

  consumeMarker(marker: number): void {
    if (this.bitsRemaining > 0) {
      const paddingMask = (1 << this.bitsRemaining) - 1;
      if ((this.currentByte & paddingMask) !== paddingMask) invalidJpeg();
      this.bitsRemaining = 0;
    }
    if (this.offset + 1 >= this.bytes.byteLength ||
        this.bytes[this.offset++] !== 0xff || this.bytes[this.offset++] !== marker) invalidJpeg();
  }

  atEnd(): boolean {
    return this.offset === this.bytes.byteLength;
  }
}

function decodeHuffmanSymbol(reader: EntropyReader, table: HuffmanTable): number {
  let code = 0;
  for (let lengthIndex = 0; lengthIndex < 16; lengthIndex += 1) {
    code = (code * 2) + reader.readBit();
    const symbol = table[lengthIndex]!.get(code);
    if (symbol !== undefined) return symbol;
  }
  return invalidJpeg();
}

function consumeBlock(reader: EntropyReader, component: ScanComponent): void {
  const dcCategory = decodeHuffmanSymbol(reader, component.dcTable);
  reader.readBits(dcCategory);

  let coefficient = 1;
  while (coefficient < 64) {
    const runAndSize = decodeHuffmanSymbol(reader, component.acTable);
    if (runAndSize === 0x00) return;
    if (runAndSize === 0xf0) {
      coefficient += 16;
      if (coefficient > 64) invalidJpeg();
      continue;
    }
    coefficient += runAndSize >> 4;
    if (coefficient >= 64) invalidJpeg();
    reader.readBits(runAndSize & 0x0f);
    coefficient += 1;
  }
}

function consumeBaselineScan(
  bytes: Uint8Array,
  offset: number,
  frame: Frame,
  scanComponents: ReadonlyArray<ScanComponent>,
  restartInterval: number | null,
): void {
  let maximumHorizontalSampling = 0;
  let maximumVerticalSampling = 0;
  let blocksPerMcu = 0;
  for (const component of frame.components.values()) {
    maximumHorizontalSampling = Math.max(maximumHorizontalSampling, component.horizontalSampling);
    maximumVerticalSampling = Math.max(maximumVerticalSampling, component.verticalSampling);
    blocksPerMcu += component.horizontalSampling * component.verticalSampling;
  }
  if (maximumHorizontalSampling === 0 || maximumVerticalSampling === 0 || blocksPerMcu > 10) invalidJpeg();

  const columns = Math.ceil(frame.dimensions.width / (8 * maximumHorizontalSampling));
  const rows = Math.ceil(frame.dimensions.height / (8 * maximumVerticalSampling));
  const totalMcus = columns * rows;
  const reader = new EntropyReader(bytes, offset);
  let expectedRestart = 0;

  for (let mcu = 0; mcu < totalMcus; mcu += 1) {
    for (const component of scanComponents) {
      const blockCount = component.frame.horizontalSampling * component.frame.verticalSampling;
      for (let block = 0; block < blockCount; block += 1) consumeBlock(reader, component);
    }
    const completedMcus = mcu + 1;
    if (restartInterval !== null && completedMcus < totalMcus && completedMcus % restartInterval === 0) {
      reader.consumeMarker(0xd0 + expectedRestart);
      expectedRestart = (expectedRestart + 1) % 8;
    }
  }

  reader.consumeMarker(0xd9);
  if (!reader.atEnd()) invalidJpeg();
}

/**
 * Accept only the canonical reviewed-artifact profile: one minimal JFIF APP0,
 * a single baseline SOF0/SOS scan, referenced 8-bit DQT/DHT tables, and an
 * exact entropy stream ending in EOI. This intentionally excludes all
 * metadata-bearing APP markers, comments, progressive streams and trailing
 * bytes rather than attempting metadata stripping in a trust boundary.
 */
export function inspectJpeg(bytes: Uint8Array): JpegDimensions {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) invalidJpeg();

  let offset = 2;
  let sawJfif = false;
  let frame: Frame | null = null;
  let restartInterval: number | null = null;
  const quantizationTables = new Set<number>();
  const huffmanTables = new Map<string, HuffmanTable>();

  while (offset < bytes.byteLength) {
    if (bytes[offset] !== 0xff) invalidJpeg();
    while (offset < bytes.byteLength && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.byteLength) invalidJpeg();
    const marker = bytes[offset++]!;
    if (marker === 0x00 || marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) invalidJpeg();
    if (marker === 0xe1 || marker === 0xed || marker === 0xfe || (marker >= 0xe2 && marker <= 0xef)) metadataNotAllowed();

    const segment = readSegment(bytes, offset);
    offset = segment.end;
    if (marker === 0xe0) {
      if (sawJfif || frame !== null || quantizationTables.size !== 0 || huffmanTables.size !== 0) metadataNotAllowed();
      validateJfif(bytes, segment.dataStart, segment.end);
      sawJfif = true;
      continue;
    }
    if (marker === 0xc0) {
      if (!sawJfif || frame !== null) invalidJpeg();
      frame = parseFrame(bytes, segment.dataStart, segment.end);
      continue;
    }
    if (marker === 0xdb) {
      if (!sawJfif) invalidJpeg();
      validateQuantizationTables(bytes, segment.dataStart, segment.end, quantizationTables);
      continue;
    }
    if (marker === 0xc4) {
      if (!sawJfif) invalidJpeg();
      validateHuffmanTables(bytes, segment.dataStart, segment.end, huffmanTables);
      continue;
    }
    if (marker === 0xdd) {
      if (restartInterval !== null || segment.end - segment.dataStart !== 2) invalidJpeg();
      restartInterval = readUint16(bytes, segment.dataStart);
      if (restartInterval === 0) invalidJpeg();
      continue;
    }
    if (marker === 0xda) {
      if (!sawJfif || !frame) invalidJpeg();
      const scanComponents = validateScanHeader(bytes, segment.dataStart, segment.end, frame, quantizationTables, huffmanTables);
      try {
        consumeBaselineScan(bytes, segment.end, frame, scanComponents, restartInterval);
      } catch {
        invalidJpeg();
      }
      return frame.dimensions;
    }
    invalidJpeg();
  }
  invalidJpeg();
}
