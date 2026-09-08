import type { ReadinessChecks } from './evidence.js';
import {
  hostedCheckIdFromError,
  hostedMediaStepFromError,
  hostedOwnerFinalizeOutcomeFromError,
  hostedOwnerStepFromError,
  type HostedCheckId,
  type HostedMediaStagingStep,
  type HostedOwnerFinalizeOutcome,
  type HostedOwnerHappyPathStep,
} from './checks.js';

export type MutableHostedScenario = Record<string, unknown>;

export type ExecuteHostedGateOptions = Readonly<{
  timeoutMs: number;
  cancellationGraceMs?: number;
  createScenario(partial: MutableHostedScenario, signal: AbortSignal): Promise<unknown>;
  runChecks(scenario: unknown, signal: AbortSignal): Promise<ReadinessChecks>;
}>;

export type HostedGateResult = Readonly<{ checks: ReadinessChecks }>;

export const GATE_STAGES = ['create', 'checks', 'checks_timeout', 'checks_unsettled'] as const;
export type GateStage = typeof GATE_STAGES[number];
export type HostedGateControl = Readonly<{
  gateStage: GateStage;
  check?: HostedCheckId;
  mediaStep?: HostedMediaStagingStep;
  ownerStep?: HostedOwnerHappyPathStep;
  ownerFinalizeOutcome?: HostedOwnerFinalizeOutcome;
}>;

class OperationTimeoutError extends Error {}
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
    throw new OperationTimeoutError('operation_timeout');
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

class HostedGateFailure extends Error {
  constructor(readonly control: HostedGateControl) {
    super(`hosted_gate_failed_at_${control.gateStage}`);
  }
}

function failure(
  gateStage: GateStage,
  error?: unknown,
): HostedGateFailure {
  const check = hostedCheckIdFromError(error);
  const mediaStep = hostedMediaStepFromError(error);
  const ownerStep = hostedOwnerStepFromError(error);
  const ownerFinalizeOutcome = hostedOwnerFinalizeOutcomeFromError(error);
  const control: {
    gateStage: GateStage;
    check?: HostedCheckId;
    mediaStep?: HostedMediaStagingStep;
    ownerStep?: HostedOwnerHappyPathStep;
    ownerFinalizeOutcome?: HostedOwnerFinalizeOutcome;
  } = { gateStage };
  if (check !== undefined) control.check = check;
  if (check === 'media_staging' && mediaStep !== undefined) control.mediaStep = mediaStep;
  if (check === 'owner_happy_path' && ownerStep !== undefined) control.ownerStep = ownerStep;
  if (check === 'owner_happy_path' && ownerStep === 'finalize' && ownerFinalizeOutcome !== undefined) {
    control.ownerFinalizeOutcome = ownerFinalizeOutcome;
  }
  return new HostedGateFailure(control);
}

export function hostedCheckIdFromGateError(error: unknown): HostedCheckId | undefined {
  return error instanceof HostedGateFailure ? error.control.check : undefined;
}

export function hostedGateControlFromError(error: unknown): HostedGateControl | undefined {
  return error instanceof HostedGateFailure ? error.control : undefined;
}

export async function executeHostedGate(options: ExecuteHostedGateOptions): Promise<HostedGateResult> {
  if (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 1 || options.timeoutMs > 300_000) {
    throw failure('create');
  }
  const cancellationGraceMs = options.cancellationGraceMs ??
    Math.min(5_000, Math.max(1, Math.floor(options.timeoutMs / 4)));
  if (!Number.isInteger(cancellationGraceMs) || cancellationGraceMs < 1 || cancellationGraceMs > 10_000) {
    throw failure('create');
  }

  const deadline = Date.now() + options.timeoutMs;
  const runBeforeDeadline = <T>(operation: (signal: AbortSignal) => Promise<T>) => {
    const remaining = deadline - Date.now();
    if (remaining < 1) throw new OperationTimeoutError('operation_timeout');
    return bounded(remaining, cancellationGraceMs, operation);
  };

  const partial: MutableHostedScenario = {};
  let scenario: unknown;
  try {
    scenario = await runBeforeDeadline((signal) => options.createScenario(partial, signal));
  } catch (error) {
    if (error instanceof UnsettledOperationError) throw failure('checks_unsettled');
    if (error instanceof OperationTimeoutError) throw failure('checks_timeout');
    throw failure('create');
  }

  try {
    const result = await runBeforeDeadline((signal) => options.runChecks(scenario, signal));
    return { checks: result };
  } catch (error) {
    if (error instanceof UnsettledOperationError) throw failure('checks_unsettled');
    if (error instanceof OperationTimeoutError) throw failure('checks_timeout');
    throw failure('checks', error);
  }
}
