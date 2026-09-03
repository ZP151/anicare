import { afterEach, describe, expect, it, vi } from 'vitest';

import { HostedCheckFailure } from './checks.js';
import type { ReadinessChecks } from './evidence.js';
import {
  executeHostedGate,
  hostedCheckIdFromGateError,
  hostedGateControlFromError,
  type ExecuteHostedGateOptions,
} from './execute.js';

const checks: ReadinessChecks = {
  authRedirectCheck: 'passed',
  mediaStagingCheck: 'passed',
  publicKeyOriginCheck: 'passed',
  syntheticOwnerHappyPath: 'passed',
  crossOwnerIsolation: 'passed',
};

function options(overrides: Partial<ExecuteHostedGateOptions> = {}): ExecuteHostedGateOptions {
  return {
    timeoutMs: 1_000,
    createScenario: async () => ({ createdUserIds: [] }),
    runChecks: async () => checks,
    ...overrides,
  };
}

afterEach(() => vi.useRealTimers());

describe('hosted correctness execution', () => {
  it('runs creation and checks serially without owning cleanup or evidence', async () => {
    const order: string[] = [];

    await expect(executeHostedGate(options({
      createScenario: async () => { order.push('create'); return {}; },
      runChecks: async () => { order.push('checks'); return checks; },
    }))).resolves.toEqual({ checks });

    expect(order).toEqual(['create', 'checks']);
  });

  it('keeps a partial-fixture creation failure in the create stage', async () => {
    const execution = executeHostedGate(options({
      createScenario: async (partial) => {
        partial.createdUserIds = ['11111111-1111-4111-8111-111111111111'];
        throw new Error('hostile fixture detail');
      },
    }));

    await expect(execution).rejects.toThrow('hosted_gate_failed_at_create');
    await execution.catch((error: unknown) => {
      expect(hostedGateControlFromError(error)).toEqual({ gateStage: 'create' });
    });
  });

  it('preserves only typed fixed check diagnostics', async () => {
    const execution = executeHostedGate(options({
      runChecks: async () => {
        throw new HostedCheckFailure(
          'owner_happy_path', undefined, 'finalize', 'http_503_service_unavailable',
        );
      },
    }));

    await execution.catch((error: unknown) => {
      expect(hostedCheckIdFromGateError(error)).toBe('owner_happy_path');
      expect(hostedGateControlFromError(error)).toEqual({
        gateStage: 'checks',
        check: 'owner_happy_path',
        ownerStep: 'finalize',
        ownerFinalizeOutcome: 'http_503_service_unavailable',
      });
    });
  });

  it('classifies cooperative cancellation at the shared deadline as checks_timeout', async () => {
    vi.useFakeTimers();
    const startedAt = Date.now();
    let abortedAt: number | undefined;
    const execution = executeHostedGate(options({
      timeoutMs: 100,
      cancellationGraceMs: 10,
      runChecks: async (_scenario, signal) => await new Promise<ReadinessChecks>((_resolve, reject) => {
        signal.addEventListener('abort', () => {
          abortedAt = Date.now();
          reject(new Error('cancelled'));
        }, { once: true });
      }),
    }));

    const assertion = execution.catch((error: unknown) => {
      expect(hostedGateControlFromError(error)).toEqual({ gateStage: 'checks_timeout' });
    });
    await vi.advanceTimersByTimeAsync(100);
    await assertion;
    expect(abortedAt).toBe(startedAt + 100);
  });

  it('classifies work that ignores cancellation as checks_unsettled', async () => {
    vi.useFakeTimers();
    const execution = executeHostedGate(options({
      timeoutMs: 100,
      cancellationGraceMs: 10,
      runChecks: async () => await new Promise<ReadinessChecks>(() => undefined),
    }));

    const assertion = execution.catch((error: unknown) => {
      expect(hostedGateControlFromError(error)).toEqual({ gateStage: 'checks_unsettled' });
    });
    await vi.advanceTimersByTimeAsync(110);
    await assertion;
  });

  it('uses the full correctness deadline without reserving time for another process', async () => {
    vi.useFakeTimers();
    const startedAt = Date.now();
    let abortedAt: number | undefined;
    const execution = executeHostedGate(options({
      timeoutMs: 100_000,
      cancellationGraceMs: 1,
      runChecks: async (_scenario, signal) => await new Promise<ReadinessChecks>((_resolve, reject) => {
        signal.addEventListener('abort', () => {
          abortedAt = Date.now();
          reject(new Error('cancelled'));
        }, { once: true });
      }),
    }));

    const assertion = expect(execution).rejects.toThrow('hosted_gate_failed_at_checks_timeout');
    await vi.advanceTimersByTimeAsync(100_000);
    await assertion;
    expect(abortedAt).toBe(startedAt + 100_000);
  });
});
