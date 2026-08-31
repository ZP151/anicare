import { ImageFormat, Skia } from '@shopify/react-native-skia';
import * as Crypto from 'expo-crypto';
import { File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import type { PrivacyMask, RenderedMedia } from './contracts';
import {
  CANONICAL_RECIPE,
  inspectRenderedWithAdapter,
  prepareCanonicalWithAdapter,
  renderOpaqueMasksWithAdapter,
  type MediaProcessorAdapter,
} from './processor-core';

export { CANONICAL_RECIPE } from './processor-core';

const DETECTOR_VERSIONS = Object.freeze({
  cats: 'unavailable',
  people: 'unavailable',
  plates: 'unavailable',
});

export function targetDimensions(width: number, height: number): { width: number; height: number } {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error('invalid_source_dimensions');
  }
  const longest = Math.max(width, height);
  if (longest <= CANONICAL_RECIPE.maxLongestEdge) return { width: Math.round(width), height: Math.round(height) };
  const scale = CANONICAL_RECIPE.maxLongestEdge / longest;
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

export function assertMetadataFreeJpeg(bytes: Uint8Array): void {
  const invalid = () => { throw new Error('invalid_rendered_jpeg'); };
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) invalid();

  const frameComponents = new Set<number>();
  let offset = 2;
  let sawFrame = false;
  let sawScan = false;

  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) invalid();
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.length) invalid();
    const marker = bytes[offset++];

    if (marker === 0x00 || marker === 0x01 || marker === 0xd8 || marker === 0xd9 ||
        (marker >= 0xd0 && marker <= 0xd7)) invalid();
    if (marker === 0xe1 || marker === 0xed || marker === 0xfe) throw new Error('unsafe_jpeg_metadata');
    if (offset + 1 >= bytes.length) invalid();
    const segmentLength = (bytes[offset] << 8) | bytes[offset + 1];
    if (segmentLength < 2 || offset + segmentLength > bytes.length) invalid();

    const isStartOfFrame = (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf);
    if (isStartOfFrame) {
      if (sawFrame || segmentLength < 11) invalid();
      const height = (bytes[offset + 3] << 8) | bytes[offset + 4];
      const width = (bytes[offset + 5] << 8) | bytes[offset + 6];
      const componentCount = bytes[offset + 7];
      if (width === 0 || height === 0 || componentCount < 1 || componentCount > 4 ||
          segmentLength !== 8 + componentCount * 3) invalid();
      for (let component = 0; component < componentCount; component += 1) {
        const componentOffset = offset + 8 + component * 3;
        const id = bytes[componentOffset];
        const sampling = bytes[componentOffset + 1];
        if (id === 0 || frameComponents.has(id) || (sampling >> 4) === 0 || (sampling & 0x0f) === 0) invalid();
        frameComponents.add(id);
      }
      sawFrame = true;
    }

    if (marker !== 0xda) {
      offset += segmentLength;
      continue;
    }

    if (!sawFrame || segmentLength < 8) invalid();
    const componentCount = bytes[offset + 2];
    if (componentCount < 1 || componentCount > 4 || segmentLength !== 6 + componentCount * 2) invalid();
    const scanComponents = new Set<number>();
    for (let component = 0; component < componentCount; component += 1) {
      const componentOffset = offset + 3 + component * 2;
      const id = bytes[componentOffset];
      const tables = bytes[componentOffset + 1];
      if (!frameComponents.has(id) || scanComponents.has(id) || (tables >> 4) > 3 || (tables & 0x0f) > 3) invalid();
      scanComponents.add(id);
    }
    const spectralOffset = offset + 3 + componentCount * 2;
    const start = bytes[spectralOffset];
    const end = bytes[spectralOffset + 1];
    const approximation = bytes[spectralOffset + 2];
    if (start > 63 || end > 63 || start > end || (approximation >> 4) > 13 || (approximation & 0x0f) > 13) invalid();
    offset += segmentLength;
    sawScan = true;

    let entropyBytes = 0;
    let nextMarkerOffset = -1;
    while (offset < bytes.length) {
      if (bytes[offset] !== 0xff) {
        entropyBytes += 1;
        offset += 1;
        continue;
      }
      const markerOffset = offset;
      offset += 1;
      if (offset >= bytes.length) invalid();
      if (bytes[offset] === 0x00) {
        entropyBytes += 1;
        offset += 1;
        continue;
      }
      while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
      if (offset >= bytes.length || bytes[offset] === 0x00) invalid();
      const entropyMarker = bytes[offset];
      if (entropyMarker >= 0xd0 && entropyMarker <= 0xd7) {
        if (entropyBytes === 0) invalid();
        offset += 1;
        continue;
      }
      if (entropyBytes === 0) invalid();
      if (entropyMarker === 0xe1 || entropyMarker === 0xed || entropyMarker === 0xfe) {
        throw new Error('unsafe_jpeg_metadata');
      }
      if (entropyMarker === 0xd9) {
        offset += 1;
        if (offset !== bytes.length) invalid();
        return;
      }
      if (entropyMarker === 0xd8 || entropyMarker === 0x00) invalid();
      nextMarkerOffset = markerOffset;
      break;
    }
    if (nextMarkerOffset < 0) invalid();
    offset = nextMarkerOffset;
  }
  if (!sawScan) invalid();
  invalid();
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function inspectNative(uri: string): Promise<RenderedMedia> {
  const bytes = await new File(uri).bytes();
  assertMetadataFreeJpeg(bytes);
  const image = Skia.Image.MakeImageFromEncoded(Skia.Data.fromBytes(bytes));
  if (!image) throw new Error('invalid_rendered_jpeg');
  const digest = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, bytes);
  return {
    uri,
    sha256: bytesToHex(new Uint8Array(digest)),
    mimeType: 'image/jpeg',
    width: image.width(),
    height: image.height(),
    byteLength: bytes.byteLength,
    recipeVersion: CANONICAL_RECIPE.recipeVersion,
    detectorVersions: DETECTOR_VERSIONS,
  };
}

function renderSrgbJpeg(bytes: Uint8Array, masks: readonly PrivacyMask[]): Uint8Array {
  const image = Skia.Image.MakeImageFromEncoded(Skia.Data.fromBytes(bytes));
  if (!image) throw new Error('invalid_rendered_jpeg');
  const surface = Skia.Surface.Make(image.width(), image.height());
  if (!surface) throw new Error('secure_media_processing_unavailable');
  const canvas = surface.getCanvas();
  canvas.drawImage(image, 0, 0);
  const paint = Skia.Paint();
  paint.setAntiAlias(false);
  paint.setColor(Skia.Color('#000000'));
  for (const mask of masks) {
    canvas.drawRect(Skia.XYWHRect(
      Math.floor(mask.rect.x * image.width()),
      Math.floor(mask.rect.y * image.height()),
      Math.ceil(mask.rect.width * image.width()),
      Math.ceil(mask.rect.height * image.height()),
    ), paint);
  }
  surface.flush();
  const renderedBytes = surface.makeImageSnapshot().encodeToBytes(ImageFormat.JPEG, 88);
  assertMetadataFreeJpeg(renderedBytes);
  return renderedBytes;
}

function writeCacheJpeg(prefix: string, bytes: Uint8Array): string {
  const file = new File(Paths.cache, `${prefix}-${Crypto.randomUUID()}.jpg`);
  file.create({ overwrite: false });
  file.write(bytes);
  return file.uri;
}

async function prepareNative(sourceUri: string): Promise<RenderedMedia> {
  const sourceContext = ImageManipulator.manipulate(sourceUri);
  const sourceImage = await sourceContext.renderAsync();
  const dimensions = targetDimensions(sourceImage.width, sourceImage.height);
  const context = dimensions.width === sourceImage.width && dimensions.height === sourceImage.height
    ? sourceContext
    : ImageManipulator.manipulate(sourceUri).resize(dimensions);
  const canonicalImage = dimensions.width === sourceImage.width && dimensions.height === sourceImage.height
    ? sourceImage
    : await context.renderAsync();
  const saved = await canonicalImage.saveAsync({
    compress: 1,
    format: SaveFormat.PNG,
  });
  const intermediate = new File(saved.uri);
  try {
    const canonicalBytes = renderSrgbJpeg(await intermediate.bytes(), []);
    return inspectNative(writeCacheJpeg('animalhelper-canonical', canonicalBytes));
  } finally {
    try {
      if (intermediate.exists) intermediate.delete();
    } catch {
      // Cache cleanup is best effort; selected bytes never enter durable storage here.
    }
  }
}

async function renderNative(input: Readonly<{
  canonical: RenderedMedia;
  masks: readonly PrivacyMask[];
}>): Promise<RenderedMedia> {
  const bytes = await new File(input.canonical.uri).bytes();
  assertMetadataFreeJpeg(bytes);
  const image = Skia.Image.MakeImageFromEncoded(Skia.Data.fromBytes(bytes));
  if (!image || image.width() !== input.canonical.width || image.height() !== input.canonical.height) {
    throw new Error('canonical_media_changed');
  }
  const renderedBytes = renderSrgbJpeg(bytes, input.masks);
  return inspectNative(writeCacheJpeg('animalhelper-reviewed', renderedBytes));
}

const nativeAdapter: MediaProcessorAdapter = {
  prepareCanonical: prepareNative,
  renderOpaqueMasks: renderNative,
  inspectRendered: inspectNative,
};

export function prepareCanonical(sourceUri: string, adapter: MediaProcessorAdapter = nativeAdapter) {
  return prepareCanonicalWithAdapter(sourceUri, adapter);
}

export function renderOpaqueMasks(
  input: Readonly<{ canonical: RenderedMedia; masks: readonly PrivacyMask[] }>,
  adapter: MediaProcessorAdapter = nativeAdapter,
) {
  return renderOpaqueMasksWithAdapter(input, adapter);
}

export function inspectRendered(uri: string, adapter: MediaProcessorAdapter = nativeAdapter) {
  return inspectRenderedWithAdapter(uri, adapter);
}
