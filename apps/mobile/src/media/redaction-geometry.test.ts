import {
  ACCESSIBLE_MASK_STEP,
  MIN_MASK_EDGE,
  adjustMask,
  createDefaultMask,
  hitTestMasks,
  moveMask,
  normalizePreviewTap,
  normalizedRectToPreview,
  resizeMaskFromCorner,
} from './redaction-geometry';

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

describe('preview projection', () => {
  it.each([
    {
      name: 'letterboxes a landscape image',
      frame: { imageWidth: 400, imageHeight: 200, frameWidth: 200, frameHeight: 200 },
      expected: { x: 20, y: 70, width: 80, height: 30 },
    },
    {
      name: 'pillarboxes a portrait image',
      frame: { imageWidth: 200, imageHeight: 400, frameWidth: 200, frameHeight: 200 },
      expected: { x: 60, y: 40, width: 40, height: 60 },
    },
  ])('$name', ({ frame, expected }) => {
    expect(normalizedRectToPreview({ x: 0.1, y: 0.2, width: 0.4, height: 0.3 }, frame)).toEqual(expected);
  });

  it('rejects non-finite or invalid preview inputs', () => {
    expect(normalizedRectToPreview({ x: 0, y: 0, width: 0.2, height: 0.2 }, {
      imageWidth: 0,
      imageHeight: 100,
      frameWidth: 100,
      frameHeight: 100,
    })).toBeNull();
    expect(normalizedRectToPreview({ x: Number.NaN, y: 0, width: 0.2, height: 0.2 }, {
      imageWidth: 100,
      imageHeight: 100,
      frameWidth: 100,
      frameHeight: 100,
    })).toBeNull();
  });
});

describe('mask geometry', () => {
  const mask = { id: 'm1', rect: { x: 0.2, y: 0.3, width: 0.4, height: 0.3 } } as const;

  it('creates a clamped default mask from a tap', () => {
    expect(createDefaultMask('m1', { x: 0.99, y: 0.99 }).rect)
      .toEqual({ x: 0.76, y: 0.86, width: 0.24, height: 0.14 });
  });

  it('fails closed for an invalid creation identifier or point', () => {
    expect(() => createDefaultMask('', { x: 0.5, y: 0.5 })).toThrow('invalid_mask_geometry');
    expect(() => createDefaultMask('m1', { x: Number.NaN, y: 0.5 })).toThrow('invalid_mask_geometry');
    expect(() => createDefaultMask('m1', { x: 1.01, y: 0.5 })).toThrow('invalid_mask_geometry');
  });

  it('selects the last overlapping mask as topmost', () => {
    expect(hitTestMasks({
      imageWidth: 100,
      imageHeight: 100,
      frameWidth: 100,
      frameHeight: 100,
      x: 50,
      y: 50,
      handleRadiusPx: 4,
      masks: [
        { id: 'first', rect: { x: 0.2, y: 0.2, width: 0.4, height: 0.4 } },
        { id: 'last', rect: { x: 0.3, y: 0.3, width: 0.4, height: 0.4 } },
      ],
    })).toMatchObject({ maskId: 'last', part: 'body' });
  });

  it.each([
    ['top_left', 20, 30],
    ['top_right', 60, 30],
    ['bottom_left', 20, 60],
    ['bottom_right', 60, 60],
  ] as const)('hits the %s handle before the mask body', (part, x, y) => {
    expect(hitTestMasks({
      imageWidth: 100,
      imageHeight: 100,
      frameWidth: 100,
      frameHeight: 100,
      x,
      y,
      handleRadiusPx: 4,
      masks: [mask],
    })).toEqual({ maskId: 'm1', part });
  });

  it('rejects non-finite hit-test values and invalid rectangles', () => {
    expect(hitTestMasks({
      imageWidth: 100,
      imageHeight: 100,
      frameWidth: 100,
      frameHeight: 100,
      x: Number.NaN,
      y: 50,
      handleRadiusPx: 4,
      masks: [mask],
    })).toBeNull();
    expect(hitTestMasks({
      imageWidth: 100,
      imageHeight: 100,
      frameWidth: 100,
      frameHeight: 100,
      x: 50,
      y: 50,
      handleRadiusPx: 4,
      masks: [{ id: 'bad', rect: { x: 0, y: 0, width: Number.POSITIVE_INFINITY, height: 0.2 } }],
    })).toBeNull();
  });

  it.each([
    ['left', { x: -1, y: 0 }, { x: 0, y: 0.3, width: 0.4, height: 0.3 }],
    ['right', { x: 1, y: 0 }, { x: 0.6, y: 0.3, width: 0.4, height: 0.3 }],
    ['top', { x: 0, y: -1 }, { x: 0.2, y: 0, width: 0.4, height: 0.3 }],
    ['bottom', { x: 0, y: 1 }, { x: 0.2, y: 0.7, width: 0.4, height: 0.3 }],
  ] as const)('bounds movement at the %s edge', (_edge, delta, expected) => {
    expect(moveMask(mask, delta).rect).toEqual(expected);
  });

  it('preserves the original mask when movement cannot change it or is non-finite', () => {
    const leftEdge = { id: 'left', rect: { x: 0, y: 0.3, width: 0.4, height: 0.3 } } as const;
    expect(moveMask(leftEdge, { x: -0.02, y: 0 })).toBe(leftEdge);
    expect(moveMask(mask, { x: Number.NaN, y: 0 })).toBe(mask);
  });

  it.each([
    ['top_left', { x: 0.1, y: 0.2 }, { x: 0.1, y: 0.2, width: 0.5, height: 0.4 }],
    ['top_right', { x: 0.8, y: 0.2 }, { x: 0.2, y: 0.2, width: 0.6, height: 0.4 }],
    ['bottom_left', { x: 0.1, y: 0.8 }, { x: 0.1, y: 0.3, width: 0.5, height: 0.5 }],
    ['bottom_right', { x: 0.8, y: 0.8 }, { x: 0.2, y: 0.3, width: 0.6, height: 0.5 }],
  ] as const)('resizes from the %s while anchoring the opposite corner', (corner, point, expected) => {
    expect(resizeMaskFromCorner(mask, corner, point).rect).toEqual(expected);
  });

  it('enforces the minimum edge while resizing and preserves a mask for invalid input', () => {
    const resized = resizeMaskFromCorner(mask, 'top_left', { x: 0.99, y: 0.99 });
    expect(resized.rect.width).toBe(MIN_MASK_EDGE);
    expect(resized.rect.height).toBe(MIN_MASK_EDGE);
    expect(resizeMaskFromCorner(mask, 'top_left', { x: Number.NaN, y: 0.2 })).toBe(mask);
  });

  it.each([
    ['move_left', { x: -ACCESSIBLE_MASK_STEP, y: 0 }],
    ['move_right', { x: ACCESSIBLE_MASK_STEP, y: 0 }],
    ['move_up', { x: 0, y: -ACCESSIBLE_MASK_STEP }],
    ['move_down', { x: 0, y: ACCESSIBLE_MASK_STEP }],
  ] as const)('applies %s through the same bounded movement', (action, delta) => {
    expect(adjustMask(mask, action)).toEqual(moveMask(mask, delta));
  });

  it.each([
    ['wider', { x: 0.62, y: 0.6 }],
    ['narrower', { x: 0.58, y: 0.6 }],
    ['taller', { x: 0.6, y: 0.62 }],
    ['shorter', { x: 0.6, y: 0.58 }],
  ] as const)('applies %s through the same bounded far-edge resize', (action, point) => {
    expect(adjustMask(mask, action)).toEqual(resizeMaskFromCorner(mask, 'bottom_right', point));
  });

  it('keeps accessible boundary actions as the original object', () => {
    const edge = { id: 'edge', rect: { x: 0.6, y: 0.3, width: 0.4, height: 0.3 } } as const;
    expect(adjustMask(edge, 'move_right')).toBe(edge);
  });
});
