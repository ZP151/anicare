import { spawn } from 'node:child_process';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEPLOYED_FUNCTIONS, discoverPilotGate2BInputs, validatePilotGate2BInputs } from './pilot-gate-2b-inputs.mjs';

const PROJECT_REF = 'fhugdtpjbgiatqhvjioy';
const MANAGEMENT_URL = `https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth`;
const DIAGNOSTIC_PATH = path.join(tmpdir(), 'animalhelper-pilot-gate-2b-failure.log');
const SAFE_ENV = ['PATH', 'HOME', 'USERPROFILE', 'SystemRoot', 'WINDIR', 'TMP', 'TEMP', 'CI', 'GITHUB_ACTIONS'];

function invalid(code) { throw new Error(code); }

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

function defaultProcessAdapter() {
  let temporaryDirectory;
  let sourceDirectory;
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
      temporaryDirectory = await mkdtemp(path.join(tmpdir(), 'animalhelper-gate-2b-'));
      const target = path.join(temporaryDirectory, 'edge.env');
      await writeFile(target, [
        `PRECISE_LOCATION_ENCRYPTION_KEY=${values.PRECISE_LOCATION_ENCRYPTION_KEY}`,
        'MEDIA_ALLOWED_ORIGIN=https://fhugdtpjbgiatqhvjioy.supabase.co',
        'MEDIA_PUBLIC_SUPABASE_ORIGIN=https://fhugdtpjbgiatqhvjioy.supabase.co',
      ].join('\n').concat('\n'), { mode: 0o600 });
      await chmod(target, 0o600);
      return target;
    },
    async createSourceDirectory() {
      sourceDirectory = await mkdtemp(path.join(tmpdir(), 'animalhelper-gate-2b-source-'));
      return sourceDirectory;
    },
    async removeTemporaryFiles() {
      let failed = false;
      for (const directory of [temporaryDirectory, sourceDirectory]) {
        if (directory) await rm(directory, { recursive: true, force: true }).catch(() => { failed = true; });
      }
      if (failed) throw new Error('hosted_temporary_cleanup_failed');
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
  processAdapter = defaultProcessAdapter(),
  fetchAdapter = fetch,
  parentEnvironment = process.env,
  outputAdapter = process.stdout,
  discoverInputs = discoverPilotGate2BInputs,
}) {
  const initialInputs = discoverInputs(repoRoot);
  validatePilotGate2BInputs({
    repository: required(parentEnvironment, 'GITHUB_REPOSITORY'),
    eventName: required(parentEnvironment, 'GITHUB_EVENT_NAME'), ref: required(parentEnvironment, 'GITHUB_REF'),
    sha: required(parentEnvironment, 'GITHUB_SHA'), environment: required(parentEnvironment, 'GITHUB_ENVIRONMENT'),
    projectRef: PROJECT_REF,
  });
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
    await verifyPublicKeyOrigin(fetchAdapter, publicKey);
    await processAdapter.run('supabase', ['link', '--project-ref', PROJECT_REF], { cwd: sourceRoot, env: cli, timeoutMs: 60_000 });
    await processAdapter.run('supabase', ['db', 'push', '--dry-run'], { cwd: sourceRoot, env: dbCli, timeoutMs: 120_000 });
    await processAdapter.run('supabase', ['db', 'push'], { cwd: sourceRoot, env: dbCli, timeoutMs: 300_000 });
    await configureHostedAuth({ fetchAdapter, accessToken });
    edgeSecretFile = await processAdapter.writeEdgeSecretFile({ PRECISE_LOCATION_ENCRYPTION_KEY: encryptionKey });
    await processAdapter.run('supabase', ['secrets', 'set', '--env-file', edgeSecretFile, '--project-ref', PROJECT_REF],
      { cwd: sourceRoot, env: cli, timeoutMs: 60_000 });
    for (const name of DEPLOYED_FUNCTIONS) {
      await processAdapter.run('supabase', ['functions', 'deploy', name, '--project-ref', PROJECT_REF, '--use-api'],
        { cwd: sourceRoot, env: cli, timeoutMs: 120_000 });
    }
    const remoteFunctions = await processAdapter.run('supabase', [
      'functions', 'list', '--project-ref', PROJECT_REF, '--output', 'json',
    ], { cwd: sourceRoot, env: cli, timeoutMs: 60_000 });
    validateRemoteFunctionInventory(remoteFunctions.stdout);
    if (discoverInputs(sourceRoot)?.deploymentTreeSha256 !== initialInputs?.deploymentTreeSha256 ||
        discoverInputs(repoRoot)?.deploymentTreeSha256 !== initialInputs?.deploymentTreeSha256) {
      return invalid('pilot_gate_2b_source_invalid');
    }
    const harness = minimalEnvironment(parentEnvironment, {
      PILOT_GATE_2B: '1', SUPABASE_URL: 'https://fhugdtpjbgiatqhvjioy.supabase.co',
      SUPABASE_PUBLIC_KEY: publicKey, SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
      SUPABASE_DATABASE_URL: databaseUrl, PRECISE_LOCATION_ENCRYPTION_KEY: encryptionKey,
      GITHUB_SHA: parentEnvironment.GITHUB_SHA, GITHUB_RUN_ID: required(parentEnvironment, 'GITHUB_RUN_ID'),
      GITHUB_RUN_ATTEMPT: required(parentEnvironment, 'GITHUB_RUN_ATTEMPT'),
    });
    harness.PILOT_GATE_2B_LEDGER_PATH = path.join(
      tmpdir(),
      `animalhelper-pilot-gate-2b-ledger-${harness.GITHUB_RUN_ID}-${harness.GITHUB_RUN_ATTEMPT}.json`,
    );
    await processAdapter.run('pnpm', ['--filter', '@animalhelper/pilot-gate-2b', 'test:integration'],
      { cwd: repoRoot, env: harness, timeoutMs: 180_000 });
    await processAdapter.run('pnpm', ['--filter', '@animalhelper/pilot-gate-2b', 'evidence:write'],
      { cwd: repoRoot, env: harness, timeoutMs: 30_000 });
    outputAdapter.write('pilot_gate_2b_deployment_passed\n');
  } finally {
    await processAdapter.removeTemporaryFiles(edgeSecretFile);
  }
}

const entry = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (entry === fileURLToPath(import.meta.url)) {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  if (process.argv[2] === 'cleanup-diagnostic') {
    rm(DIAGNOSTIC_PATH, { force: true }).catch(() => undefined);
  } else {
    runPilotGate2B({ repoRoot }).catch(async () => {
      await writeFile(DIAGNOSTIC_PATH, '{"stage":"unknown","code":"hosted_gate_failed"}\n', { mode: 0o600 })
        .catch(() => undefined);
      process.stderr.write('pilot_gate_2b_failed\n');
      process.exitCode = 1;
    });
  }
}
