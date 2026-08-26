import { prepareCanonical, renderOpaqueMasks } from './processor.web';
import { persistReviewedMedia } from './draft-media.web';
import type { MediaReviewState, RenderedMedia } from './contracts';

const canonical: RenderedMedia = {
  uri: 'file:///cache/canonical.jpg',
  sha256: 'a'.repeat(64),
  mimeType: 'image/jpeg',
  width: 100,
  height: 100,
  byteLength: 10,
  recipeVersion: 'jpeg-srgb-2048-q88.v1',
  detectorVersions: {},
};

describe('web secure media boundary', () => {
  it('fails closed without returning a processing or staging path', async () => {
    await expect(prepareCanonical('blob:selected-source')).rejects.toThrow('secure_media_processing_unavailable');
    await expect(renderOpaqueMasks({ canonical, masks: [] })).rejects.toThrow('secure_media_processing_unavailable');
    await expect(persistReviewedMedia({
      draftId: 'draft-12345678',
      mediaId: 'media-12345678',
      review: { status: 'reviewed', rendered: canonical, masks: [], receipt: null } as MediaReviewState,
      transientUris: [],
    })).rejects.toThrow('secure_media_processing_unavailable');
  });
});
