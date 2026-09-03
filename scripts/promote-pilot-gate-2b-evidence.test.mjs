import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  acquireVerifiedPilotGate2BArtifact,
  promotePilotGate2BEvidence,
} from './promote-pilot-gate-2b-evidence.mjs';

function evidence() {
  return {
    schemaVersion: 1, projectRef: 'fhugdtpjbgiatqhvjioy',
    projectOrigin: 'https://fhugdtpjbgiatqhvjioy.supabase.co', sourceCommit: 'a'.repeat(40),
    migrationHead: { filename: '202608310010_my_reports_projection.sql', sha256: 'b'.repeat(64) },
    edgeFunctionsTreeSha256: 'c'.repeat(64), workflowRunId: 123, workflowRunAttempt: 1,
    createdAt: '2026-09-03T01:00:00.000Z', expiresAt: '2026-09-06T01:00:00.000Z',
    authRedirectCheck: 'passed', mediaStagingCheck: 'passed', publicKeyOriginCheck: 'passed',
    syntheticOwnerHappyPath: 'passed', crossOwnerIsolation: 'passed',
  };
}

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'gate-2b-promotion-'));
  const artifactDirectory = path.join(root, 'artifact');
  await mkdir(artifactDirectory);
  await mkdir(path.join(root, 'docs', 'evidence'), { recursive: true });
  const value = evidence();
  await writeFile(path.join(artifactDirectory, 'pilot-gate-2b-readiness.json'), `${JSON.stringify(value, null, 2)}\n`);
  return {
    repoRoot: root, artifactDirectory,
    runMetadata: {
      repository: 'ZP151/anicare', workflowPath: '.github/workflows/hosted-gate-2b.yml',
      headSha: value.sourceCommit, runId: 123, runAttempt: 1, conclusion: 'success',
      event: 'push', ref: 'refs/heads/codex/hosted-gate-2b', sourceIsAncestor: true,
      migrationHistoryChanged: false, migrationHead: value.migrationHead,
      edgeFunctionsTreeSha256: value.edgeFunctionsTreeSha256,
    },
    now: new Date('2026-09-03T02:00:00.000Z'),
    cleanup: () => rm(root, { recursive: true, force: true }),
    destination: path.join(root, 'docs', 'evidence', 'pilot-gate-2b-readiness.json'),
  };
}

test('rejects evidence from the wrong workflow before replacing the fixed file', async () => {
  const item = await fixture();
  try {
    await assert.rejects(promotePilotGate2BEvidence({
      ...item, runMetadata: { ...item.runMetadata, workflowPath: '.github/workflows/other.yml' },
    }), /gate_2b_promotion_invalid/);
    assert.deepEqual(await readdir(path.dirname(item.destination)), []);
  } finally { await item.cleanup(); }
});

test('promotes only canonical current successful evidence atomically', async () => {
  const item = await fixture();
  try {
    await promotePilotGate2BEvidence(item);
    assert.equal(await readFile(item.destination, 'utf8'), `${JSON.stringify(evidence(), null, 2)}\n`);
    assert.deepEqual((await readdir(path.dirname(item.destination))).sort(), ['pilot-gate-2b-readiness.json']);
  } finally { await item.cleanup(); }
});

test('rejects extra artifact files, noncanonical JSON, and stale or failed checks', async () => {
  for (const mutation of ['extra', 'noncanonical', 'failed', 'expired']) {
    const item = await fixture();
    try {
      const file = path.join(item.artifactDirectory, 'pilot-gate-2b-readiness.json');
      if (mutation === 'extra') await writeFile(path.join(item.artifactDirectory, 'extra.txt'), 'x');
      if (mutation === 'noncanonical') await writeFile(file, JSON.stringify(evidence()));
      if (mutation === 'failed') await writeFile(file, `${JSON.stringify({ ...evidence(), crossOwnerIsolation: 'failed' }, null, 2)}\n`);
      const now = mutation === 'expired' ? new Date('2026-09-06T01:00:00.001Z') : item.now;
      await assert.rejects(promotePilotGate2BEvidence({ ...item, now }), /gate_2b_promotion_invalid/);
    } finally { await item.cleanup(); }
  }
});

test('rejects run identity, source ancestry, and deployed-input mismatch', async () => {
  for (const change of [
    { repository: 'attacker/repo' }, { runId: 124 }, { runAttempt: 2 }, { conclusion: 'failure' },
    { headSha: 'd'.repeat(40) }, { sourceIsAncestor: false }, { migrationHistoryChanged: true },
    { edgeFunctionsTreeSha256: 'd'.repeat(64) },
  ]) {
    const item = await fixture();
    try {
      await assert.rejects(promotePilotGate2BEvidence({
        ...item, runMetadata: { ...item.runMetadata, ...change },
      }), /gate_2b_promotion_invalid/);
    } finally { await item.cleanup(); }
  }
});

test('downloads the exact run-attempt artifact and verifies its attestation before use', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'gate-2b-acquire-'));
  const calls = [];
  const processAdapter = async (command, args) => {
    calls.push([command, ...args]);
    if (args[0] === 'api') return { stdout: JSON.stringify({
      total_count: 1,
      artifacts: [{
        name: 'pilot-gate-2b-readiness-123-1', expired: false, digest: `sha256:${'d'.repeat(64)}`,
        workflow_run: { id: 123, head_sha: 'a'.repeat(40), head_branch: 'codex/hosted-gate-2b' },
      }],
    }) };
    if (args[0] === 'run') {
      const directory = args[args.indexOf('--dir') + 1];
      await writeFile(path.join(directory, 'pilot-gate-2b-readiness.json'), `${JSON.stringify(evidence(), null, 2)}\n`);
    }
    return { stdout: args[0] === 'attestation' ? '[{"verificationResult":{"statement":{}}}]' : '' };
  };
  try {
    const acquired = await acquireVerifiedPilotGate2BArtifact({
      runId: 123, runAttempt: 1, temporaryRoot: root, processAdapter,
      sourceDigest: 'a'.repeat(40), sourceRef: 'refs/heads/codex/hosted-gate-2b',
    });
    assert.equal(path.dirname(acquired.file), acquired.directory);
    assert.deepEqual(calls, [
      ['gh', 'api', '--method', 'GET',
        'repos/ZP151/anicare/actions/runs/123/artifacts?name=pilot-gate-2b-readiness-123-1&per_page=100'],
      ['gh', 'run', 'download', '123', '--repo', 'ZP151/anicare', '--name',
        'pilot-gate-2b-readiness-123-1', '--dir', acquired.directory],
      ['gh', 'attestation', 'verify', acquired.file, '--repo', 'ZP151/anicare',
        '--signer-workflow', 'ZP151/anicare/.github/workflows/hosted-gate-2b.yml',
        '--signer-digest', 'a'.repeat(40), '--source-digest', 'a'.repeat(40),
        '--source-ref', 'refs/heads/codex/hosted-gate-2b',
        '--predicate-type', 'https://slsa.dev/provenance/v1', '--deny-self-hosted-runners', '--no-public-good',
        '--format', 'json'],
    ]);
    await acquired.cleanup();
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('fails closed when attestation verification is absent or malformed', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'gate-2b-acquire-invalid-'));
  const processAdapter = async (_command, args) => {
    if (args[0] === 'api') return { stdout: JSON.stringify({
      total_count: 1,
      artifacts: [{
        name: 'pilot-gate-2b-readiness-123-1', expired: false, digest: `sha256:${'d'.repeat(64)}`,
        workflow_run: { id: 123, head_sha: 'a'.repeat(40), head_branch: 'codex/hosted-gate-2b' },
      }],
    }) };
    if (args[0] === 'run') {
      const directory = args[args.indexOf('--dir') + 1];
      await writeFile(path.join(directory, 'pilot-gate-2b-readiness.json'), `${JSON.stringify(evidence(), null, 2)}\n`);
    }
    return { stdout: '[]' };
  };
  try {
    await assert.rejects(acquireVerifiedPilotGate2BArtifact({
      runId: 123, runAttempt: 1, temporaryRoot: root, processAdapter,
      sourceDigest: 'a'.repeat(40), sourceRef: 'refs/heads/codex/hosted-gate-2b',
    }), /gate_2b_promotion_invalid/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
