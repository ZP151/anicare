import type { RenderedMedia } from './contracts';

jest.mock('@shopify/react-native-skia', () => ({ ImageFormat: { JPEG: 3 }, Skia: {} }));

import {
  CANONICAL_RECIPE,
  prepareCanonical,
  renderOpaqueMasks,
} from './processor';

const canonical: RenderedMedia = {
  uri: 'file:///cache/canonical.jpg',
  sha256: 'a'.repeat(64),
  mimeType: 'image/jpeg',
  width: 2048,
  height: 1365,
  byteLength: 123_456,
  recipeVersion: 'jpeg-srgb-2048-q88.v1',
  detectorVersions: {},
};

describe('reviewed media processor', () => {
  it('prepares a newly rendered JPEG using the frozen canonical recipe', async () => {
    const calls: unknown[] = [];
    const adapter = {
      prepareCanonical: async (sourceUri: string, recipe: typeof CANONICAL_RECIPE) => {
        calls.push({ sourceUri, recipe });
        return canonical;
      },
      renderOpaqueMasks: async () => canonical,
      inspectRendered: async () => canonical,
    };

    await expect(prepareCanonical('file:///raw.heic', adapter)).resolves.toEqual(canonical);
    expect(calls).toEqual([{
      sourceUri: 'file:///raw.heic',
      recipe: {
        format: 'jpeg',
        maxLongestEdge: 2048,
        quality: 0.88,
        recipeVersion: 'jpeg-srgb-2048-q88.v1',
      },
    }]);
  });

  it('fails closed when an adapter returns bytes outside the canonical contract', async () => {
    const adapter = {
      prepareCanonical: async () => ({ ...canonical, mimeType: 'image/png' as 'image/jpeg' }),
      renderOpaqueMasks: async () => canonical,
      inspectRendered: async () => canonical,
    };

    await expect(prepareCanonical('file:///raw.png', adapter)).rejects.toThrow('invalid_canonical_media');
  });

  it('passes valid normalized masks to the final pixel renderer', async () => {
    const calls: unknown[] = [];
    const masks = [{ id: 'mask-1', rect: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 } }];
    const adapter = {
      prepareCanonical: async () => canonical,
      renderOpaqueMasks: async (input: unknown, recipe: typeof CANONICAL_RECIPE) => {
        calls.push({ input, recipe });
        return { ...canonical, uri: 'file:///cache/reviewed.jpg', sha256: 'b'.repeat(64) };
      },
      inspectRendered: async () => canonical,
    };

    const rendered = await renderOpaqueMasks({ canonical, masks }, adapter);

    expect(rendered.uri).toBe('file:///cache/reviewed.jpg');
    expect(calls).toEqual([{ input: { canonical, masks }, recipe: CANONICAL_RECIPE }]);
  });

  it('rejects masks that extend outside the rendered image', async () => {
    const adapter = {
      prepareCanonical: async () => canonical,
      renderOpaqueMasks: async () => canonical,
      inspectRendered: async () => canonical,
    };

    await expect(renderOpaqueMasks({
      canonical,
      masks: [{ id: 'outside', rect: { x: 0.9, y: 0, width: 0.2, height: 0.5 } }],
    }, adapter)).rejects.toThrow('invalid_privacy_mask');
  });
});
