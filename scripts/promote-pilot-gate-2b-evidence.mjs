import { createHash, randomBytes } from 'node:crypto';
import { execFile as execFileCallback } from 'node:child_process';
import { lstatSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { lstat, readFile, readdir, rename, writeFile } from 'node:fs/promises';
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
  const artifactDirectory = process.argv[2];
  const runIdText = process.argv[3];
  const attemptText = process.argv[4];
  if (!artifactDirectory || !/^[1-9][0-9]*$/.test(runIdText ?? '') || !/^[1-9][0-9]*$/.test(attemptText ?? '')) return invalid();
  const runId = Number(runIdText); const runAttempt = Number(attemptText);
  if (!Number.isSafeInteger(runId) || !Number.isSafeInteger(runAttempt)) return invalid();
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const { stdout } = await execFile('gh', ['api', `repos/ZP151/anicare/actions/runs/${runId}`], {
    cwd: repoRoot, timeout: 15_000, maxBuffer: 128 * 1024, windowsHide: true,
  });
  const remote = JSON.parse(stdout);
  if (remote.id !== runId || remote.run_attempt !== runAttempt) return invalid();
  const artifact = await canonicalEvidenceFile(path.resolve(artifactDirectory, FILE));
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
    repoRoot, artifactDirectory: path.resolve(artifactDirectory), now: new Date(),
    runMetadata: {
      repository: remote.repository?.full_name, workflowPath: remote.path,
      headSha: remote.head_sha, runId: remote.id, runAttempt: remote.run_attempt,
      conclusion: remote.conclusion, event: remote.event, ref: `refs/heads/${remote.head_branch}`,
      sourceIsAncestor, migrationHistoryChanged: diff.stdout.trim().length > 0,
      migrationHead: inputs.migrationHead, edgeFunctionsTreeSha256: inputs.edgeFunctionsTreeSha256,
    },
  });
  process.stdout.write('gate_2b_evidence_promoted\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  cli().catch(() => { process.stderr.write('gate_2b_promotion_invalid\n'); process.exitCode = 1; });
}
