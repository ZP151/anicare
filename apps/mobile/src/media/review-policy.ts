import type { MediaReviewEvent, MediaReviewState, PrivacyMask, ReviewReceipt } from './contracts';

const RECIPE_VERSION = 'jpeg-srgb-2048-q88.v1';

function receiptFor(state: MediaReviewState, confirmedAtLocal: string): ReviewReceipt | null {
  if (!state.rendered) return null;
  return {
    sanitizedSha256: state.rendered.sha256,
    recipeVersion: RECIPE_VERSION,
    detectorVersions: {},
    width: state.rendered.width,
    height: state.rendered.height,
    byteLength: state.rendered.byteLength,
    confirmedAtLocal,
  };
}

export function reduceMediaReview(state: MediaReviewState, event: MediaReviewEvent): MediaReviewState {
  switch (event.type) {
    case 'confirm': {
      const receipt = receiptFor(state, event.confirmedAtLocal ?? new Date().toISOString());
      return receipt ? { ...state, status: 'reviewed', receipt } : { ...state, status: 'needs_review', receipt: null };
    }
    case 'masks_changed':
      return { ...state, masks: [...event.masks] as readonly PrivacyMask[], status: 'needs_review', receipt: null };
    case 'rendered_changed':
      return { ...state, rendered: event.rendered, status: event.rendered ? 'needs_review' : 'idle', receipt: null };
    case 'reset':
      return { status: 'idle', rendered: null, masks: [], receipt: null };
  }
}

export function canStageMedia(state: MediaReviewState): boolean {
  return state.status === 'reviewed' &&
    state.rendered !== null &&
    state.receipt !== null &&
    state.receipt.sanitizedSha256 === state.rendered.sha256 &&
    state.receipt.width === state.rendered.width &&
    state.receipt.height === state.rendered.height &&
    state.receipt.byteLength === state.rendered.byteLength;
}
