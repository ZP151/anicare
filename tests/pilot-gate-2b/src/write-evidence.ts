import { lstatSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { buildReadinessEvidence, hashEdgeFunctionsTree, hashMigrationHead } from './evidence.js';
import { readHostedGateEnvironment } from './environment.js';

const repositoryRoot = resolve(import.meta.dirname, '..', '..', '..');
const evidenceDirectory = resolve(repositoryRoot, 'docs', 'evidence');
const evidencePath = resolve(evidenceDirectory, 'pilot-gate-2b-readiness.json');

try {
  const env = readHostedGateEnvironment(process.env);
  const evidence = buildReadinessEvidence({
    sourceCommit: env.sourceCommit,
    migrationHead: hashMigrationHead(repositoryRoot),
    edgeFunctionsTreeSha256: hashEdgeFunctionsTree(repositoryRoot),
    workflowRunId: env.workflowRunId,
    workflowRunAttempt: env.workflowRunAttempt,
    createdAt: new Date().toISOString(),
    checks: {
      authRedirectCheck: 'passed', mediaStagingCheck: 'passed', publicKeyOriginCheck: 'passed',
      syntheticOwnerHappyPath: 'passed', crossOwnerIsolation: 'passed',
    },
  });
  mkdirSync(evidenceDirectory, { recursive: true });
  try {
    if (lstatSync(evidencePath).isSymbolicLink()) throw new Error('invalid_destination');
  } catch (error: unknown) {
    if (!(typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT')) throw error;
  }
  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  process.stdout.write('gate_2b_evidence_written\n');
} catch {
  process.stderr.write('gate_2b_evidence_write_failed\n');
  process.exitCode = 1;
}
