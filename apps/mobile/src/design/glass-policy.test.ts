import { getGlassMode, supportsReduceTransparencyApi } from './glass-policy';

describe('adaptive glass policy', () => {
  it('uses native liquid glass only on supported iOS devices', () => {
    expect(
      getGlassMode({ platform: 'ios', liquidGlassAvailable: true, reduceTransparency: false }),
    ).toBe('liquid');
  });

  it('falls back when transparency is reduced or the platform is unsupported', () => {
    expect(
      getGlassMode({ platform: 'ios', liquidGlassAvailable: true, reduceTransparency: true }),
    ).toBe('solid');
    expect(
      getGlassMode({ platform: 'android', liquidGlassAvailable: false, reduceTransparency: false }),
    ).toBe('blur');
    expect(
      getGlassMode({ platform: 'web', liquidGlassAvailable: false, reduceTransparency: false }),
    ).toBe('solid');
  });
});

describe('accessibility capability detection', () => {
  it('does not call the iOS-only transparency API on web implementations that omit it', () => {
    expect(supportsReduceTransparencyApi({})).toBe(false);
    expect(
      supportsReduceTransparencyApi({ isReduceTransparencyEnabled: async () => false }),
    ).toBe(true);
  });
});
