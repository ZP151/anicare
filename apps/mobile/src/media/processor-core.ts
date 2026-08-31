import type { PrivacyMask, RenderedMedia } from './contracts';

export const CANONICAL_RECIPE = {
  format: 'jpeg',
  maxLongestEdge: 2048,
  quality: 0.88,
  recipeVersion: 'jpeg-srgb-2048-q88.v1',
} as const;

export type MediaProcessorAdapter = Readonly<{
  prepareCanonical(sourceUri: string, recipe: typeof CANONICAL_RECIPE): Promise<RenderedMedia>;
  renderOpaqueMasks(
    input: Readonly<{ canonical: RenderedMedia; masks: readonly PrivacyMask[] }>,
    recipe: typeof CANONICAL_RECIPE,
  ): Promise<RenderedMedia>;
  inspectRendered(uri: string): Promise<RenderedMedia>;
}>;

function isCanonical(media: RenderedMedia): boolean {
  return media.mimeType === 'image/jpeg' &&
    media.recipeVersion === CANONICAL_RECIPE.recipeVersion &&
    Number.isInteger(media.width) &&
    Number.isInteger(media.height) &&
    media.width > 0 &&
    media.height > 0 &&
    Math.max(media.width, media.height) <= CANONICAL_RECIPE.maxLongestEdge &&
    Number.isInteger(media.byteLength) &&
    media.byteLength > 0 &&
    /^[a-f0-9]{64}$/i.test(media.sha256) &&
    media.uri.length > 0;
}

function assertCanonical(media: RenderedMedia): RenderedMedia {
  if (!isCanonical(media)) throw new Error('invalid_canonical_media');
  return media;
}

function isNormalizedMask(mask: PrivacyMask): boolean {
  const { x, y, width, height } = mask.rect;
  return mask.id.length > 0 &&
    [x, y, width, height].every(Number.isFinite) &&
    x >= 0 && y >= 0 && width > 0 && height > 0 &&
    x + width <= 1 && y + height <= 1;
}

export async function prepareCanonicalWithAdapter(sourceUri: string, adapter?: MediaProcessorAdapter): Promise<RenderedMedia> {
  if (!sourceUri) throw new Error('invalid_source_uri');
  if (!adapter) throw new Error('secure_media_processing_unavailable');
  return assertCanonical(await adapter.prepareCanonical(sourceUri, CANONICAL_RECIPE));
}

export async function renderOpaqueMasksWithAdapter(
  input: Readonly<{ canonical: RenderedMedia; masks: readonly PrivacyMask[] }>,
  adapter?: MediaProcessorAdapter,
): Promise<RenderedMedia> {
  assertCanonical(input.canonical);
  if (!input.masks.every(isNormalizedMask)) throw new Error('invalid_privacy_mask');
  if (!adapter) throw new Error('secure_media_processing_unavailable');
  return assertCanonical(await adapter.renderOpaqueMasks(input, CANONICAL_RECIPE));
}

export async function inspectRenderedWithAdapter(uri: string, adapter?: MediaProcessorAdapter): Promise<RenderedMedia> {
  if (!adapter) throw new Error('secure_media_processing_unavailable');
  return assertCanonical(await adapter.inspectRendered(uri));
}
