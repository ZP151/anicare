export type NormalizedRect = Readonly<{
  x: number;
  y: number;
  width: number;
  height: number;
}>;

export type PrivacyMask = Readonly<{
  id: string;
  rect: NormalizedRect;
}>;

export type RenderedMedia = Readonly<{
  uri: string;
  sha256: string;
  mimeType: 'image/jpeg';
  width: number;
  height: number;
  byteLength: number;
  recipeVersion: string;
  detectorVersions: Readonly<Record<string, string>>;
}>;

export type ReviewReceipt = Readonly<{
  sanitizedSha256: string;
  recipeVersion: string;
  detectorVersions: Readonly<Record<string, string>>;
  width: number;
  height: number;
  byteLength: number;
  confirmedAtLocal: string;
}>;

export type MediaReviewStatus = 'idle' | 'ready' | 'needs_review' | 'reviewed';

export type MediaReviewState = Readonly<{
  status: MediaReviewStatus;
  rendered: RenderedMedia | null;
  masks: readonly PrivacyMask[];
  receipt: ReviewReceipt | null;
}>;

export type MediaReviewEvent =
  | { type: 'confirm'; confirmedAtLocal?: string }
  | { type: 'masks_changed'; masks: readonly PrivacyMask[] }
  | { type: 'rendered_changed'; rendered: RenderedMedia | null }
  | { type: 'reset' };
