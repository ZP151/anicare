import { spawn } from 'node:child_process';
import { chmod, lstat, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEPLOYED_FUNCTIONS, discoverPilotGate2BInputs, validatePilotGate2BInputs } from './pilot-gate-2b-inputs.mjs';

const PROJECT_REF = 'fhugdtpjbgiatqhvjioy';
const MANAGEMENT_URL = `https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth`;
const EDGE_RUNTIME_DIGEST = 'public.ecr.aws/supabase/edge-runtime@sha256:3775cdbe86dab8cd7495157af69377dfedf208ba3cb4165031b58ed691514c22';
const EDGE_RUNTIME_TAG = 'public.ecr.aws/supabase/edge-runtime:v1.73.0';
const DIAGNOSTIC_PATH = path.join(tmpdir(), 'animalhelper-pilot-gate-2b-failure.log');
const SAFE_ENV = ['PATH', 'HOME', 'USERPROFILE', 'SystemRoot', 'WINDIR', 'TMP', 'TEMP', 'CI', 'GITHUB_ACTIONS'];
const PRODUCER_STAGES = new Set([
  'environment_validation', 'source_verification', 'docker_bundler_verification', 'public_key_origin', 'supabase_link',
  'database_dry_run', 'database_push', 'auth_configuration', 'edge_secret_configuration',
  'function_deployment', 'function_inventory', 'source_reverification', 'hosted_checks', 'evidence_write',
  'temporary_cleanup',
]);
const HOSTED_CHECK_IDS = new Set([
  'auth_redirect', 'public_origin', 'owner_happy_path', 'media_staging', 'cross_owner_isolation',
]);
const HOSTED_MEDIA_STAGING_STEPS = new Set([
  'prerequisite_state', 'bucket_configuration', 'stranger_reservation', 'isolation_snapshot',
  'isolation_jobs', 'isolation_assets', 'isolation_objects', 'isolation_validation',
  'privacy_read_actual', 'privacy_read_unknown', 'privacy_read_equivalence', 'privacy_list',
  'isolation_compare', 'owner_unchanged',
]);
const HOSTED_OWNER_HAPPY_PATH_STEPS = new Set([
  'ledger_media', 'reserve', 'ledger_reserve', 'upload', 'finalize',
  'ledger_asset', 'inspect', 'replay', 'verify',
]);
const HOSTED_OWNER_FINALIZE_OUTCOMES = new Set([
  'network',
  'http_401_authentication_required',
  'http_403_media_not_found_or_forbidden',
  'http_403_unclassified',
  'http_409_media_finalization_conflict',
  'http_503_service_unavailable',
  'http_other',
  'invalid_response',
]);
const GATE_STAGES = new Set(['create', 'checks', 'cleanup', 'evidence']);
const CLEANUP_OPERATION_IDS = [
  'setup', 'recover_auth', 'recover_sighting', 'storage_remove', 'jobs_delete', 'assets_delete',
  'sightings_delete', 'profiles_delete', 'auth_delete', 'absence_proof', 'connection_close',
];
const CLEANUP_OPERATION_SET = new Set(CLEANUP_OPERATION_IDS);
const HOSTED_CHECK_DIAGNOSTIC_FILENAME = 'hosted-check-diagnostic.json';
const MAX_CANONICAL_HOSTED_GATE_CONTROL_BYTES = 320;

function invalid(code) { throw new Error(code); }

function normalizeHostedGateControl(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const candidate = value;
  const keys = Object.keys(candidate);
  if (!Object.hasOwn(candidate, 'gateStage') || keys.some((key) => !['gateStage', 'check', 'mediaStep', 'ownerStep', 'ownerFinalizeOutcome', 'cleanup'].includes(key)) ||
      typeof candidate.gateStage !== 'string' || !GATE_STAGES.has(candidate.gateStage)) return undefined;
  const control = { gateStage: candidate.gateStage };
  if (Object.hasOwn(candidate, 'check')) {
    if ((candidate.gateStage !== 'checks' && candidate.gateStage !== 'cleanup') ||
        typeof candidate.check !== 'string' || !HOSTED_CHECK_IDS.has(candidate.check)) return undefined;
    control.check = candidate.check;
  }
  if (Object.hasOwn(candidate, 'mediaStep')) {
    if (control.check !== 'media_staging' || typeof candidate.mediaStep !== 'string' ||
        !HOSTED_MEDIA_STAGING_STEPS.has(candidate.mediaStep)) return undefined;
    control.mediaStep = candidate.mediaStep;
  }
  if (Object.hasOwn(candidate, 'ownerStep')) {
    if (control.check !== 'owner_happy_path' || typeof candidate.ownerStep !== 'string' ||
        !HOSTED_OWNER_HAPPY_PATH_STEPS.has(candidate.ownerStep)) return undefined;
    control.ownerStep = candidate.ownerStep;
  }
  if (Object.hasOwn(candidate, 'ownerFinalizeOutcome')) {
    if (control.check !== 'owner_happy_path' || control.ownerStep !== 'finalize' ||
        typeof candidate.ownerFinalizeOutcome !== 'string' ||
        !HOSTED_OWNER_FINALIZE_OUTCOMES.has(candidate.ownerFinalizeOutcome)) return undefined;
    control.ownerFinalizeOutcome = candidate.ownerFinalizeOutcome;
  }
  if (Object.hasOwn(candidate, 'cleanup')) {
    if (candidate.gateStage !== 'cleanup' || !Array.isArray(candidate.cleanup) || candidate.cleanup.length < 1 ||
        candidate.cleanup.length > CLEANUP_OPERATION_IDS.length || new Set(candidate.cleanup).size !== candidate.cleanup.length ||
        candidate.cleanup.some((item) => typeof item !== 'string' || !CLEANUP_OPERATION_SET.has(item))) return undefined;
    const ordered = CLEANUP_OPERATION_IDS.filter((item) => candidate.cleanup.includes(item));
    if (ordered.length !== candidate.cleanup.length || !candidate.cleanup.every((item, index) => item === ordered[index])) {
      return undefined;
    }
    control.cleanup = ordered;
  }
  let source = `${JSON.stringify(control)}\n`;
  if (Buffer.byteLength(source, 'utf8') > MAX_CANONICAL_HOSTED_GATE_CONTROL_BYTES &&
      control.ownerFinalizeOutcome !== undefined) {
    delete control.ownerFinalizeOutcome;
    source = `${JSON.stringify(control)}\n`;
  }
  if (Buffer.byteLength(source, 'utf8') > MAX_CANONICAL_HOSTED_GATE_CONTROL_BYTES) return undefined;
  return control;
}

export function buildProducerFailureDiagnostic(stage, control) {
  const safeStage = typeof stage === 'string' && PRODUCER_STAGES.has(stage) ? stage : 'unknown';
  const safeControl = safeStage === 'hosted_checks' ? normalizeHostedGateControl(control) : undefined;
  const diagnostic = { stage: safeStage, code: 'hosted_gate_failed' };
  if (safeControl !== undefined) {
    diagnostic.gateStage = safeControl.gateStage;
    if (safeControl.check !== undefined) diagnostic.check = safeControl.check;
    if (safeControl.mediaStep !== undefined) diagnostic.mediaStep = safeControl.mediaStep;
    if (safeControl.ownerStep !== undefined) diagnostic.ownerStep = safeControl.ownerStep;
    if (safeControl.ownerFinalizeOutcome !== undefined) diagnostic.ownerFinalizeOutcome = safeControl.ownerFinalizeOutcome;
    if (safeControl.cleanup !== undefined) diagnostic.cleanup = safeControl.cleanup;
  }
  return `${JSON.stringify(diagnostic)}\n`;
}

export function hostedCheckDiagnosticPath({ temporaryRoot = tmpdir(), runId, runAttempt }) {
  const directory = ownedTemporaryDirectory(temporaryRoot, runId, runAttempt);
  const target = path.resolve(directory, HOSTED_CHECK_DIAGNOSTIC_FILENAME);
  if (path.dirname(target) !== directory || path.basename(target) !== HOSTED_CHECK_DIAGNOSTIC_FILENAME) {
    return invalid('hosted_temporary_cleanup_failed');
  }
  return target;
}

export async function readHostedGateControl({ temporaryRoot = tmpdir(), runId, runAttempt }) {
  const target = hostedCheckDiagnosticPath({ temporaryRoot, runId, runAttempt });
  const metadata = await lstat(target).catch(() => undefined);
  if (!metadata || !metadata.isFile() || metadata.isSymbolicLink() || metadata.size < 1 ||
      metadata.size > MAX_CANONICAL_HOSTED_GATE_CONTROL_BYTES) return undefined;
  const source = await readFile(target, 'utf8').catch(() => undefined);
  if (typeof source !== 'string') return undefined;
  let value;
  try { value = JSON.parse(source); } catch { return undefined; }
  const control = normalizeHostedGateControl(value);
  return control !== undefined && source === `${JSON.stringify(control)}\n` ? control : undefined;
}

async function boundedFetch(fetchAdapter, url, init, timeoutMs = 10_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchAdapter(url, { ...init, signal: controller.signal, redirect: 'error' });
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!response.ok || response.redirected || bytes.byteLength > 64 * 1024) return invalid('hosted_auth_invalid');
    return JSON.parse(Buffer.from(bytes).toString('utf8'));
  } catch {
    return invalid('hosted_auth_invalid');
  } finally { clearTimeout(timer); }
}

async function verifyPublicKeyOrigin(fetchAdapter, publicKey) {
  const value = await boundedFetch(fetchAdapter,
    'https://fhugdtpjbgiatqhvjioy.supabase.co/auth/v1/settings',
    { method: 'GET', headers: { apikey: publicKey } });
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid('hosted_public_origin_invalid');
}

export async function configureHostedAuth({ fetchAdapter = fetch, accessToken }) {
  if (typeof accessToken !== 'string' || accessToken.length < 1 || /[\r\n\0\s]/.test(accessToken)) {
    return invalid('hosted_auth_invalid');
  }
  const headers = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };
  const body = JSON.stringify({ site_url: 'animalhelper://', uri_allow_list: 'animalhelper://auth/callback' });
  await boundedFetch(fetchAdapter, MANAGEMENT_URL, { method: 'PATCH', headers, body });
  const readback = await boundedFetch(fetchAdapter, MANAGEMENT_URL, { method: 'GET', headers });
  if (!readback || typeof readback !== 'object' || readback.site_url !== 'animalhelper://' ||
      readback.uri_allow_list !== 'animalhelper://auth/callback') return invalid('hosted_auth_invalid');
}

function minimalEnvironment(parent, additions = {}) {
  const result = { NO_COLOR: '1', SUPABASE_TELEMETRY_DISABLED: '1' };
  for (const key of SAFE_ENV) {
    const value = parent[key];
    if (typeof value === 'string' && value.length > 0 && !/[\r\n\0]/.test(value)) result[key] = value;
  }
  return { ...result, ...additions };
}

function runSelector(value) {
  if (typeof value !== 'string' || !/^[1-9][0-9]{0,19}$/.test(value)) {
    return invalid('hosted_temporary_cleanup_failed');
  }
  return value;
}

function ownedTemporaryDirectory(temporaryRoot, runId, runAttempt) {
  const root = path.resolve(temporaryRoot);
  const target = path.resolve(root, `animalhelper-gate-2b-${runSelector(runId)}-${runSelector(runAttempt)}`);
  if (path.dirname(target) !== root) return invalid('hosted_temporary_cleanup_failed');
  return target;
}

export async function cleanupRunnerTemporary({ temporaryRoot = tmpdir(), runId, runAttempt }) {
  const target = ownedTemporaryDirectory(temporaryRoot, runId, runAttempt);
  let metadata;
  try {
    metadata = await lstat(target);
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    return invalid('hosted_temporary_cleanup_failed');
  }
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) return invalid('hosted_temporary_cleanup_failed');
  await rm(target, { recursive: true, force: false }).catch(() => invalid('hosted_temporary_cleanup_failed'));
}

export function createDefaultProcessAdapter({ runId, runAttempt, temporaryRoot }) {
  const temporaryDirectory = ownedTemporaryDirectory(temporaryRoot, runId, runAttempt);
  const sourceDirectory = path.join(temporaryDirectory, 'source');
  const secretDirectory = path.join(temporaryDirectory, 'secret');
  let created = false;
  const ensureTemporaryDirectory = async () => {
    if (!created) {
      await mkdir(temporaryDirectory, { mode: 0o700 });
      created = true;
    }
  };
  return {
    async run(command, args, options) {
      return await new Promise((resolve, reject) => {
        const child = spawn(command, args, {
          cwd: options.cwd, env: options.env, shell: false, windowsHide: true,
          detached: process.platform !== 'win32',
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        const stdout = []; const stderr = []; let bytes = 0;
        const collect = (target) => (chunk) => {
          bytes += chunk.length;
          if (bytes <= 128 * 1024) target.push(Buffer.from(chunk));
        };
        child.stdout.on('data', collect(stdout)); child.stderr.on('data', collect(stderr));
        const timer = setTimeout(() => {
          if (process.platform !== 'win32' && child.pid) {
            try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); }
          } else child.kill('SIGKILL');
        }, options.timeoutMs);
        child.on('error', reject);
        child.on('exit', (code) => {
          clearTimeout(timer);
          if (code !== 0) reject(new Error('hosted_process_failed'));
          else resolve({ stdout: Buffer.concat(stdout).toString('utf8'), stderr: Buffer.concat(stderr).toString('utf8') });
        });
      });
    },
    async writeEdgeSecretFile(values) {
      await ensureTemporaryDirectory();
      await mkdir(secretDirectory, { mode: 0o700 });
      const target = path.join(secretDirectory, 'edge.env');
      await writeFile(target, [
        `PRECISE_LOCATION_ENCRYPTION_KEY=${values.PRECISE_LOCATION_ENCRYPTION_KEY}`,
        'MEDIA_ALLOWED_ORIGIN=https://fhugdtpjbgiatqhvjioy.supabase.co',
        'MEDIA_PUBLIC_SUPABASE_ORIGIN=https://fhugdtpjbgiatqhvjioy.supabase.co',
      ].join('\n').concat('\n'), { mode: 0o600 });
      await chmod(target, 0o600);
      return target;
    },
    async createSourceDirectory() {
      await ensureTemporaryDirectory();
      await mkdir(sourceDirectory, { mode: 0o700 });
      return sourceDirectory;
    },
    async removeTemporaryFiles() {
      await cleanupRunnerTemporary({ temporaryRoot, runId, runAttempt });
    },
  };
}

function required(parent, name) {
  const value = parent[name];
  if (typeof value !== 'string' || value.length < 1 || value !== value.trim() || /[\r\n\0]/.test(value)) {
    return invalid('pilot_gate_2b_environment_invalid');
  }
  return value;
}

function jwtRole(value) {
  const parts = value.split('.');
  if (parts.length !== 3 || parts.some((part) => !/^[A-Za-z0-9_-]+$/.test(part))) return null;
  try {
    const payloadBytes = Buffer.from(parts[1], 'base64url');
    if (payloadBytes.byteLength < 2 || payloadBytes.byteLength > 4096) return null;
    const payload = JSON.parse(payloadBytes.toString('utf8'));
    return payload && typeof payload === 'object' && !Array.isArray(payload) && typeof payload.role === 'string'
      ? payload.role
      : null;
  } catch { return null; }
}

export function validHostedApiKeys(publicKey, serviceRoleKey) {
  if (typeof publicKey !== 'string' || typeof serviceRoleKey !== 'string' || publicKey === serviceRoleKey ||
      /\s/.test(publicKey) || /\s/.test(serviceRoleKey)) return false;
  const validPublic = (publicKey.startsWith('sb_publishable_') && publicKey.length > 'sb_publishable_'.length) ||
    jwtRole(publicKey) === 'anon';
  const validService = (serviceRoleKey.startsWith('sb_secret_') && serviceRoleKey.length > 'sb_secret_'.length) ||
    jwtRole(serviceRoleKey) === 'service_role';
  return validPublic && validService;
}

export function validateRemoteFunctionInventory(source) {
  let value;
  try { value = JSON.parse(source); } catch { return invalid('remote_functions_invalid'); }
  if (!Array.isArray(value) || value.length !== DEPLOYED_FUNCTIONS.length || value.some((item) =>
    !item || typeof item !== 'object' || Array.isArray(item) || typeof item.id !== 'string' ||
    typeof item.slug !== 'string' || item.status !== 'ACTIVE')) return invalid('remote_functions_invalid');
  const actual = value.map((item) => item.slug).sort();
  if (new Set(actual).size !== actual.length || JSON.stringify(actual) !== JSON.stringify([...DEPLOYED_FUNCTIONS].sort())) {
    return invalid('remote_functions_invalid');
  }
}

function databasePassword(databaseUrl) {
  let parsed;
  try { parsed = new URL(databaseUrl); } catch { return invalid('pilot_gate_2b_environment_invalid'); }
  if (parsed.protocol !== 'postgresql:' || parsed.username !== `postgres.${PROJECT_REF}` || !parsed.password ||
      parsed.hostname !== 'aws-0-ap-southeast-1.pooler.supabase.com' || parsed.port !== '5432' ||
      parsed.pathname !== '/postgres' || parsed.search || parsed.hash) return invalid('pilot_gate_2b_environment_invalid');
  return decodeURIComponent(parsed.password);
}

export async function runPilotGate2B({
  repoRoot,
  processAdapter,
  fetchAdapter = fetch,
  parentEnvironment = process.env,
  outputAdapter = process.stdout,
  discoverInputs = discoverPilotGate2BInputs,
  stageAdapter = { enter: () => undefined },
  temporaryRoot = tmpdir(),
}) {
  stageAdapter.enter('environment_validation');
  const initialInputs = discoverInputs(repoRoot);
  validatePilotGate2BInputs({
    repository: required(parentEnvironment, 'GITHUB_REPOSITORY'),
    eventName: required(parentEnvironment, 'GITHUB_EVENT_NAME'), ref: required(parentEnvironment, 'GITHUB_REF'),
    sha: required(parentEnvironment, 'GITHUB_SHA'), environment: required(parentEnvironment, 'GITHUB_ENVIRONMENT'),
    projectRef: PROJECT_REF,
  });
  const runId = runSelector(required(parentEnvironment, 'GITHUB_RUN_ID'));
  const runAttempt = runSelector(required(parentEnvironment, 'GITHUB_RUN_ATTEMPT'));
  processAdapter ??= createDefaultProcessAdapter({ runId, runAttempt, temporaryRoot });
  const accessToken = required(parentEnvironment, 'SUPABASE_ACCESS_TOKEN');
  const databaseUrl = required(parentEnvironment, 'SUPABASE_DATABASE_URL');
  const dbPassword = databasePassword(databaseUrl);
  const serviceRoleKey = required(parentEnvironment, 'SUPABASE_SERVICE_ROLE_KEY');
  const publicKey = required(parentEnvironment, 'SUPABASE_PUBLIC_KEY');
  const encryptionKey = required(parentEnvironment, 'PRECISE_LOCATION_ENCRYPTION_KEY');
  if (!validHostedApiKeys(publicKey, serviceRoleKey) || !/^[A-Za-z0-9+/]{43}=$/.test(encryptionKey) ||
      Buffer.from(encryptionKey, 'base64').byteLength !== 32) {
    return invalid('pilot_gate_2b_environment_invalid');
  }
  const base = minimalEnvironment(parentEnvironment);
  const cli = minimalEnvironment(parentEnvironment, { SUPABASE_ACCESS_TOKEN: accessToken });
  const dbCli = minimalEnvironment(parentEnvironment, { SUPABASE_ACCESS_TOKEN: accessToken, SUPABASE_DB_PASSWORD: dbPassword });
  let edgeSecretFile;
  let sourceRoot;
  try {
    stageAdapter.enter('source_verification');
    const head = await processAdapter.run('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, env: base, timeoutMs: 10_000 });
    if (head?.stdout?.trim() !== parentEnvironment.GITHUB_SHA) return invalid('pilot_gate_2b_sha_invalid');
    const status = await processAdapter.run('git', ['status', '--porcelain=v1', '--untracked-files=all'], {
      cwd: repoRoot, env: base, timeoutMs: 10_000,
    });
    if (status?.stdout?.length !== 0) return invalid('pilot_gate_2b_source_invalid');
    sourceRoot = await processAdapter.createSourceDirectory();
    const archive = path.join(sourceRoot, 'source.tar');
    await processAdapter.run('git', ['archive', '--format=tar', `--output=${archive}`, parentEnvironment.GITHUB_SHA], {
      cwd: repoRoot, env: base, timeoutMs: 30_000,
    });
    await processAdapter.run('tar', ['--extract', '--file', archive, '--directory', sourceRoot], {
      cwd: repoRoot, env: base, timeoutMs: 30_000,
    });
    const immutableInputs = discoverInputs(sourceRoot);
    if (initialInputs?.deploymentTreeSha256 !== immutableInputs?.deploymentTreeSha256) {
      return invalid('pilot_gate_2b_source_invalid');
    }
    stageAdapter.enter('docker_bundler_verification');
    await processAdapter.run('docker', ['info', '--format', '{{.ServerVersion}}'], {
      cwd: sourceRoot, env: base, timeoutMs: 30_000,
    });
    await processAdapter.run('docker', ['pull', EDGE_RUNTIME_DIGEST], {
      cwd: sourceRoot, env: base, timeoutMs: 120_000,
    });
    await processAdapter.run('docker', ['image', 'tag', EDGE_RUNTIME_DIGEST, EDGE_RUNTIME_TAG], {
      cwd: sourceRoot, env: base, timeoutMs: 10_000,
    });
    const functionsRoot = path.join(sourceRoot, 'supabase', 'functions');
    await processAdapter.run('docker', [
      'run', '--rm', '-e', 'DENO_NO_PACKAGE_JSON=1', '--mount',
      `type=bind,src=${functionsRoot},dst=/work/functions,readonly`, EDGE_RUNTIME_DIGEST,
      'bundle', '--entrypoint', '/work/functions/cleanup-legacy-media/index.ts', '--output', '/tmp/probe.eszip',
    ], { cwd: sourceRoot, env: base, timeoutMs: 180_000 });
    stageAdapter.enter('public_key_origin');
    await verifyPublicKeyOrigin(fetchAdapter, publicKey);
    stageAdapter.enter('supabase_link');
    await processAdapter.run('supabase', ['link', '--project-ref', PROJECT_REF], { cwd: sourceRoot, env: cli, timeoutMs: 60_000 });
    stageAdapter.enter('database_dry_run');
    await processAdapter.run('supabase', ['db', 'push', '--dry-run'], { cwd: sourceRoot, env: dbCli, timeoutMs: 120_000 });
    stageAdapter.enter('database_push');
    await processAdapter.run('supabase', ['db', 'push'], { cwd: sourceRoot, env: dbCli, timeoutMs: 300_000 });
    stageAdapter.enter('auth_configuration');
    await configureHostedAuth({ fetchAdapter, accessToken });
    stageAdapter.enter('edge_secret_configuration');
    edgeSecretFile = await processAdapter.writeEdgeSecretFile({ PRECISE_LOCATION_ENCRYPTION_KEY: encryptionKey });
    await processAdapter.run('supabase', ['secrets', 'set', '--env-file', edgeSecretFile, '--project-ref', PROJECT_REF],
      { cwd: sourceRoot, env: cli, timeoutMs: 60_000 });
    stageAdapter.enter('function_deployment');
    for (const name of DEPLOYED_FUNCTIONS) {
      await processAdapter.run('supabase', ['functions', 'deploy', name, '--project-ref', PROJECT_REF, '--use-docker'],
        { cwd: sourceRoot, env: cli, timeoutMs: 120_000 });
    }
    stageAdapter.enter('function_inventory');
    const remoteFunctions = await processAdapter.run('supabase', [
      'functions', 'list', '--project-ref', PROJECT_REF, '--output', 'json',
    ], { cwd: sourceRoot, env: cli, timeoutMs: 60_000 });
    validateRemoteFunctionInventory(remoteFunctions.stdout);
    stageAdapter.enter('source_reverification');
    if (discoverInputs(sourceRoot)?.deploymentTreeSha256 !== initialInputs?.deploymentTreeSha256 ||
        discoverInputs(repoRoot)?.deploymentTreeSha256 !== initialInputs?.deploymentTreeSha256) {
      return invalid('pilot_gate_2b_source_invalid');
    }
    const harness = minimalEnvironment(parentEnvironment, {
      PILOT_GATE_2B: '1', SUPABASE_URL: 'https://fhugdtpjbgiatqhvjioy.supabase.co',
      SUPABASE_PUBLIC_KEY: publicKey, SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
      SUPABASE_DATABASE_URL: databaseUrl, PRECISE_LOCATION_ENCRYPTION_KEY: encryptionKey,
      GITHUB_SHA: parentEnvironment.GITHUB_SHA, GITHUB_RUN_ID: runId,
      GITHUB_RUN_ATTEMPT: runAttempt,
    });
    harness.PILOT_GATE_2B_LEDGER_PATH = path.join(
      tmpdir(),
      `animalhelper-pilot-gate-2b-ledger-${harness.GITHUB_RUN_ID}-${harness.GITHUB_RUN_ATTEMPT}.json`,
    );
    harness.PILOT_GATE_2B_CHECK_DIAGNOSTIC_PATH = hostedCheckDiagnosticPath({ temporaryRoot, runId, runAttempt });
    stageAdapter.enter('hosted_checks');
    try {
      await processAdapter.run('pnpm', ['--filter', '@animalhelper/pilot-gate-2b', 'test:integration'],
        { cwd: repoRoot, env: harness, timeoutMs: 180_000 });
    } catch (error) {
      const control = await readHostedGateControl({ temporaryRoot, runId, runAttempt });
      if (control !== undefined && typeof stageAdapter.control === 'function') stageAdapter.control(control);
      throw error;
    }
    stageAdapter.enter('evidence_write');
    await processAdapter.run('pnpm', ['--filter', '@animalhelper/pilot-gate-2b', 'evidence:write'],
      { cwd: repoRoot, env: harness, timeoutMs: 30_000 });
    outputAdapter.write('pilot_gate_2b_deployment_passed\n');
  } finally {
    try {
      await processAdapter.removeTemporaryFiles(edgeSecretFile);
    } catch (error) {
      stageAdapter.enter('temporary_cleanup');
      throw error;
    }
  }
}

const entry = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (entry === fileURLToPath(import.meta.url)) {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  if (process.argv[2] === 'cleanup-diagnostic') {
    let failed = false;
    await cleanupRunnerTemporary({
      runId: process.env.GITHUB_RUN_ID,
      runAttempt: process.env.GITHUB_RUN_ATTEMPT,
    }).catch(() => { failed = true; });
    await rm(DIAGNOSTIC_PATH, { force: true }).catch(() => { failed = true; });
    if (failed) {
      process.stderr.write('pilot_gate_2b_local_cleanup_failed\n');
      process.exitCode = 1;
    }
  } else {
    let diagnosticStage = 'unknown';
    let diagnosticControl;
    runPilotGate2B({
      repoRoot,
      stageAdapter: {
        enter: (stage) => { diagnosticStage = PRODUCER_STAGES.has(stage) ? stage : 'unknown'; },
        control: (control) => { diagnosticControl = normalizeHostedGateControl(control); },
      },
    }).catch(async () => {
      await writeFile(DIAGNOSTIC_PATH, buildProducerFailureDiagnostic(diagnosticStage, diagnosticControl), { mode: 0o600 })
        .catch(() => undefined);
      process.stderr.write('pilot_gate_2b_failed\n');
      process.exitCode = 1;
    });
  }
}
