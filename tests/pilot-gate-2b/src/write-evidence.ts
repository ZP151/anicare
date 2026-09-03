import { lstatSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { buildReadinessEvidence, hashEdgeFunctionsTree, hashMigrationHead } from './evidence.js';
import { readHostedGateEnvironment } from './environment.js';
import { readEvidencePrerequisites } from './gate-markers.js';

const repositoryRoot = resolve(import.meta.dirname, '..', '..', '..');
const evidenceDirectory = resolve(repositoryRoot, 'docs', 'evidence');
const evidencePath = resolve(evidenceDirectory, 'pilot-gate-2b-readiness.json');

async function main(): Promise<void> {
  const env = readHostedGateEnvironment(process.env);
  if (env.mode !== 'correctness') throw new Error('gate_2b_evidence_invalid');
  const checksPath = process.env.PILOT_GATE_2B_CHECKS_PATH;
  const cleanupPath = process.env.PILOT_GATE_2B_CLEANUP_PATH;
  if (!checksPath || !cleanupPath) throw new Error('gate_2b_evidence_invalid');
  const checks = await readEvidencePrerequisites(checksPath, cleanupPath);
  const evidence = buildReadinessEvidence({
    sourceCommit: env.sourceCommit,
    migrationHead: hashMigrationHead(repositoryRoot),
    edgeFunctionsTreeSha256: hashEdgeFunctionsTree(repositoryRoot),
    workflowRunId: env.workflowRunId,
    workflowRunAttempt: env.workflowRunAttempt,
    createdAt: new Date().toISOString(),
    checks,
  });
  mkdirSync(evidenceDirectory, { recursive: true });
  try {
    if (lstatSync(evidencePath).isSymbolicLink()) throw new Error('invalid_destination');
  } catch (error: unknown) {
    if (!(typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT')) throw error;
  }
  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  process.stdout.write('gate_2b_evidence_written\n');
}

main().catch(() => {
  process.stderr.write('gate_2b_evidence_write_failed\n');
  process.exitCode = 1;
});
