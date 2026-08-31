import type { NormalizedRect, PrivacyMask } from './contracts';

export const MIN_MASK_EDGE = 0.04;
export const ACCESSIBLE_MASK_STEP = 0.02;

export type NormalizedPoint = Readonly<{ x: number; y: number }>;
export type PreviewFrameInput = Readonly<{
  imageWidth: number;
  imageHeight: number;
  frameWidth: number;
  frameHeight: number;
}>;
export type PreviewRect = Readonly<{ x: number; y: number; width: number; height: number }>;
export type PreviewTapInput = Readonly<PreviewFrameInput & NormalizedPoint>;
export type MaskCorner = 'top_left' | 'top_right' | 'bottom_left' | 'bottom_right';
export type MaskHit = Readonly<{ maskId: string; part: 'body' | MaskCorner }>;
export type HitTestInput = Readonly<PreviewFrameInput & {
  masks: readonly PrivacyMask[];
  x: number;
  y: number;
  handleRadiusPx: number;
}>;
export type AccessibleMaskAction =
  | 'move_left'
  | 'move_right'
  | 'move_up'
  | 'move_down'
  | 'wider'
  | 'narrower'
  | 'taller'
  | 'shorter';

type ContentFrame = Readonly<{ x: number; y: number; width: number; height: number }>;

const DEFAULT_MASK_WIDTH = 0.24;
const DEFAULT_MASK_HEIGHT = 0.14;

function contentFrame(frame: PreviewFrameInput): ContentFrame | null {
  const values = [frame.imageWidth, frame.imageHeight, frame.frameWidth, frame.frameHeight];
  if (!values.every(Number.isFinite) || values.some((value) => value <= 0)) return null;

  const scale = Math.min(frame.frameWidth / frame.imageWidth, frame.frameHeight / frame.imageHeight);
  const width = frame.imageWidth * scale;
  const height = frame.imageHeight * scale;
  const x = (frame.frameWidth - width) / 2;
  const y = (frame.frameHeight - height) / 2;
  if (![scale, width, height, x, y].every(Number.isFinite) || width <= 0 || height <= 0) return null;

  return { x, y, width, height };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function roundNormalized(value: number): number {
  return Math.round(value * 1_000_000_000_000) / 1_000_000_000_000;
}

function inwardHitBounds(position: number, radius: number, minimum: number, length: number): Readonly<{ minimum: number; maximum: number }> {
  const extent = Math.min(radius * 2, length);
  const start = clamp(position - radius, minimum, minimum + length - extent);
  return { minimum: start, maximum: start + extent };
}

function isNormalizedRect(rect: NormalizedRect): boolean {
  const { x, y, width, height } = rect;
  return [x, y, width, height].every(Number.isFinite) &&
    x >= 0 && y >= 0 && width > 0 && height > 0 &&
    x + width <= 1 && y + height <= 1;
}

function isEditableMask(mask: PrivacyMask): boolean {
  return mask.id.length > 0 && isNormalizedRect(mask.rect) &&
    mask.rect.width >= MIN_MASK_EDGE && mask.rect.height >= MIN_MASK_EDGE;
}

function withRect(mask: PrivacyMask, rect: NormalizedRect): PrivacyMask {
  const previous = mask.rect;
  if (previous.x === rect.x && previous.y === rect.y &&
      previous.width === rect.width && previous.height === rect.height) return mask;
  return { ...mask, rect };
}

export function normalizePreviewTap(input: PreviewTapInput): NormalizedPoint | null {
  if (![input.x, input.y].every(Number.isFinite)) return null;
  const content = contentFrame(input);
  if (!content || input.x < content.x || input.x > content.x + content.width ||
      input.y < content.y || input.y > content.y + content.height) return null;

  return {
    x: roundNormalized((input.x - content.x) / content.width),
    y: roundNormalized((input.y - content.y) / content.height),
  };
}

export function normalizedRectToPreview(rect: NormalizedRect, frame: PreviewFrameInput): PreviewRect | null {
  if (!isNormalizedRect(rect)) return null;
  const content = contentFrame(frame);
  if (!content) return null;

  return {
    x: content.x + rect.x * content.width,
    y: content.y + rect.y * content.height,
    width: rect.width * content.width,
    height: rect.height * content.height,
  };
}

export function createDefaultMask(id: string, point: NormalizedPoint): PrivacyMask {
  if (!id || ![point.x, point.y].every(Number.isFinite) ||
      point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1) {
    throw new Error('invalid_mask_geometry');
  }

  return {
    id,
    rect: {
      x: roundNormalized(clamp(point.x - DEFAULT_MASK_WIDTH / 2, 0, 1 - DEFAULT_MASK_WIDTH)),
      y: roundNormalized(clamp(point.y - DEFAULT_MASK_HEIGHT / 2, 0, 1 - DEFAULT_MASK_HEIGHT)),
      width: DEFAULT_MASK_WIDTH,
      height: DEFAULT_MASK_HEIGHT,
    },
  };
}

export function hitTestMasks(input: HitTestInput): MaskHit | null {
  if (![input.x, input.y, input.handleRadiusPx].every(Number.isFinite) || input.handleRadiusPx < 0) return null;
  const content = contentFrame(input);
  const point = normalizePreviewTap(input);
  if (!content || !point) return null;

  for (let index = input.masks.length - 1; index >= 0; index -= 1) {
    const mask = input.masks[index];
    if (!isEditableMask(mask)) continue;
    const { x, y, width, height } = mask.rect;
    const right = x + width;
    const bottom = y + height;
    const corners: readonly [MaskCorner, number, number][] = [
      ['top_left', content.x + x * content.width, content.y + y * content.height],
      ['top_right', content.x + right * content.width, content.y + y * content.height],
      ['bottom_left', content.x + x * content.width, content.y + bottom * content.height],
      ['bottom_right', content.x + right * content.width, content.y + bottom * content.height],
    ];
    let nearestCorner: Readonly<{ part: MaskCorner; distanceSquared: number }> | null = null;
    for (const [part, cornerX, cornerY] of corners) {
      const horizontal = inwardHitBounds(cornerX, input.handleRadiusPx, content.x, content.width);
      const vertical = inwardHitBounds(cornerY, input.handleRadiusPx, content.y, content.height);
      if (input.x < horizontal.minimum || input.x > horizontal.maximum ||
          input.y < vertical.minimum || input.y > vertical.maximum) continue;
      const distanceSquared = (input.x - cornerX) ** 2 + (input.y - cornerY) ** 2;
      if (!nearestCorner || distanceSquared < nearestCorner.distanceSquared) {
        nearestCorner = { part, distanceSquared };
      }
    }
    if (nearestCorner) return { maskId: mask.id, part: nearestCorner.part };
    if (point.x >= x && point.x <= right && point.y >= y && point.y <= bottom) {
      return { maskId: mask.id, part: 'body' };
    }
  }

  return null;
}

export function moveMask(mask: PrivacyMask, delta: NormalizedPoint): PrivacyMask {
  if (!isEditableMask(mask) || ![delta.x, delta.y].every(Number.isFinite)) return mask;
  const { width, height } = mask.rect;
  const x = roundNormalized(clamp(mask.rect.x + delta.x, 0, 1 - width));
  const y = roundNormalized(clamp(mask.rect.y + delta.y, 0, 1 - height));
  return withRect(mask, { x, y, width, height });
}

export function resizeMaskFromCorner(mask: PrivacyMask, corner: MaskCorner, point: NormalizedPoint): PrivacyMask {
  if (!isEditableMask(mask) || ![point.x, point.y].every(Number.isFinite)) return mask;
  const left = mask.rect.x;
  const top = mask.rect.y;
  const right = left + mask.rect.width;
  const bottom = top + mask.rect.height;
  let nextLeft = left;
  let nextTop = top;
  let nextRight = right;
  let nextBottom = bottom;

  switch (corner) {
    case 'top_left':
      nextLeft = clamp(point.x, 0, right - MIN_MASK_EDGE);
      nextTop = clamp(point.y, 0, bottom - MIN_MASK_EDGE);
      break;
    case 'top_right':
      nextRight = clamp(point.x, left + MIN_MASK_EDGE, 1);
      nextTop = clamp(point.y, 0, bottom - MIN_MASK_EDGE);
      break;
    case 'bottom_left':
      nextLeft = clamp(point.x, 0, right - MIN_MASK_EDGE);
      nextBottom = clamp(point.y, top + MIN_MASK_EDGE, 1);
      break;
    case 'bottom_right':
      nextRight = clamp(point.x, left + MIN_MASK_EDGE, 1);
      nextBottom = clamp(point.y, top + MIN_MASK_EDGE, 1);
      break;
  }

  return withRect(mask, {
    x: roundNormalized(nextLeft),
    y: roundNormalized(nextTop),
    width: roundNormalized(nextRight - nextLeft),
    height: roundNormalized(nextBottom - nextTop),
  });
}

export function adjustMask(mask: PrivacyMask, action: AccessibleMaskAction): PrivacyMask {
  const { x, y, width, height } = mask.rect;
  switch (action) {
    case 'move_left':
      return moveMask(mask, { x: -ACCESSIBLE_MASK_STEP, y: 0 });
    case 'move_right':
      return moveMask(mask, { x: ACCESSIBLE_MASK_STEP, y: 0 });
    case 'move_up':
      return moveMask(mask, { x: 0, y: -ACCESSIBLE_MASK_STEP });
    case 'move_down':
      return moveMask(mask, { x: 0, y: ACCESSIBLE_MASK_STEP });
    case 'wider':
      return resizeMaskFromCorner(mask, 'bottom_right', { x: x + width + ACCESSIBLE_MASK_STEP, y: y + height });
    case 'narrower':
      return resizeMaskFromCorner(mask, 'bottom_right', { x: x + width - ACCESSIBLE_MASK_STEP, y: y + height });
    case 'taller':
      return resizeMaskFromCorner(mask, 'bottom_right', { x: x + width, y: y + height + ACCESSIBLE_MASK_STEP });
    case 'shorter':
      return resizeMaskFromCorner(mask, 'bottom_right', { x: x + width, y: y + height - ACCESSIBLE_MASK_STEP });
  }
}
