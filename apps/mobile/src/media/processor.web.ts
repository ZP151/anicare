import type { PrivacyMask, RenderedMedia } from './contracts';

function unavailable(): never {
  throw new Error('secure_media_processing_unavailable');
}

export async function prepareCanonical(_sourceUri: string): Promise<RenderedMedia> {
  return unavailable();
}

export async function renderOpaqueMasks(
  _input: Readonly<{ canonical: RenderedMedia; masks: readonly PrivacyMask[] }>,
): Promise<RenderedMedia> {
  return unavailable();
}

export async function inspectRendered(_uri: string): Promise<RenderedMedia> {
  return unavailable();
}
