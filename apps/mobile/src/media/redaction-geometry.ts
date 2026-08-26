export type PreviewTapInput = Readonly<{
  imageWidth: number;
  imageHeight: number;
  frameWidth: number;
  frameHeight: number;
  x: number;
  y: number;
}>;

export function normalizePreviewTap(input: PreviewTapInput): { x: number; y: number } | null {
  const values = [input.imageWidth, input.imageHeight, input.frameWidth, input.frameHeight, input.x, input.y];
  if (!values.every(Number.isFinite) || input.imageWidth <= 0 || input.imageHeight <= 0 ||
      input.frameWidth <= 0 || input.frameHeight <= 0) return null;

  const scale = Math.min(input.frameWidth / input.imageWidth, input.frameHeight / input.imageHeight);
  const contentWidth = input.imageWidth * scale;
  const contentHeight = input.imageHeight * scale;
  const left = (input.frameWidth - contentWidth) / 2;
  const top = (input.frameHeight - contentHeight) / 2;
  if (input.x < left || input.x > left + contentWidth || input.y < top || input.y > top + contentHeight) return null;

  return {
    x: (input.x - left) / contentWidth,
    y: (input.y - top) / contentHeight,
  };
}
