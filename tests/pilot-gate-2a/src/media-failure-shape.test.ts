import { describe, expect, it } from 'vitest';

import { isExactMediaBoundaryFailure } from './media-failure-shape.js';

describe('isExactMediaBoundaryFailure', () => {
  it('accepts the four-field actor failure and rejects missing or extra fields', () => {
    const expected = {
      stage: 'reserve' as const,
      status: 403 as const,
      code: 'media_not_found_or_forbidden' as const,
    };

    expect([
      isExactMediaBoundaryFailure({ stage: 'reserve', kind: 'http', status: 403, code: 'media_not_found_or_forbidden' }, expected),
      isExactMediaBoundaryFailure({ stage: 'reserve', kind: 'http', status: 403 }, expected),
      isExactMediaBoundaryFailure({ stage: 'reserve', kind: 'http', status: 403, code: 'media_not_found_or_forbidden', detail: 'discarded' }, expected),
      isExactMediaBoundaryFailure({ stage: 'reserve', kind: 'network', status: 403, code: 'media_not_found_or_forbidden' }, expected),
    ]).toEqual([true, false, false, false]);
  });
});
