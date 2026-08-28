import { describe, expect, it } from 'vitest';

import { deterministicJpegFixture } from './jpeg-fixture.js';

describe('deterministicJpegFixture', () => {
  it('returns the reviewed decoder-valid 1x1 JFIF bytes and digest', () => {
    const fixture = deterministicJpegFixture();

    expect(fixture.bytes).toHaveLength(631);
    expect(fixture.sha256).toBe('b879f70cac2dca989da9691b445cdd5e0370bf1274e7ec00e66a827614d65928');
    expect(fixture.width).toBe(1);
    expect(fixture.height).toBe(1);
  });
});
