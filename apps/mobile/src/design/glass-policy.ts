export type GlassMode = 'liquid' | 'blur' | 'solid';

export function supportsReduceTransparencyApi(value: {
  isReduceTransparencyEnabled?: unknown;
}): value is { isReduceTransparencyEnabled: () => Promise<boolean> } {
  return typeof value.isReduceTransparencyEnabled === 'function';
}

export function getGlassMode(input: {
  platform: string;
  liquidGlassAvailable: boolean;
  reduceTransparency: boolean;
}): GlassMode {
  if (input.reduceTransparency) return 'solid';
  if (input.platform === 'ios' && input.liquidGlassAvailable) return 'liquid';
  if (input.platform === 'ios' || input.platform === 'android') return 'blur';
  return 'solid';
}
