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

export async function renderOpaqueMasks(
  input: Readonly<{ canonical: RenderedMedia; masks: readonly PrivacyMask[] }>,
  adapter?: MediaProcessorAdapter,
): Promise<RenderedMedia> {
  return renderOpaqueMasksWithAdapter(input, adapter);
}

export async function inspectRendered(uri: string, adapter?: MediaProcessorAdapter): Promise<RenderedMedia> {
  return inspectRenderedWithAdapter(uri, adapter);
}
