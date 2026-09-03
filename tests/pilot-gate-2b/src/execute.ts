import type { ReadinessChecks } from './evidence.js';
import {
  hostedCheckIdFromError, hostedMediaStepFromError, hostedOwnerStepFromError, type HostedCheckId,
  type HostedMediaStagingStep, type HostedOwnerHappyPathStep,
} from './checks.js';
import { cleanupOperationIdsFromError, type CleanupOperationId } from './inspection.js';

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

export const GATE_STAGES = ['create', 'checks', 'cleanup', 'evidence'] as const;
export type GateStage = typeof GATE_STAGES[number];
export type HostedGateControl = Readonly<{
  gateStage: GateStage;
  check?: HostedCheckId;
  mediaStep?: HostedMediaStagingStep;
  ownerStep?: HostedOwnerHappyPathStep;
  cleanup?: readonly CleanupOperationId[];
}>;

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

class HostedGateFailure extends Error {
  constructor(readonly control: HostedGateControl) {
    super(`hosted_gate_failed_at_${control.gateStage}`);
  }
}

function failure(
  gateStage: GateStage,
  check?: HostedCheckId,
  cleanup?: readonly CleanupOperationId[],
  mediaStep?: HostedMediaStagingStep,
  ownerStep?: HostedOwnerHappyPathStep,
): HostedGateFailure {
  const control: {
    gateStage: GateStage; check?: HostedCheckId; mediaStep?: HostedMediaStagingStep;
    ownerStep?: HostedOwnerHappyPathStep;
    cleanup?: readonly CleanupOperationId[];
  } = { gateStage };
  if (check !== undefined) control.check = check;
  if (check === 'media_staging' && mediaStep !== undefined) control.mediaStep = mediaStep;
  if (check === 'owner_happy_path' && ownerStep !== undefined) control.ownerStep = ownerStep;
  if (cleanup !== undefined && cleanup.length > 0) control.cleanup = cleanup;
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
  let failedCheckId: HostedCheckId | undefined;
  let failedMediaStep: HostedMediaStagingStep | undefined;
  let failedOwnerStep: HostedOwnerHappyPathStep | undefined;
  let unsettled = false;
  try {
    scenario = await runBefore(workDeadline, (signal) => options.createScenario(partial, signal));
    checks = await runBefore(workDeadline, (signal) => options.runChecks(scenario, signal));
  } catch (error) {
    unsettled = error instanceof UnsettledOperationError;
    failedStage = checks === undefined && scenario === partial ? 'create' : 'checks';
    if (failedStage === 'checks') {
      failedCheckId = hostedCheckIdFromError(error);
      failedMediaStep = hostedMediaStepFromError(error);
      failedOwnerStep = hostedOwnerStepFromError(error);
    }
  }

  // An uncooperative operation may still be mutating hosted state. The parent
  // process must terminate this harness before the workflow's independent
  // durable-ledger cleanup process runs.
  if (unsettled) throw failure('cleanup', failedCheckId, undefined, failedMediaStep, failedOwnerStep);

  try {
    await runBefore(deadline, (signal) => options.cleanup(scenario, signal));
  } catch (error) {
    throw failure('cleanup', failedCheckId, cleanupOperationIdsFromError(error), failedMediaStep, failedOwnerStep);
  }

  if (failedStage !== undefined || checks === undefined) {
    throw failure(failedStage ?? 'checks', failedCheckId, undefined, failedMediaStep, failedOwnerStep);
  }

  try {
    await runBefore(deadline, (signal) => options.emitEvidence(checks!, signal));
  } catch {
    throw failure('evidence');
  }
  return { checks, cleanupPassed: true };
}
