import { describe, expect, it, vi } from 'vitest';

import { executeHostedGate, type ExecuteHostedGateOptions } from './execute.js';
import type { ReadinessChecks } from './evidence.js';

const checks: ReadinessChecks = {
  authRedirectCheck: 'passed', mediaStagingCheck: 'passed', publicKeyOriginCheck: 'passed',
  syntheticOwnerHappyPath: 'passed', crossOwnerIsolation: 'passed',
};

function options(overrides: Partial<ExecuteHostedGateOptions> = {}) {
  const order: string[] = [];
  const evidenceWrites: ReadinessChecks[] = [];
  const base: ExecuteHostedGateOptions = {
    timeoutMs: 1_000,
    createScenario: async () => { order.push('create'); return { createdUserIds: [] }; },
    runChecks: async () => { order.push('checks'); return checks; },
    cleanup: async () => { order.push('cleanup'); },
    emitEvidence: async (value) => { order.push('evidence'); evidenceWrites.push(value); },
  };
  return { value: { ...base, ...overrides }, order, evidenceWrites };
}

describe('hosted gate execution', () => {
  it('runs serially, cleans before evidence, and returns only checks plus cleanup proof', async () => {
    const fixture = options();
    await expect(executeHostedGate(fixture.value)).resolves.toEqual({ checks, cleanupPassed: true });
    expect(fixture.order).toEqual(['create', 'checks', 'cleanup', 'evidence']);
    expect(fixture.evidenceWrites).toEqual([checks]);
  });

  it('suppresses passing evidence when cleanup cannot prove absence', async () => {
    const fixture = options({ cleanup: async () => { throw new Error('synthetic-user@example.invalid'); } });
    await expect(executeHostedGate(fixture.value)).rejects.toThrow('hosted_gate_failed_at_cleanup');
    expect(fixture.evidenceWrites).toEqual([]);
  });

  it('cleans a partial scenario after creation failure', async () => {
    const cleanup = vi.fn(async () => undefined);
    const fixture = options({
      createScenario: async (partial) => {
        partial.createdUserIds = ['11111111-1111-4111-8111-111111111111'];
        throw new Error('create failed');
      },
      cleanup,
    });
    await expect(executeHostedGate(fixture.value)).rejects.toThrow('hosted_gate_failed_at_create');
    expect(cleanup).toHaveBeenCalledWith({
      createdUserIds: ['11111111-1111-4111-8111-111111111111'],
    }, expect.any(AbortSignal));
    expect(fixture.evidenceWrites).toEqual([]);
  });

  it('cleans after a failed check and never runs evidence output', async () => {
    const fixture = options({ runChecks: async () => { throw new Error('check failed'); } });
    await expect(executeHostedGate(fixture.value)).rejects.toThrow('hosted_gate_failed_at_checks');
    expect(fixture.order).toEqual(['create', 'cleanup']);
    expect(fixture.evidenceWrites).toEqual([]);
  });

  it('bounds a stalled operation, aborts it, and still attempts cleanup', async () => {
    let observedSignal: AbortSignal | undefined;
    const fixture = options({
      timeoutMs: 20,
      runChecks: async (_scenario, signal) => {
        observedSignal = signal;
        await new Promise(() => undefined);
        return checks;
      },
    });
    await expect(executeHostedGate(fixture.value)).rejects.toThrow('hosted_gate_failed_at_checks');
    expect(observedSignal?.aborted).toBe(true);
    expect(fixture.order).toEqual(['create', 'cleanup']);
  });
});
