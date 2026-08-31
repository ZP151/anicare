import { describe, expect, it } from 'vitest';

import {
  createTwoPartyStartBarrier,
  runIsolatedAttempts,
  settleTwoAtBarrier,
} from './concurrency.js';

describe('isolated bounded attempts', () => {
  it('creates and destroys one unique scenario before starting the next attempt', async () => {
    const active = new Set<string>();
    const observed: string[] = [];
    const destroyed: string[] = [];

    await runIsolatedAttempts(
      3,
      async (attempt) => {
        expect(active.size).toBe(0);
        const scenario = `scenario-${attempt}`;
        active.add(scenario);
        return scenario;
      },
      async (scenario, attempt) => {
        expect(active).toEqual(new Set([scenario]));
        observed.push(`${attempt}:${scenario}`);
      },
      async (scenario) => {
        active.delete(scenario);
        destroyed.push(scenario);
      },
    );

    expect(observed).toEqual(['0:scenario-0', '1:scenario-1', '2:scenario-2']);
    expect(destroyed).toEqual(['scenario-0', 'scenario-1', 'scenario-2']);
    expect(active.size).toBe(0);
  });

  it('destroys the current scenario when an attempt fails and starts no later attempt', async () => {
    const created: string[] = [];
    const destroyed: string[] = [];

    await expect(runIsolatedAttempts(
      3,
      async (attempt) => {
        const scenario = `scenario-${attempt}`;
        created.push(scenario);
        return scenario;
      },
      async () => {
        throw new Error('attempt_failed');
      },
      async (scenario) => {
        destroyed.push(scenario);
      },
    )).rejects.toThrow('attempt_failed');

    expect(created).toEqual(['scenario-0']);
    expect(destroyed).toEqual(['scenario-0']);
  });
});

describe('two-party start barrier', () => {
  it('holds the first participant until both are ready and announces readiness before either resumes', async () => {
    const completed: string[] = [];
    let mutuallyReady = false;
    const wait = createTwoPartyStartBarrier((release) => {
      mutuallyReady = true;
      expect(completed).toEqual([]);
      release();
    });

    const first = wait().then(() => completed.push('first'));
    await Promise.resolve();
    expect(mutuallyReady).toBe(false);
    expect(completed).toEqual([]);

    const second = wait().then(() => completed.push('second'));
    await Promise.all([first, second]);

    expect(mutuallyReady).toBe(true);
    expect(completed).toEqual(['first', 'second']);
  });

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
