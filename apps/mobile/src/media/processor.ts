import type { PrivacyMask, RenderedMedia } from './contracts';
import {
  inspectRenderedWithAdapter,
  prepareCanonicalWithAdapter,
  renderOpaqueMasksWithAdapter,
  type MediaProcessorAdapter,
} from './processor-core';

export { CANONICAL_RECIPE, type MediaProcessorAdapter } from './processor-core';

export async function prepareCanonical(sourceUri: string, adapter?: MediaProcessorAdapter): Promise<RenderedMedia> {
  return prepareCanonicalWithAdapter(sourceUri, adapter);
}
export async function prepareAvatar(_sourceUri: string): Promise<RenderedMedia> { throw new Error('secure_media_processing_unavailable'); }
export async function prepareCommunityImage(_sourceUri: string, _variant: 'thumb'|'display'): Promise<RenderedMedia> { throw new Error('secure_media_processing_unavailable'); }
export function discardCommunityImage(_uri: string): void {}

export async function renderOpaqueMasks(
  input: Readonly<{ canonical: RenderedMedia; masks: readonly PrivacyMask[] }>,
  adapter?: MediaProcessorAdapter,
): Promise<RenderedMedia> {
  return renderOpaqueMasksWithAdapter(input, adapter);
}

export async function inspectRendered(uri: string, adapter?: MediaProcessorAdapter): Promise<RenderedMedia> {
  return inspectRenderedWithAdapter(uri, adapter);
}

export function discardAvatar(_uri: string): void {}
