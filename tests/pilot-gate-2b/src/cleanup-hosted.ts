import { lstat } from 'node:fs/promises';

import { readCleanupLedger, removeCleanupLedger } from './cleanup-ledger.js';
import { HostedCleanupRunnerFailure, runHostedCleanup } from './cleanup-runner.js';
import { readHostedGateEnvironment } from './environment.js';
import { cleanupHostedScenario } from './inspection.js';

async function main(): Promise<void> {
  const ledgerPath = process.env.PILOT_GATE_2B_LEDGER_PATH;
  if (!ledgerPath) throw new Error('cleanup_ledger_invalid');
  const markerPath = process.env.PILOT_GATE_2B_CLEANUP_PATH;
  if (!markerPath) throw new Error('hosted_gate_marker_invalid');
  const exists = await lstat(ledgerPath).then(() => true).catch((error: unknown) => {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return false;
    throw new Error('cleanup_ledger_invalid');
  });
  if (!exists) return;
  const ledger = await readCleanupLedger(ledgerPath);
  const env = readHostedGateEnvironment(process.env);
  await runHostedCleanup({
    cleanup: async () => cleanupHostedScenario(env, ledger),
    wait: async (delayMs) => await new Promise((resolve) => setTimeout(resolve, delayMs)),
    markerPath,
  });
  await removeCleanupLedger(ledgerPath);
  process.stdout.write('hosted_cleanup_passed\n');
}

main().catch((error: unknown) => {
  const outcome = error instanceof HostedCleanupRunnerFailure ? error.outcome : 'cleanup_failure';
  process.stderr.write(`${outcome}\n`);
  process.exitCode = 1;
});
