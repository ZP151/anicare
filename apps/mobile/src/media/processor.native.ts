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
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 ||
      bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9) {
    throw new Error('invalid_rendered_jpeg');
  }

  let offset = 2;
  let sawScan = false;
  let scanning = false;
  let sawEnd = false;
  while (offset < bytes.length) {
    if (scanning) {
      while (offset < bytes.length && bytes[offset] !== 0xff) offset += 1;
      if (offset >= bytes.length) break;
    } else if (bytes[offset] !== 0xff) {
      throw new Error('invalid_rendered_jpeg');
    }
    while (bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset++];
    if (scanning && marker === 0x00) continue;
    if (marker >= 0xd0 && marker <= 0xd7) continue;
    scanning = false;
    if (marker === 0xe1 || marker === 0xed || marker === 0xfe) throw new Error('unsafe_jpeg_metadata');
    if (marker === 0xd9) {
      sawEnd = true;
      break;
    }
    if (marker === 0xd8 || marker === 0x01) continue;
    if (offset + 1 >= bytes.length) throw new Error('invalid_rendered_jpeg');
    const segmentLength = (bytes[offset] << 8) | bytes[offset + 1];
    if (segmentLength < 2 || offset + segmentLength > bytes.length) throw new Error('invalid_rendered_jpeg');
    offset += segmentLength;
    if (marker === 0xda) {
      sawScan = true;
      scanning = true;
    }
  }
  if (!sawScan || !sawEnd || offset !== bytes.length) throw new Error('invalid_rendered_jpeg');
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
