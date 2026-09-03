import { createHash, randomBytes } from 'node:crypto';
import { execFile as execFileCallback } from 'node:child_process';
import { lstatSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { lstat, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFile = promisify(execFileCallback);

const FILE = 'pilot-gate-2b-readiness.json';
const KEYS = [
  'schemaVersion', 'projectRef', 'projectOrigin', 'sourceCommit', 'migrationHead',
  'edgeFunctionsTreeSha256', 'workflowRunId', 'workflowRunAttempt', 'createdAt', 'expiresAt',
  'authRedirectCheck', 'mediaStagingCheck', 'publicKeyOriginCheck',
  'syntheticOwnerHappyPath', 'crossOwnerIsolation',
];
const CHECKS = KEYS.slice(10);
const SHA = /^[a-f0-9]{64}$/;
const COMMIT = /^[a-f0-9]{40}$/;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function invalid() { throw new Error('gate_2b_promotion_invalid'); }
function record(value) { return value && typeof value === 'object' && !Array.isArray(value); }
function exact(value, keys) {
  return record(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}
function timestamp(value) {
  if (typeof value !== 'string' || !TIMESTAMP.test(value)) return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value;
}
function validEvidence(value, requirePassed) {
  return exact(value, KEYS) && value.schemaVersion === 1 && value.projectRef === 'fhugdtpjbgiatqhvjioy' &&
    value.projectOrigin === 'https://fhugdtpjbgiatqhvjioy.supabase.co' &&
    typeof value.sourceCommit === 'string' && COMMIT.test(value.sourceCommit) &&
    exact(value.migrationHead, ['filename', 'sha256']) &&
    typeof value.migrationHead.filename === 'string' && /^\d{12,14}_[a-z0-9_]+\.sql$/.test(value.migrationHead.filename) &&
    typeof value.migrationHead.sha256 === 'string' && SHA.test(value.migrationHead.sha256) &&
    typeof value.edgeFunctionsTreeSha256 === 'string' && SHA.test(value.edgeFunctionsTreeSha256) &&
    Number.isSafeInteger(value.workflowRunId) && value.workflowRunId > 0 &&
    Number.isSafeInteger(value.workflowRunAttempt) && value.workflowRunAttempt > 0 &&
    timestamp(value.createdAt) && timestamp(value.expiresAt) &&
    CHECKS.every((key) => value[key] === 'passed' || (!requirePassed && value[key] === 'failed'));
}

async function canonicalEvidenceFile(file, requirePassed = true) {
  const link = await lstat(file).catch(() => invalid());
  if (!link.isFile() || link.isSymbolicLink() || link.size < 1 || link.size > 16 * 1024) return invalid();
  const source = await readFile(file, 'utf8');
  let value;
  try { value = JSON.parse(source); } catch { return invalid(); }
  if (!validEvidence(value, requirePassed) || source !== `${JSON.stringify(value, null, 2)}\n`) return invalid();
  return { source, value };
}

async function defaultProcessAdapter(command, args, options) {
  return await execFile(command, args, options);
}

export async function acquireVerifiedPilotGate2BArtifact({
  runId, runAttempt, temporaryRoot, sourceDigest, sourceRef, processAdapter = defaultProcessAdapter,
}) {
  if (!Number.isSafeInteger(runId) || runId < 1 || !Number.isSafeInteger(runAttempt) || runAttempt < 1 ||
      typeof temporaryRoot !== 'string' || temporaryRoot.length < 1 || typeof sourceDigest !== 'string' ||
      !COMMIT.test(sourceDigest) || !['refs/heads/codex/hosted-gate-2b', 'refs/heads/main'].includes(sourceRef)) return invalid();
  const directory = await mkdtemp(path.join(path.resolve(temporaryRoot), 'animalhelper-gate-2b-artifact-'))
    .catch(() => invalid());
  const file = path.join(directory, FILE);
  const options = { timeout: 30_000, maxBuffer: 128 * 1024, windowsHide: true };
  const artifactName = `pilot-gate-2b-readiness-${runId}-${runAttempt}`;
  try {
    const listing = await processAdapter('gh', [
      'api', '--method', 'GET',
      `repos/ZP151/anicare/actions/runs/${runId}/artifacts?name=${artifactName}&per_page=100`,
    ], options);
    let artifactListing;
    try { artifactListing = JSON.parse(listing.stdout); } catch { return invalid(); }
    const artifact = artifactListing?.artifacts?.[0];
    if (artifactListing?.total_count !== 1 || !Array.isArray(artifactListing.artifacts) ||
        artifactListing.artifacts.length !== 1 || artifact?.name !== artifactName || artifact?.expired !== false ||
        typeof artifact?.digest !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(artifact.digest) ||
        artifact?.workflow_run?.id !== runId || artifact?.workflow_run?.head_sha !== sourceDigest ||
        `refs/heads/${artifact?.workflow_run?.head_branch}` !== sourceRef) return invalid();
    await processAdapter('gh', [
      'run', 'download', String(runId), '--repo', 'ZP151/anicare', '--name',
      artifactName, '--dir', directory,
    ], options);
    await canonicalEvidenceFile(file);
    const verification = await processAdapter('gh', [
      'attestation', 'verify', file, '--repo', 'ZP151/anicare',
      '--signer-workflow', 'ZP151/anicare/.github/workflows/hosted-gate-2b.yml',
      '--signer-digest', sourceDigest, '--source-digest', sourceDigest, '--source-ref', sourceRef,
      '--predicate-type', 'https://slsa.dev/provenance/v1', '--deny-self-hosted-runners', '--no-public-good',
      '--format', 'json',
    ], options);
    let parsed;
    try { parsed = JSON.parse(verification.stdout); } catch { return invalid(); }
    if (!Array.isArray(parsed) || parsed.length < 1 || !parsed.every((item) =>
      record(item) && record(item.verificationResult))) return invalid();
    return {
      directory,
      file,
      cleanup: async () => { await rm(directory, { recursive: true, force: true }); },
    };
  } catch {
    await rm(directory, { recursive: true, force: true }).catch(() => undefined);
    return invalid();
  }
}

export async function promotePilotGate2BEvidence({ repoRoot, artifactDirectory, runMetadata, now }) {
  const entries = await readdir(artifactDirectory, { withFileTypes: true }).catch(() => invalid());
  if (entries.length !== 1 || entries[0].name !== FILE || !entries[0].isFile() || entries[0].isSymbolicLink()) return invalid();
  const artifact = await canonicalEvidenceFile(path.join(artifactDirectory, FILE));
  const evidence = artifact.value;
  const bootstrap = runMetadata?.event === 'push' && runMetadata?.ref === 'refs/heads/codex/hosted-gate-2b';
  const refresh = runMetadata?.event === 'workflow_dispatch' && runMetadata?.ref === 'refs/heads/main';
  if (runMetadata?.repository !== 'ZP151/anicare' ||
      runMetadata?.workflowPath !== '.github/workflows/hosted-gate-2b.yml' || (!bootstrap && !refresh) ||
      runMetadata?.conclusion !== 'success' || runMetadata?.headSha !== evidence.sourceCommit ||
      runMetadata?.runId !== evidence.workflowRunId || runMetadata?.runAttempt !== evidence.workflowRunAttempt ||
      runMetadata?.sourceIsAncestor !== true || runMetadata?.migrationHistoryChanged !== false ||
      JSON.stringify(runMetadata?.migrationHead) !== JSON.stringify(evidence.migrationHead) ||
      runMetadata?.edgeFunctionsTreeSha256 !== evidence.edgeFunctionsTreeSha256) return invalid();
  const current = now instanceof Date ? now : invalid();
  const currentMs = current.getTime();
  const created = new Date(evidence.createdAt).getTime();
  const expires = new Date(evidence.expiresAt).getTime();
  if (!Number.isFinite(currentMs) || currentMs < created || currentMs >= expires || expires - created !== 72 * 60 * 60 * 1000) {
    return invalid();
  }
  const destination = path.resolve(repoRoot, 'docs', 'evidence', FILE);
  try {
    await canonicalEvidenceFile(destination, false);
  } catch (error) {
    if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) {
      const exists = await lstat(destination).then(() => true).catch((candidate) => candidate?.code !== 'ENOENT');
      if (exists) return invalid();
    }
  }
  const temporary = `${destination}.tmp-${randomBytes(8).toString('hex')}`;
  try {
    await writeFile(temporary, artifact.source, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    await rename(temporary, destination);
  } catch {
    return invalid();
  }
}

function currentInputs(repoRoot) {
  const migrations = path.join(repoRoot, 'supabase', 'migrations');
  const filename = readdirSync(migrations).filter((name) => /^\d{12,14}_[a-z0-9_]+\.sql$/.test(name)).sort().at(-1);
  if (!filename) return invalid();
  const migrationPath = path.join(migrations, filename);
  const migrationLink = lstatSync(migrationPath);
  if (!migrationLink.isFile() || migrationLink.isSymbolicLink()) return invalid();
  const migrationHead = { filename, sha256: createHash('sha256').update(readFileSync(migrationPath)).digest('hex') };

  const functions = realpathSync(path.join(repoRoot, 'supabase', 'functions'));
  const files = [];
  const walk = (directory) => {
    for (const name of readdirSync(directory).sort()) {
      if (['node_modules', 'dist', '.turbo'].includes(name)) continue;
      const target = path.join(directory, name);
      const link = lstatSync(target);
      if (link.isSymbolicLink()) return invalid();
      if (link.isDirectory()) walk(realpathSync(target));
      else if (link.isFile() && link.size <= 2 * 1024 * 1024) files.push(realpathSync(target));
      else return invalid();
    }
  };
  walk(functions);
  files.sort((left, right) => path.relative(functions, left).replaceAll('\\', '/').localeCompare(
    path.relative(functions, right).replaceAll('\\', '/')));
  const tree = createHash('sha256');
  tree.update('animalhelper-edge-functions-tree-v1\0');
  let total = 0;
  for (const file of files) {
    const name = path.relative(functions, file).replaceAll('\\', '/');
    const bytes = readFileSync(file); total += bytes.byteLength;
    if (total > 32 * 1024 * 1024 || !statSync(file).isFile()) return invalid();
    tree.update(`${Buffer.byteLength(name)}:${name}\0${bytes.byteLength}:`); tree.update(bytes); tree.update('\0');
  }
  return { migrationHead, edgeFunctionsTreeSha256: tree.digest('hex') };
}

async function cli() {
  const runIdText = process.argv[2];
  const attemptText = process.argv[3];
  if (!/^[1-9][0-9]*$/.test(runIdText ?? '') || !/^[1-9][0-9]*$/.test(attemptText ?? '')) return invalid();
  const runId = Number(runIdText); const runAttempt = Number(attemptText);
  if (!Number.isSafeInteger(runId) || !Number.isSafeInteger(runAttempt)) return invalid();
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const { stdout } = await execFile('gh', ['api', '--method', 'GET', `repos/ZP151/anicare/actions/runs/${runId}`], {
    cwd: repoRoot, timeout: 15_000, maxBuffer: 128 * 1024, windowsHide: true,
  });
  const remote = JSON.parse(stdout);
  if (remote.id !== runId || remote.run_attempt !== runAttempt || remote.status !== 'completed' ||
      remote.conclusion !== 'success' || remote.path !== '.github/workflows/hosted-gate-2b.yml' ||
      remote.repository?.full_name !== 'ZP151/anicare' || remote.head_repository?.full_name !== 'ZP151/anicare') return invalid();
  const sourceRef = `refs/heads/${remote.head_branch}`;
  const acquired = await acquireVerifiedPilotGate2BArtifact({
    runId, runAttempt, temporaryRoot: tmpdir(),
    sourceDigest: remote.head_sha, sourceRef,
  });
  try {
  const artifact = await canonicalEvidenceFile(acquired.file);
  const source = artifact.value.sourceCommit;
  let sourceIsAncestor = true;
  try {
    await execFile('git', ['merge-base', '--is-ancestor', source, 'HEAD'], { cwd: repoRoot, timeout: 10_000, windowsHide: true });
  } catch { sourceIsAncestor = false; }
  const diff = await execFile('git', ['diff', '--name-only', source, 'HEAD', '--', 'supabase/migrations'], {
    cwd: repoRoot, timeout: 10_000, maxBuffer: 64 * 1024, windowsHide: true,
  });
  const inputs = currentInputs(repoRoot);
  await promotePilotGate2BEvidence({
    repoRoot, artifactDirectory: acquired.directory, now: new Date(),
    runMetadata: {
      repository: remote.repository?.full_name, workflowPath: remote.path,
      headSha: remote.head_sha, runId: remote.id, runAttempt: remote.run_attempt,
      conclusion: remote.conclusion, event: remote.event, ref: sourceRef,
      sourceIsAncestor, migrationHistoryChanged: diff.stdout.trim().length > 0,
      migrationHead: inputs.migrationHead, edgeFunctionsTreeSha256: inputs.edgeFunctionsTreeSha256,
    },
  });
  process.stdout.write('gate_2b_evidence_promoted\n');
  } finally {
    await acquired.cleanup();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  cli().catch(() => { process.stderr.write('gate_2b_promotion_invalid\n'); process.exitCode = 1; });
}
