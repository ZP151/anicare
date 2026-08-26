import {
  canStageMedia,
  reduceMediaReview,
} from './review-policy';
import type { MediaReviewState } from './contracts';

const rendered = {
  uri: 'file:///reviewed.jpg',
  sha256: 'abc123',
  mimeType: 'image/jpeg' as const,
  width: 100,
  height: 100,
  byteLength: 42,
};

const readyState: MediaReviewState = {
  status: 'ready',
  rendered,
  masks: [],
  receipt: null,
};

const reviewedState: MediaReviewState = {
  ...readyState,
  status: 'reviewed',
  receipt: {
    sanitizedSha256: 'abc123',
    recipeVersion: 'jpeg-srgb-2048-q88.v1',
    detectorVersions: {},
    width: 100,
    height: 100,
    byteLength: 42,
    confirmedAtLocal: '2026-08-27T00:00:00.000Z',
  },
};

describe('media review policy', () => {
  it('fails closed until a rendered media receipt is confirmed', () => {
    expect(canStageMedia(readyState)).toBe(false);
    expect(canStageMedia(reduceMediaReview(readyState, { type: 'confirm' }))).toBe(true);
  });

  it('invalidates confirmation when masks change', () => {
    const masks = [{ id: 'mask-1', rect: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 } }];
    expect(reduceMediaReview(reviewedState, { type: 'masks_changed', masks })).toMatchObject({
      status: 'needs_review',
      receipt: null,
    });
  });
});
