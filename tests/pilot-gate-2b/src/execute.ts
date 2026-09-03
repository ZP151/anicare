import type { ReadinessChecks } from './evidence.js';

export type MutableHostedScenario = Record<string, unknown>;

export type ExecuteHostedGateOptions = Readonly<{
  timeoutMs: number;
  cancellationGraceMs?: number;
  createScenario(partial: MutableHostedScenario, signal: AbortSignal): Promise<unknown>;
  runChecks(scenario: unknown, signal: AbortSignal): Promise<ReadinessChecks>;
  cleanup(scenario: unknown, signal: AbortSignal): Promise<void>;
  emitEvidence(checks: ReadinessChecks, signal: AbortSignal): Promise<void>;
}>;

export type HostedGateResult = Readonly<{
  checks: ReadinessChecks;
  cleanupPassed: true;
}>;

type Stage = 'create' | 'checks' | 'cleanup' | 'evidence';

class UnsettledOperationError extends Error {}

async function bounded<T>(
  timeoutMs: number,
  cancellationGraceMs: number,
  operation: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const work = Promise.resolve().then(() => operation(controller.signal));
  const settled = work.then(
    (value) => ({ kind: 'value' as const, value }),
    (error: unknown) => ({ kind: 'error' as const, error }),
  );
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<{ kind: 'timeout' }>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve({ kind: 'timeout' });
    }, timeoutMs);
  });
  try {
    const result = await Promise.race([settled, timeout]);
    if (result.kind === 'value') return result.value;
    if (result.kind === 'error') throw result.error;
    let graceTimer: ReturnType<typeof setTimeout> | undefined;
    const grace = new Promise<{ kind: 'unsettled' }>((resolve) => {
      graceTimer = setTimeout(() => resolve({ kind: 'unsettled' }), cancellationGraceMs);
    });
    const afterAbort = await Promise.race([settled, grace]);
    if (graceTimer !== undefined) clearTimeout(graceTimer);
    if (afterAbort.kind === 'unsettled') throw new UnsettledOperationError('operation_unsettled');
    throw new Error('timeout');
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function failure(stage: Stage): Error {
  return new Error(`hosted_gate_failed_at_${stage}`);
}

export async function executeHostedGate(options: ExecuteHostedGateOptions): Promise<HostedGateResult> {
  if (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 1 || options.timeoutMs > 300_000) {
    throw failure('create');
  }
  const cancellationGraceMs = options.cancellationGraceMs ?? Math.min(5_000, Math.max(1, Math.floor(options.timeoutMs / 4)));
  if (!Number.isInteger(cancellationGraceMs) || cancellationGraceMs < 1 || cancellationGraceMs > 10_000) {
    throw failure('create');
  }
  const deadline = Date.now() + options.timeoutMs;
  const cleanupReserveMs = Math.min(
    Math.max(1, options.timeoutMs - 1),
    Math.max(cancellationGraceMs + 1, Math.floor(options.timeoutMs / 4)),
  );
  const workDeadline = deadline - cleanupReserveMs;
  const runBefore = <T>(stageDeadline: number, operation: (signal: AbortSignal) => Promise<T>) => {
    const remaining = stageDeadline - Date.now();
    if (remaining < 1) throw new Error('timeout');
    return bounded(remaining, cancellationGraceMs, operation);
  };
  const partial: MutableHostedScenario = {};
  let scenario: unknown = partial;
  let checks: ReadinessChecks | undefined;
  let failedStage: 'create' | 'checks' | undefined;
  let unsettled = false;
  try {
    scenario = await runBefore(workDeadline, (signal) => options.createScenario(partial, signal));
    checks = await runBefore(workDeadline, (signal) => options.runChecks(scenario, signal));
  } catch (error) {
    unsettled = error instanceof UnsettledOperationError;
    failedStage = checks === undefined && scenario === partial ? 'create' : 'checks';
  }

  // An uncooperative operation may still be mutating hosted state. The parent
  // process must terminate this harness before the workflow's independent
  // durable-ledger cleanup process runs.
  if (unsettled) throw failure('cleanup');

  try {
    await runBefore(deadline, (signal) => options.cleanup(scenario, signal));
  } catch {
    throw failure('cleanup');
  }

  if (failedStage !== undefined || checks === undefined) throw failure(failedStage ?? 'checks');

  try {
    await runBefore(deadline, (signal) => options.emitEvidence(checks!, signal));
  } catch {
    throw failure('evidence');
  }
  return { checks, cleanupPassed: true };
}
