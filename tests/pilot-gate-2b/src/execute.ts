import type { ReadinessChecks } from './evidence.js';

export type MutableHostedScenario = Record<string, unknown>;

export type ExecuteHostedGateOptions = Readonly<{
  timeoutMs: number;
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

async function bounded<T>(timeoutMs: number, operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error('timeout'));
    }, timeoutMs);
  });
  try {
    return await Promise.race([operation(controller.signal), timeout]);
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
  const partial: MutableHostedScenario = {};
  let scenario: unknown = partial;
  let checks: ReadinessChecks | undefined;
  let failedStage: 'create' | 'checks' | undefined;
  try {
    scenario = await bounded(options.timeoutMs, (signal) => options.createScenario(partial, signal));
    checks = await bounded(options.timeoutMs, (signal) => options.runChecks(scenario, signal));
  } catch {
    failedStage = checks === undefined && scenario === partial ? 'create' : 'checks';
  }

  try {
    await bounded(options.timeoutMs, (signal) => options.cleanup(scenario, signal));
  } catch {
    throw failure('cleanup');
  }

  if (failedStage !== undefined || checks === undefined) throw failure(failedStage ?? 'checks');

  try {
    await bounded(options.timeoutMs, (signal) => options.emitEvidence(checks!, signal));
  } catch {
    throw failure('evidence');
  }
  return { checks, cleanupPassed: true };
}
