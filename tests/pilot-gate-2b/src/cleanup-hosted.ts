import { lstat } from 'node:fs/promises';

import { readCleanupLedger, removeCleanupLedger } from './cleanup-ledger.js';
import { readHostedGateEnvironment } from './environment.js';
import { cleanupHostedScenario } from './inspection.js';

async function main(): Promise<void> {
  const ledgerPath = process.env.PILOT_GATE_2B_LEDGER_PATH;
  if (!ledgerPath) throw new Error('cleanup_ledger_invalid');
  const exists = await lstat(ledgerPath).then(() => true).catch((error: unknown) => {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return false;
    throw new Error('cleanup_ledger_invalid');
  });
  if (!exists) return;
  const ledger = await readCleanupLedger(ledgerPath);
  const env = readHostedGateEnvironment(process.env);
  await cleanupHostedScenario(env, ledger);
  await removeCleanupLedger(ledgerPath);
  process.stdout.write('hosted_cleanup_passed\n');
}

main().catch(() => {
  process.stderr.write('hosted_cleanup_failed\n');
  process.exitCode = 1;
});
