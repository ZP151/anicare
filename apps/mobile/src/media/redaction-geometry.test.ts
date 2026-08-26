import { normalizePreviewTap } from './redaction-geometry';

describe('contained-image tap geometry', () => {
  it('maps a 2:1 image inside a square frame and rejects top/bottom letterbox taps', () => {
    const input = { imageWidth: 200, imageHeight: 100, frameWidth: 100, frameHeight: 100 };
    expect(normalizePreviewTap({ ...input, x: 50, y: 50 })).toEqual({ x: 0.5, y: 0.5 });
    expect(normalizePreviewTap({ ...input, x: 0, y: 25 })).toEqual({ x: 0, y: 0 });
    expect(normalizePreviewTap({ ...input, x: 100, y: 75 })).toEqual({ x: 1, y: 1 });
    expect(normalizePreviewTap({ ...input, x: 50, y: 24.99 })).toBeNull();
    expect(normalizePreviewTap({ ...input, x: 50, y: 75.01 })).toBeNull();
  });

  it('maps a 1:2 image inside a square frame and rejects left/right pillarbox taps', () => {
    const input = { imageWidth: 100, imageHeight: 200, frameWidth: 100, frameHeight: 100 };
    expect(normalizePreviewTap({ ...input, x: 50, y: 50 })).toEqual({ x: 0.5, y: 0.5 });
    expect(normalizePreviewTap({ ...input, x: 25, y: 0 })).toEqual({ x: 0, y: 0 });
    expect(normalizePreviewTap({ ...input, x: 75, y: 100 })).toEqual({ x: 1, y: 1 });
    expect(normalizePreviewTap({ ...input, x: 24.99, y: 50 })).toBeNull();
    expect(normalizePreviewTap({ ...input, x: 75.01, y: 50 })).toBeNull();
  });
});
