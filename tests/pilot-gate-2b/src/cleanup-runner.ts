import { writeCleanupMarker } from './gate-markers.js';
import {
  cleanupOperationIdsFromError,
  type CleanupOperationId,
} from './inspection.js';

export type HostedCleanupOutcome = 'cleanup_timeout' | 'cleanup_failure';

export class HostedCleanupRunnerFailure extends Error {
  constructor(
    readonly outcome: HostedCleanupOutcome,
    readonly operationIds: readonly CleanupOperationId[],
  ) {
    super(outcome);
  }
}

export async function runHostedCleanup(options: Readonly<{
  cleanup(): Promise<void>;
  wait(delayMs: number): Promise<void>;
  markerPath: string;
  maxAttempts?: number;
}>): Promise<void> {
  const maxAttempts = options.maxAttempts ?? 6;
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 10) {
    throw new HostedCleanupRunnerFailure('cleanup_failure', []);
  }
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await options.cleanup();
      await writeCleanupMarker(options.markerPath);
      return;
    } catch (error) {
      const operationIds = cleanupOperationIdsFromError(error) ?? [];
      const absenceOnly = operationIds.length === 1 && operationIds[0] === 'absence_proof';
      if (!absenceOnly) throw new HostedCleanupRunnerFailure('cleanup_failure', operationIds);
      if (attempt === maxAttempts) {
        throw new HostedCleanupRunnerFailure('cleanup_timeout', operationIds);
      }
      await options.wait(Math.min(5_000, attempt * 1_000));
    }
  }
}
