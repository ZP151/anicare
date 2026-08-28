import { spawn } from 'node:child_process';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { performance } from 'node:perf_hooks';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildPilotGate2ATestArgs,
  discoverPilotGate2AInputs,
  READINESS_TEST,
  validatePilotGate2AInputs,
} from './pilot-gate-2a-inputs.mjs';

const EXPECTED_PROJECT_ID = 'animalhelper';
const EDGE_ENV_FILENAME = 'edge.env';
const EDGE_TEMP_PREFIX = 'animalhelper-pilot-gate-2a-';
const FAILURE_DIAGNOSTIC_FILENAME = 'animalhelper-pilot-gate-2a-failure.log';
const MAX_CAPTURE_BYTES = 256 * 1024;
const MAX_DIAGNOSTIC_LINES = 80;
const MAX_DIAGNOSTIC_LINE_LENGTH = 240;
const MAX_STATUS_BYTES = 128 * 1024;
const PROCESS_TERM_GRACE_MS = 350;
const PROCESS_KILL_CONFIRM_MS = 1_500;
const PROCESS_OUTPUT_DRAIN_MS = 100;
const TASKKILL_DEADLINE_MS = 1_000;

export const FIXED_PRECISE_LOCATION_ENCRYPTION_KEY = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';

const SAFE_PARENT_ENVIRONMENT_KEYS = Object.freeze([
  'PATH',
  'Path',
  'PATHEXT',
  'SystemRoot',
  'SYSTEMROOT',
  'WINDIR',
  'COMSPEC',
  'HOME',
  'USERPROFILE',
  'APPDATA',
  'LOCALAPPDATA',
  'XDG_CONFIG_HOME',
  'XDG_RUNTIME_DIR',
  'TMPDIR',
  'TMP',
  'TEMP',
  'DOCKER_HOST',
  'DOCKER_CONTEXT',
  'DOCKER_CONFIG',
  'PNPM_HOME',
  'COREPACK_HOME',
  'CI',
  'GITHUB_ACTIONS',
  'LANG',
  'LC_ALL',
]);

const STAGE_TIMEOUTS = Object.freeze({
  start: 10 * 60_000,
  status: 60_000,
  pgtap: 5 * 60_000,
  lint: 2 * 60_000,
  readiness: 60_000,
  integration: 15 * 60_000,
  stop: 2 * 60_000,
});

class StageFailure extends Error {
  constructor(stage, captured = null) {
    super(`Pilot Gate 2A failed at ${stage}.`);
    this.name = 'StageFailure';
    this.stage = stage;
    this.captured = captured;
  }
}

function minimumChildEnvironment(parentEnvironment, additions = {}) {
  const environment = {};
  const seenCaseInsensitive = new Set();
  for (const key of SAFE_PARENT_ENVIRONMENT_KEYS) {
    const normalized = process.platform === 'win32' ? key.toLowerCase() : key;
    if (seenCaseInsensitive.has(normalized)) continue;
    const value = parentEnvironment[key];
    if (typeof value !== 'string' || value.length === 0 || /[\r\n\0]/.test(value)) continue;
    environment[key] = value;
    seenCaseInsensitive.add(normalized);
  }
  environment.NO_COLOR = '1';
  environment.SUPABASE_TELEMETRY_DISABLED = '1';
  for (const [key, value] of Object.entries(additions)) {
    environment[key] = value;
  }
  return environment;
}

function createBoundedCollector(stream) {
  const chunks = [];
  let byteLength = 0;
  let truncated = false;
  const collect = (chunk) => {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    const remaining = MAX_CAPTURE_BYTES - byteLength;
    if (remaining > 0) {
      const retained = bytes.subarray(0, remaining);
      chunks.push(retained);
      byteLength += retained.byteLength;
    }
    if (bytes.byteLength > remaining) truncated = true;
  };
  stream?.on('data', collect);
  return {
    snapshot() {
      return { text: Buffer.concat(chunks).toString('utf8'), truncated };
    },
    stop() {
      stream?.removeListener('data', collect);
      stream?.destroy();
    },
  };
}

function waitForChildExit(child) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (exitCode) => {
      if (settled) return;
      settled = true;
      resolve(Number.isInteger(exitCode) ? exitCode : 1);
    };
    if (child.exitCode !== null || child.signalCode !== null) {
      finish(child.exitCode);
      return;
    }
    child.once('exit', finish);
    child.once('error', () => finish(1));
  });
}

function delayResult(milliseconds, result) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(result), milliseconds);
    timer.unref?.();
  });
}

function cleanupDelayResult(milliseconds, result) {
  return new Promise((resolve) => setTimeout(() => resolve(result), milliseconds));
}

async function withCleanupDeadline(promise, milliseconds, fallback) {
  let timer;
  const deadline = new Promise((resolve) => {
    timer = setTimeout(() => resolve(fallback), milliseconds);
  });
  try {
    return await Promise.race([promise, deadline]);
  } finally {
    clearTimeout(timer);
  }
}

function waitForStreamEnd(stream) {
  if (!stream || stream.readableEnded || stream.destroyed) return Promise.resolve();
  return new Promise((resolve) => {
    const finish = () => {
      stream.removeListener('end', finish);
      stream.removeListener('error', finish);
      stream.removeListener('close', finish);
      resolve();
    };
    stream.once('end', finish);
    stream.once('error', finish);
    stream.once('close', finish);
  });
}

async function drainCapturedOutput(child) {
  await withCleanupDeadline(
    Promise.all([waitForStreamEnd(child.stdout), waitForStreamEnd(child.stderr)]),
    PROCESS_OUTPUT_DRAIN_MS,
    undefined,
  );
}

function signalPosixProcessGroup(pid, signal) {
  try {
    process.kill(-pid, signal);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ESRCH') return;
    throw error;
  }
}

function posixProcessGroupExists(pid) {
  try {
    process.kill(-pid, 0);
    return true;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ESRCH') return false;
    throw error;
  }
}

function taskkillExecutable() {
  const windowsRoot = process.env.SystemRoot ?? process.env.WINDIR;
  return windowsRoot ? path.join(windowsRoot, 'System32', 'taskkill.exe') : 'taskkill.exe';
}

async function runTaskkill(pid, force) {
  let killer;
  try {
    killer = spawn(
      taskkillExecutable(),
      ['/PID', String(pid), '/T', ...(force ? ['/F'] : [])],
      {
        env: minimumChildEnvironment(process.env),
        shell: false,
        stdio: 'ignore',
        windowsHide: true,
      },
    );
  } catch {
    return false;
  }
  const exitPromise = waitForChildExit(killer);
  const result = await withCleanupDeadline(
    exitPromise.then((exitCode) => ({ exitCode, timedOut: false })),
    TASKKILL_DEADLINE_MS,
    { exitCode: 1, timedOut: true },
  );
  if (result.timedOut) {
    try {
      killer.kill('SIGKILL');
    } catch {
      // A timed-out supervisor is treated as a fixed termination failure.
    }
    await withCleanupDeadline(exitPromise, PROCESS_TERM_GRACE_MS, 1);
  }
  return !result.timedOut && result.exitCode === 0;
}

async function successfulWindowsTreeKill(windowsTreeKill, pid, force) {
  try {
    return await withCleanupDeadline(
      Promise.resolve().then(() => windowsTreeKill(pid, force)).then((result) => result === true),
      TASKKILL_DEADLINE_MS + PROCESS_TERM_GRACE_MS,
      false,
    );
  } catch {
    return false;
  }
}

async function waitForProcessGroupGone(pid, processGroupExists) {
  const deadline = Date.now() + PROCESS_KILL_CONFIRM_MS;
  while (true) {
    try {
      if (!await processGroupExists(pid)) return true;
    } catch {
      return false;
    }
    const remaining = deadline - Date.now();
    if (remaining <= 0) return false;
    await cleanupDelayResult(Math.min(25, remaining), undefined);
  }
}

async function terminateProcessTree(child, exitPromise, supervisor) {
  if (!Number.isSafeInteger(child.pid) || child.pid <= 0) return false;

  if (supervisor.platform === 'win32') {
    const gracefulSupervision = await successfulWindowsTreeKill(supervisor.windowsTreeKill, child.pid, false);
    await cleanupDelayResult(PROCESS_TERM_GRACE_MS, undefined);
    const forcedSupervision = await successfulWindowsTreeKill(supervisor.windowsTreeKill, child.pid, true);
    const leaderExited = await withCleanupDeadline(
      exitPromise.then(() => true),
      PROCESS_KILL_CONFIRM_MS,
      false,
    );
    return (gracefulSupervision || forcedSupervision) && leaderExited;
  }

  let supervisionSucceeded = true;
  try {
    await supervisor.signalProcessGroup(child.pid, 'SIGTERM');
  } catch {
    supervisionSucceeded = false;
  }
  await cleanupDelayResult(PROCESS_TERM_GRACE_MS, undefined);

  let groupExists = true;
  try {
    groupExists = await supervisor.processGroupExists(child.pid);
  } catch {
    supervisionSucceeded = false;
  }
  if (groupExists) {
    try {
      await supervisor.signalProcessGroup(child.pid, 'SIGKILL');
    } catch {
      supervisionSucceeded = false;
    }
  }

  const [groupGone, leaderExited] = await Promise.all([
    waitForProcessGroupGone(child.pid, supervisor.processGroupExists),
    withCleanupDeadline(exitPromise.then(() => true), PROCESS_KILL_CONFIRM_MS, false),
  ]);
  return supervisionSucceeded && groupGone && leaderExited;
}

function cancellationResult(signal) {
  let remove = () => {};
  const promise = new Promise((resolve) => {
    const cancelled = () => resolve({ kind: 'cancelled', exitCode: 1 });
    if (signal?.aborted) {
      cancelled();
      return;
    }
    signal?.addEventListener('abort', cancelled, { once: true });
    remove = () => signal?.removeEventListener('abort', cancelled);
  });
  return { promise, remove };
}

export function createSystemProcessAdapter({
  platform = process.platform,
  windowsTreeKill = runTaskkill,
  signalProcessGroup = signalPosixProcessGroup,
  processGroupExists = posixProcessGroupExists,
} = {}) {
  const supervisor = { platform, windowsTreeKill, signalProcessGroup, processGroupExists };
  return {
    async capture(command, args, { cwd, env, signal, timeoutMs }) {
      let child;
      try {
        child = spawn(command, args, {
          cwd,
          env,
          shell: false,
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true,
          detached: platform !== 'win32',
        });
      } catch {
        return { exitCode: 1, stdout: '', stderr: '', truncated: false };
      }
      const stdout = createBoundedCollector(child.stdout);
      const stderr = createBoundedCollector(child.stderr);
      const exitPromise = waitForChildExit(child);
      const cancellation = cancellationResult(signal);
      const outcome = await Promise.race([
        exitPromise.then((exitCode) => ({ kind: 'exit', exitCode })),
        cancellation.promise,
        delayResult(timeoutMs, { kind: 'timeout', exitCode: 1 }),
      ]);
      cancellation.remove();
      let terminationConfirmed = true;
      if (outcome.kind !== 'exit') {
        terminationConfirmed = await terminateProcessTree(child, exitPromise, supervisor);
      }
      await drainCapturedOutput(child);
      const out = stdout.snapshot();
      const err = stderr.snapshot();
      stdout.stop();
      stderr.stop();
      return {
        exitCode: outcome.kind === 'exit' ? outcome.exitCode : 1,
        stdout: out.text,
        stderr: err.text,
        truncated: out.truncated || err.truncated || outcome.kind === 'timeout' || !terminationConfirmed,
        terminationConfirmed,
      };
    },

    async start(command, args, { cwd, env, signal }) {
      let child;
      try {
        child = spawn(command, args, {
          cwd,
          env,
          shell: false,
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true,
          detached: platform !== 'win32',
        });
      } catch {
        throw new Error('child process failed to start');
      }
      const stdout = createBoundedCollector(child.stdout);
      const stderr = createBoundedCollector(child.stderr);
      const exitPromise = waitForChildExit(child);
      let terminationPromise = null;
      const requestTermination = () => {
        terminationPromise ??= terminateProcessTree(child, exitPromise, supervisor);
        return terminationPromise;
      };
      const onAbort = () => {
        void requestTermination();
      };
      signal?.addEventListener('abort', onAbort, { once: true });

      await new Promise((resolve, reject) => {
        child.once('spawn', resolve);
        child.once('error', () => reject(new Error('child process failed to start')));
      });

      return {
        isRunning() {
          return child.exitCode === null && child.signalCode === null;
        },
        snapshot() {
          const out = stdout.snapshot();
          const err = stderr.snapshot();
          return {
            stdout: out.text,
            stderr: err.text,
            truncated: out.truncated || err.truncated,
          };
        },
        async stop() {
          signal?.removeEventListener('abort', onAbort);
          const confirmed = await requestTermination();
          await drainCapturedOutput(child);
          stdout.stop();
          stderr.stop();
          if (!confirmed) throw new Error('process tree termination failed');
        },
      };
    },
  };
}

function parseStatusLine(line) {
  const quoted = line.match(/^([A-Z][A-Z0-9_]*)="([^"\r\n]*)"$/);
  const unquoted = line.match(/^([A-Z][A-Z0-9_]*)=([^\s"'`\\]+)$/);
  const match = quoted ?? unquoted;
  if (!match) throw new StageFailure('status-validation');
  const value = match[2];
  if (value.length === 0 || value.length > 8192 || /[\r\n\0]/.test(value)) {
    throw new StageFailure('status-validation');
  }
  return [match[1], value];
}

function exactLocalApiUrl(value) {
  try {
    const url = new URL(value);
    return (
      value === 'http://127.0.0.1:54321' &&
      url.protocol === 'http:' &&
      url.hostname === '127.0.0.1' &&
      url.port === '54321' &&
      url.username === '' &&
      url.password === '' &&
      url.pathname === '/' &&
      url.search === '' &&
      url.hash === ''
    );
  } catch {
    return false;
  }
}

function exactLocalDatabaseUrl(value) {
  try {
    const url = new URL(value);
    return (
      value === 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' &&
      url.protocol === 'postgresql:' &&
      url.username === 'postgres' &&
      url.password === 'postgres' &&
      url.hostname === '127.0.0.1' &&
      url.port === '54322' &&
      url.pathname === '/postgres' &&
      url.search === '' &&
      url.hash === ''
    );
  } catch {
    return false;
  }
}

function boundedCredential(value) {
  return typeof value === 'string' && value.length >= 16 && value.length <= 8192 && !/\s|[\r\n\0]/.test(value);
}

export function parseSupabaseStatusEnvironment(output) {
  if (typeof output !== 'string' || Buffer.byteLength(output, 'utf8') > MAX_STATUS_BYTES || output.includes('\0')) {
    throw new StageFailure('status-validation');
  }
  const values = new Map();
  for (const line of output.split(/\r?\n/)) {
    if (line.length === 0) continue;
    const [name, value] = parseStatusLine(line);
    if (values.has(name)) throw new StageFailure('status-validation');
    values.set(name, value);
  }

  const apiUrl = values.get('API_URL');
  const anonKey = values.get('ANON_KEY');
  const serviceRoleKey = values.get('SERVICE_ROLE_KEY');
  const databaseUrl = values.get('DB_URL');
  if (
    !exactLocalApiUrl(apiUrl) ||
    !exactLocalDatabaseUrl(databaseUrl) ||
    !boundedCredential(anonKey) ||
    !boundedCredential(serviceRoleKey) ||
    anonKey === serviceRoleKey
  ) {
    throw new StageFailure('status-validation');
  }

  return {
    apiUrl,
    anonKey,
    serviceRoleKey,
    databaseUrl,
    maskValues: [...new Set(values.values())],
  };
}

function safeProjectConfigPreamble(config) {
  const lines = config.split(/\r?\n/);
  const preamble = [];
  for (const line of lines) {
    if (/^\s*\[/.test(line)) break;
    preamble.push(line);
  }
  return preamble;
}

async function validateProjectId(repoRoot) {
  let config;
  try {
    config = await readFile(path.join(repoRoot, 'supabase', 'config.toml'), 'utf8');
  } catch {
    throw new Error('Pilot Gate 2A project id validation failed.');
  }
  const matches = safeProjectConfigPreamble(config)
    .map((line) => line.match(/^\s*project_id\s*=\s*"([a-z0-9][a-z0-9_-]{0,62})"\s*$/))
    .filter(Boolean);
  if (matches.length !== 1 || matches[0][1] !== EXPECTED_PROJECT_ID) {
    throw new Error('Pilot Gate 2A project id validation failed.');
  }
  return EXPECTED_PROJECT_ID;
}

function normalizeKnownSecrets(secrets) {
  return [...new Set(secrets.filter((value) => typeof value === 'string' && value.length > 0))]
    .sort((left, right) => right.length - left.length);
}

function sanitizeLine(rawLine, secrets) {
  let line = rawLine.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '').replaceAll('\t', ' ').trim();
  if (line.length === 0) return null;
  if (line.length > MAX_DIAGNOSTIC_LINE_LENGTH) return '[redacted]';
  for (const secret of secrets) {
    line = line.split(secret).join('[redacted]');
  }
  if (
    /[\\/?&{}<>]/.test(line) ||
    /\b(?:bearer|authorization|body|password|token|secret|credential)\b/i.test(line) ||
    /\b(?:lat(?:itude)?|lon(?:gitude)?|lng|coordinates?)\b/i.test(line) ||
    /[+-]?\d{1,3}\.\d{3,}/.test(line) ||
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(line) ||
    /\b[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/.test(line) ||
    !/^[A-Za-z0-9 .,;:_@()[\]'=+\-\[\]]+$/.test(line)
  ) {
    return '[redacted]';
  }
  return line;
}

export function sanitizeRuntimeOutput(value, knownSecrets = []) {
  const secrets = normalizeKnownSecrets(knownSecrets);
  const source = typeof value === 'string' ? value : '';
  const result = [];
  const lines = source.split(/\r?\n/);
  for (const rawLine of lines.slice(0, MAX_DIAGNOSTIC_LINES)) {
    const sanitized = sanitizeLine(rawLine, secrets);
    if (sanitized !== null) result.push(sanitized);
  }
  if (lines.length > MAX_DIAGNOSTIC_LINES) result.push('[output truncated]');
  let output = result.length > 0 ? result.join('\n') : '[no retained output]';
  for (const secret of secrets) {
    output = output.split(secret).join('[redacted]');
  }
  return output;
}

export function extractPgTapFailureMarkers(value, knownSecrets = []) {
  const secrets = normalizeKnownSecrets(knownSecrets);
  const source = typeof value === 'string' ? value : '';
  const markers = [];
  const seen = new Set();
  const append = (marker) => {
    if (markers.length >= 24 || seen.has(marker)) return;
    seen.add(marker);
    markers.push(marker);
  };

  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '');
    const file = line.match(/(?:^|[\\/])([0-9]{3}_[a-z0-9_]+\.sql)\b/i)?.[1];
    if (file) append(`pgtap_file=${file.toLowerCase()}`);

    const assertionIndex = line.toLowerCase().indexOf('not ok ');
    if (assertionIndex >= 0) {
      const assertion = sanitizeLine(line.slice(assertionIndex), secrets);
      if (assertion && assertion !== '[redacted]' && /^not ok \d{1,4}(?: - .+)?$/i.test(assertion)) {
        append(`pgtap_assertion=${assertion}`);
      }
    }

    const errorMatch = line.match(/\bdied:\s*[A-Z0-9]{5}:\s*[A-Za-z][A-Za-z0-9 _."'()_-]{1,160}/i);
    if (errorMatch) {
      const error = sanitizeLine(errorMatch[0].replaceAll('"', ''), secrets);
      if (error && error !== '[redacted]') append(`pgtap_error=${error}`);
    }

    const sqlErrorMatch = line.match(/\bERROR:\s*[A-Za-z][A-Za-z0-9 _."'()=:_-]{1,160}/);
    if (sqlErrorMatch) {
      const error = sanitizeLine(sqlErrorMatch[0].replaceAll('"', ''), secrets);
      if (error && error !== '[redacted]') append(`pgtap_error=${error}`);
    }

    const summaryMatch = line.match(/\bFailed tests?\s+\d{1,4}(?:-\d{1,4})?\b/i);
    if (summaryMatch) {
      const summary = sanitizeLine(summaryMatch[0], secrets);
      if (summary && summary !== '[redacted]') append(`pgtap_summary=${summary}`);
    }
  }
  return markers;
}

export function failureDiagnosticPath() {
  return path.join(tmpdir(), FAILURE_DIAGNOSTIC_FILENAME);
}

export async function removePilotGate2AFailureDiagnostic() {
  await rm(failureDiagnosticPath(), { force: true });
}

function assertOwnedTemporaryDirectory(directory) {
  const resolvedRoot = path.resolve(tmpdir());
  const resolvedDirectory = path.resolve(directory);
  if (
    path.dirname(resolvedDirectory) !== resolvedRoot ||
    !path.basename(resolvedDirectory).startsWith(EDGE_TEMP_PREFIX)
  ) {
    throw new Error('Pilot Gate 2A temporary directory validation failed.');
  }
  return resolvedDirectory;
}

async function removeEdgeTemporaryDirectory(directory) {
  await rm(assertOwnedTemporaryDirectory(directory), { recursive: true, force: true });
}

function buildFailureDiagnostic(failure, edgeSnapshot, secrets) {
  const captured = failure.captured;
  const childOutput = captured
    ? `${captured.stdout ?? ''}\n${captured.stderr ?? ''}`
    : '';
  const edgeOutput = edgeSnapshot
    ? `${edgeSnapshot.stdout ?? ''}\n${edgeSnapshot.stderr ?? ''}`
    : '';
  const lines = [
    `stage=${failure.stage}`,
    ...(failure.stage === 'pgtap' ? extractPgTapFailureMarkers(childOutput, secrets) : []),
    `child_output=${captured ? 'sanitized' : 'not-retained'}`,
    sanitizeRuntimeOutput(childOutput, secrets),
    `edge_output=${edgeSnapshot ? 'sanitized' : 'not-started'}`,
    sanitizeRuntimeOutput(edgeOutput, secrets),
  ];
  if (captured?.truncated || edgeSnapshot?.truncated) lines.push('capture=truncated');
  return `${lines.join('\n')}\n`;
}

async function writeFailureDiagnostic(failure, edgeSnapshot, secrets) {
  const diagnostic = buildFailureDiagnostic(failure, edgeSnapshot, secrets);
  await writeFile(failureDiagnosticPath(), diagnostic, { encoding: 'utf8', mode: 0o600, flag: 'w' });
  await chmod(failureDiagnosticPath(), 0o600);
}

function defaultOutputAdapter(parentEnvironment) {
  const githubActions = parentEnvironment.GITHUB_ACTIONS === 'true';
  return {
    mask(value) {
      if (githubActions) process.stdout.write(`::add-mask::${value}\n`);
    },
    info(message) {
      process.stdout.write(`${message}\n`);
    },
  };
}

function assertNotAborted(signal) {
  if (signal?.aborted) throw new StageFailure('cancelled');
}

function assertEdgeProcessRunning(edgeProcess) {
  if (typeof edgeProcess?.isRunning !== 'function' || !edgeProcess.isRunning()) {
    throw new StageFailure('edge-runtime');
  }
}

async function capturedStage(processAdapter, stage, command, args, options, retainFailureOutput = true) {
  assertNotAborted(options.signal);
  let result;
  try {
    result = await processAdapter.capture(command, args, options);
  } catch {
    throw new StageFailure(stage);
  }
  if (result?.terminationConfirmed === false) throw new StageFailure('process-tree-cleanup');
  assertNotAborted(options.signal);
  if (result.exitCode !== 0) {
    throw new StageFailure(stage, retainFailureOutput ? result : null);
  }
  return result;
}

export async function stopPilotGate2AStack({
  repoRoot,
  processAdapter = createSystemProcessAdapter(),
  parentEnvironment = process.env,
  signal,
}) {
  const projectId = await validateProjectId(repoRoot);
  const result = await processAdapter.capture(
    'supabase',
    ['stop', '--no-backup', '--project-id', projectId],
    {
      cwd: repoRoot,
      env: minimumChildEnvironment(parentEnvironment),
      signal,
      timeoutMs: STAGE_TIMEOUTS.stop,
    },
  );
  if (result.exitCode !== 0) throw new StageFailure('supabase-stop');
}

function normalizedFailure(error, fallbackStage) {
  if (error instanceof StageFailure) return error;
  return new StageFailure(fallbackStage);
}

function integrationStageForFile(testPath) {
  const basename = path.posix.basename(testPath, '.integration.test.ts');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(basename)) {
    throw new StageFailure('integration-input');
  }
  return `integration-${basename}`;
}

function monotonicNow() {
  return performance.now();
}

export async function runPilotGate2A({
  repoRoot,
  processAdapter = createSystemProcessAdapter(),
  outputAdapter,
  parentEnvironment = process.env,
  signal,
}) {
  const output = outputAdapter ?? defaultOutputAdapter(parentEnvironment);
  let stage = 'project-validation';
  let failure = null;
  let edgeProcess = null;
  let edgeSnapshot = null;
  let edgeTemporaryDirectory = null;
  let stackAttempted = false;
  let knownSecrets = [];

  await removePilotGate2AFailureDiagnostic();

  try {
    await validateProjectId(repoRoot);
    stage = 'input-discovery';
    const inputs = validatePilotGate2AInputs(discoverPilotGate2AInputs(repoRoot));
    const baseEnvironment = minimumChildEnvironment(parentEnvironment);

    stage = 'supabase-start';
    stackAttempted = true;
    await capturedStage(
      processAdapter,
      stage,
      'supabase',
      ['start'],
      { cwd: repoRoot, env: baseEnvironment, signal, timeoutMs: STAGE_TIMEOUTS.start },
      false,
    );

    stage = 'supabase-status';
    const statusResult = await capturedStage(
      processAdapter,
      stage,
      'supabase',
      ['status', '-o', 'env'],
      { cwd: repoRoot, env: baseEnvironment, signal, timeoutMs: STAGE_TIMEOUTS.status },
      false,
    );

    stage = 'status-validation';
    const local = parseSupabaseStatusEnvironment(statusResult.stdout);
    knownSecrets = [...local.maskValues, FIXED_PRECISE_LOCATION_ENCRYPTION_KEY];
    for (const value of knownSecrets) output.mask(value);
    output.info('Pilot Gate 2A local credentials validated.');

    stage = 'pgtap';
    await capturedStage(
      processAdapter,
      stage,
      'supabase',
      ['test', 'db'],
      { cwd: repoRoot, env: baseEnvironment, signal, timeoutMs: STAGE_TIMEOUTS.pgtap },
    );
    output.info('Pilot Gate 2A pgTAP passed.');

    stage = 'database-lint';
    await capturedStage(
      processAdapter,
      stage,
      'supabase',
      ['db', 'lint', '--level', 'warning'],
      { cwd: repoRoot, env: baseEnvironment, signal, timeoutMs: STAGE_TIMEOUTS.lint },
    );
    output.info('Pilot Gate 2A database lint passed.');

    stage = 'edge-environment';
    edgeTemporaryDirectory = await mkdtemp(path.join(tmpdir(), EDGE_TEMP_PREFIX));
    const edgeEnvironmentPath = path.join(edgeTemporaryDirectory, EDGE_ENV_FILENAME);
    const edgeEnvironment = [
      `PRECISE_LOCATION_ENCRYPTION_KEY=${FIXED_PRECISE_LOCATION_ENCRYPTION_KEY}`,
      `MEDIA_ALLOWED_ORIGIN=${local.apiUrl}`,
      `MEDIA_PUBLIC_SUPABASE_ORIGIN=${local.apiUrl}`,
      '',
    ].join('\n');
    await writeFile(edgeEnvironmentPath, edgeEnvironment, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    await chmod(edgeEnvironmentPath, 0o600);

    stage = 'edge-runtime';
    assertNotAborted(signal);
    edgeProcess = await processAdapter.start(
      'supabase',
      ['functions', 'serve', '--env-file', edgeEnvironmentPath],
      { cwd: repoRoot, env: baseEnvironment, signal },
    );
    assertNotAborted(signal);
    assertEdgeProcessRunning(edgeProcess);

    const integrationEnvironment = minimumChildEnvironment(parentEnvironment, {
      PILOT_GATE_2A: '1',
      SUPABASE_URL: local.apiUrl,
      SUPABASE_ANON_KEY: local.anonKey,
      SUPABASE_SERVICE_ROLE_KEY: local.serviceRoleKey,
      DATABASE_URL: local.databaseUrl,
      MEDIA_ALLOWED_ORIGIN: local.apiUrl,
      PRECISE_LOCATION_ENCRYPTION_KEY: FIXED_PRECISE_LOCATION_ENCRYPTION_KEY,
    });

    stage = 'readiness';
    await capturedStage(
      processAdapter,
      stage,
      'pnpm',
      buildPilotGate2ATestArgs(inputs.integrationTests, { readinessOnly: true }),
      { cwd: repoRoot, env: integrationEnvironment, signal, timeoutMs: STAGE_TIMEOUTS.readiness },
    );
    assertEdgeProcessRunning(edgeProcess);
    output.info('Pilot Gate 2A readiness passed.');

    const integrationDeadline = monotonicNow() + STAGE_TIMEOUTS.integration;
    const integrationFiles = inputs.integrationTests.filter((testPath) => testPath !== READINESS_TEST);
    for (const integrationFile of integrationFiles) {
      stage = integrationStageForFile(integrationFile);
      const remaining = integrationDeadline - monotonicNow();
      if (remaining <= 0) throw new StageFailure(stage);
      await capturedStage(
        processAdapter,
        stage,
        'pnpm',
        buildPilotGate2ATestArgs(inputs.integrationTests, { integrationFile }),
        { cwd: repoRoot, env: integrationEnvironment, signal, timeoutMs: remaining },
      );
      assertEdgeProcessRunning(edgeProcess);
    }
    output.info('Pilot Gate 2A integration suite passed.');
  } catch (error) {
    failure = normalizedFailure(error, stage);
  } finally {
    const cleanupFailures = [];
    if (edgeProcess) {
      try {
        await edgeProcess.stop();
      } catch {
        cleanupFailures.push(new StageFailure('edge-stop'));
      }
      try {
        edgeSnapshot = edgeProcess.snapshot();
      } catch {
        edgeSnapshot = null;
      }
    }
    if (edgeTemporaryDirectory) {
      try {
        await removeEdgeTemporaryDirectory(edgeTemporaryDirectory);
      } catch {
        cleanupFailures.push(new StageFailure('temporary-cleanup'));
      }
    }
    if (stackAttempted) {
      try {
        await stopPilotGate2AStack({ repoRoot, processAdapter, parentEnvironment });
      } catch (error) {
        cleanupFailures.push(normalizedFailure(error, 'supabase-stop'));
      }
    }
    if (!failure && cleanupFailures.length > 0) failure = cleanupFailures[0];
  }

  if (failure) {
    await writeFailureDiagnostic(failure, edgeSnapshot, knownSecrets);
    throw new Error(`Pilot Gate 2A failed at ${failure.stage}.`);
  }
}

async function main(argv) {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  if (argv.length === 1 && argv[0] === 'cleanup-diagnostic') {
    await removePilotGate2AFailureDiagnostic();
    return 0;
  }
  if (argv.length !== 0) {
    process.stderr.write('usage: node scripts/run-pilot-gate-2a.mjs [cleanup-diagnostic]\n');
    return 2;
  }

  const controller = new AbortController();
  const abort = () => controller.abort();
  process.once('SIGINT', abort);
  process.once('SIGTERM', abort);
  try {
    await runPilotGate2A({ repoRoot, signal: controller.signal });
    return 0;
  } catch (error) {
    const message = error instanceof Error && /^Pilot Gate 2A failed at [a-z-]+\.$/.test(error.message)
      ? error.message
      : 'Pilot Gate 2A failed.';
    process.stderr.write(`${message}\n`);
    return 1;
  } finally {
    process.removeListener('SIGINT', abort);
    process.removeListener('SIGTERM', abort);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2));
}
