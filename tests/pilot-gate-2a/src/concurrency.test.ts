import { describe, expect, it } from 'vitest';

import { settleTwoAtBarrier } from './concurrency.js';

describe('two-party start barrier', () => {
  it('releases both actions and preserves their settled positions', async () => {
    const starts: string[] = [];

    const outcomes = await settleTwoAtBarrier(
      async () => {
        starts.push('first');
        return 'first-result';
      },
      async () => {
        starts.push('second');
        throw new Error('second-result');
      },
    );

    expect(starts).toEqual(['first', 'second']);
    expect(outcomes[0]).toEqual({ status: 'fulfilled', value: 'first-result' });
    expect(outcomes[1].status).toBe('rejected');
  });
});
