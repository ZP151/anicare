import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  failureDiagnosticPath,
  createSystemProcessAdapter,
  removePilotGate2AFailureDiagnostic,
  runPilotGate2A,
  sanitizeRuntimeOutput,
  stopPilotGate2AStack,
} from './run-pilot-gate-2a.mjs';

const START_ONLY_SECRET = 'startup-only-secret-that-must-never-escape';
const UNRELATED_SECRET = 'parent-environment-secret-that-must-not-be-inherited';
const FIXED_LOCATION_KEY = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
const STATUS_VALUES = Object.freeze({
  ANON_KEY: 'local-anon-key.synthetic.signature',
  API_URL: 'http://127.0.0.1:54321',
  DB_URL: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
  FUNCTIONS_URL: 'http://127.0.0.1:54321/functions/v1',
  JWT_SECRET: 'local-jwt-secret-not-for-children',
  PUBLISHABLE_KEY: 'sb_publishable_synthetic_local_key',
  SECRET_KEY: 'sb_secret_synthetic_local_key',
  SERVICE_ROLE_KEY: 'local-service-role-key.synthetic.signature',
});

function statusOutput(overrides = {}) {
  return Object.entries({ ...STATUS_VALUES, ...overrides })
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, value]) => `${name}="${value}"`)
    .join('\n').concat('\n');
}

function parentEnvironment() {
  return {
    PATH: '/synthetic/bin',
    HOME: '/synthetic/home',
    CI: 'true',
    UNRELATED_SECRET,
  };
}

function outputRecorder() {
  const masks = [];
  const messages = [];
  return {
    masks,
    messages,
    adapter: {
      mask(value) {
        masks.push(value);
      },
      info(message) {
        messages.push(message);
      },
    },
  };
}

function commandStage(command, args) {
  if (command === 'supabase') {
    if (args[0] === 'start') return 'start';
    if (args[0] === 'status') return 'status';
    if (args[0] === 'test') return 'pgtap';
    if (args[0] === 'db') return 'lint';
    if (args[0] === 'stop') return 'stop';
  }
  if (command === 'pnpm') {
    const integrationFiles = args.filter((value) => value.endsWith('.integration.test.ts'));
    return integrationFiles.length === 1 && integrationFiles[0] === 'src/readiness.integration.test.ts'
      ? 'readiness'
      : 'integration';
  }
  return 'unknown';
}

function fakeProcesses({
  failAt,
  startStdout = `Supabase started with ${START_ONLY_SECRET}\n`,
  startStderr = `startup stderr ${START_ONLY_SECRET}\n`,
  statusStdout = statusOutput(),
  statusStderr = 'Using workdir /synthetic/repository\n',
  failedStdout = '',
  failedStderr = '',
  edgeStdout = 'Edge runtime ready\n',
  edgeStderr = '',
} = {}) {
  const calls = [];
  const observations = { edgeEnvContent: null, edgeTempEntries: null, edgeEnvPath: null };
  let edgeRunningChecks = 0;

  return {
    calls,
    observations,
    adapter: {
      async capture(command, args, options) {
        const stage = commandStage(command, args);
        calls.push({ kind: 'capture', stage, command, args: [...args], options: { ...options, env: { ...options.env } } });
        if (stage === 'start') {
          return { exitCode: failAt === stage ? 1 : 0, stdout: startStdout, stderr: startStderr, truncated: false };
        }
        if (stage === 'status') {
          return { exitCode: failAt === stage ? 1 : 0, stdout: statusStdout, stderr: statusStderr, truncated: false };
        }
        if (failAt === stage) {
          return { exitCode: 1, stdout: failedStdout, stderr: failedStderr, truncated: false };
        }
        return { exitCode: 0, stdout: `${stage} raw output\n`, stderr: '', truncated: false };
      },
      async start(command, args, options) {
        calls.push({ kind: 'start', stage: 'edge', command, args: [...args], options: { ...options, env: { ...options.env } } });
        const envFileIndex = args.indexOf('--env-file') + 1;
        observations.edgeEnvPath = args[envFileIndex];
        observations.edgeEnvContent = await readFile(observations.edgeEnvPath, 'utf8');
        observations.edgeTempEntries = await readdir(path.dirname(observations.edgeEnvPath));
        if (failAt === 'edge') throw new Error(`edge failed with ${STATUS_VALUES.SERVICE_ROLE_KEY}`);
        return {
          isRunning() {
            edgeRunningChecks += 1;
            return failAt !== 'edge-exit' || edgeRunningChecks === 1;
          },
          snapshot() {
            return { stdout: edgeStdout, stderr: edgeStderr, truncated: false };
          },
          async stop() {
            calls.push({ kind: 'stop-child', stage: 'edge' });
          },
        };
      },
    },
  };
}

function allRecordedText(recorder) {
  return recorder.messages.join('\n');
}

async function clearDiagnostic() {
  await removePilotGate2AFailureDiagnostic();
  assert.equal(existsSync(failureDiagnosticPath()), false);
}

function testChildEnvironment() {
  return Object.fromEntries(
    ['PATH', 'Path', 'PATHEXT', 'SystemRoot', 'SYSTEMROOT', 'WINDIR', 'COMSPEC']
      .filter((name) => typeof process.env[name] === 'string')
      .map((name) => [name, process.env[name]]),
  );
}

async function readSpawnedPid(filename) {
  const deadline = Date.now() + 4_000;
  while (Date.now() < deadline) {
    try {
      const value = Number.parseInt(await readFile(filename, 'utf8'), 10);
      if (Number.isSafeInteger(value) && value > 0) return value;
    } catch {
      // The supervised fixture has not reached this process boundary yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('process-tree fixture did not publish its pid');
}

function processExists(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitForProcessExit(pid) {
  const deadline = Date.now() + 4_000;
  while (Date.now() < deadline && processExists(pid)) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return !processExists(pid);
}

function forceKillFixtureTree(parentPid, grandchildPid) {
  if (process.platform === 'win32' && parentPid > 0 && processExists(parentPid)) {
    spawnSync('taskkill', ['/PID', String(parentPid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
  } else if (parentPid > 0 && processExists(parentPid)) {
    try {
      process.kill(-parentPid, 'SIGKILL');
    } catch {
      // The process group may already have been reaped.
    }
  }
  for (const pid of [parentPid, grandchildPid]) {
    if (pid <= 0 || !processExists(pid)) continue;
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      // Exact fixture process is already gone.
    }
  }
}

test('captures startup/status, masks status values, writes only custom Edge env, and runs children with minimum environments', async () => {
  await clearDiagnostic();
  const root = path.resolve(import.meta.dirname, '..');
  const processes = fakeProcesses();
  const output = outputRecorder();

  await runPilotGate2A({
    repoRoot: root,
    processAdapter: processes.adapter,
    outputAdapter: output.adapter,
    parentEnvironment: parentEnvironment(),
  });

  assert.deepEqual(output.masks.at(-1), FIXED_LOCATION_KEY);
  assert.deepEqual(new Set(output.masks), new Set([...Object.values(STATUS_VALUES), FIXED_LOCATION_KEY]));
  const visibleOutput = allRecordedText(output);
  assert.equal(visibleOutput.includes(START_ONLY_SECRET), false);
  assert.equal(visibleOutput.includes(STATUS_VALUES.ANON_KEY), false);
  assert.equal(visibleOutput.includes(STATUS_VALUES.SERVICE_ROLE_KEY), false);
  assert.equal(visibleOutput.includes(STATUS_VALUES.DB_URL), false);
  assert.deepEqual(output.messages, [
    'Pilot Gate 2A local credentials validated.',
    'Pilot Gate 2A pgTAP passed.',
    'Pilot Gate 2A database lint passed.',
    'Pilot Gate 2A readiness passed.',
    'Pilot Gate 2A integration suite passed.',
  ]);

  assert.equal(processes.observations.edgeEnvContent, [
    `PRECISE_LOCATION_ENCRYPTION_KEY=${FIXED_LOCATION_KEY}`,
    `MEDIA_ALLOWED_ORIGIN=${STATUS_VALUES.API_URL}`,
    '',
  ].join('\n'));
  assert.deepEqual(processes.observations.edgeTempEntries, ['edge.env']);
  assert.equal(processes.observations.edgeEnvContent.includes(STATUS_VALUES.ANON_KEY), false);
  assert.equal(processes.observations.edgeEnvContent.includes(STATUS_VALUES.SERVICE_ROLE_KEY), false);
  assert.equal(processes.observations.edgeEnvContent.includes(STATUS_VALUES.DB_URL), false);
  assert.equal(existsSync(processes.observations.edgeEnvPath), false);
  assert.equal(existsSync(path.dirname(processes.observations.edgeEnvPath)), false);
  assert.equal(existsSync(failureDiagnosticPath()), false);

  assert.deepEqual(processes.calls.map(({ kind, stage }) => `${kind}:${stage}`), [
    'capture:start',
    'capture:status',
    'capture:pgtap',
    'capture:lint',
    'start:edge',
    'capture:readiness',
    'capture:integration',
    'stop-child:edge',
    'capture:stop',
  ]);
  const statusCall = processes.calls.find(({ stage }) => stage === 'status');
  assert.deepEqual(statusCall.args, ['status', '-o', 'env']);
  const stopCall = processes.calls.find(({ stage }) => stage === 'stop');
  assert.deepEqual(stopCall.args, ['stop', '--no-backup', '--project-id', 'animalhelper']);
  assert.equal(processes.calls.some(({ args = [] }) => args.includes('--all')), false);

  const baseStages = new Set(['start', 'status', 'pgtap', 'lint', 'edge', 'stop']);
  for (const call of processes.calls.filter((candidate) => candidate.options && baseStages.has(candidate.stage))) {
    assert.equal(call.options.env.UNRELATED_SECRET, undefined);
    assert.equal(call.options.env.SUPABASE_ANON_KEY, undefined);
    assert.equal(call.options.env.SUPABASE_SERVICE_ROLE_KEY, undefined);
    assert.equal(call.options.env.DATABASE_URL, undefined);
    assert.equal(call.options.env.PATH, '/synthetic/bin');
  }
  for (const stage of ['readiness', 'integration']) {
    const call = processes.calls.find((candidate) => candidate.stage === stage);
    assert.equal(call.options.env.UNRELATED_SECRET, undefined);
    assert.equal(call.options.env.SUPABASE_URL, STATUS_VALUES.API_URL);
    assert.equal(call.options.env.SUPABASE_ANON_KEY, STATUS_VALUES.ANON_KEY);
    assert.equal(call.options.env.SUPABASE_SERVICE_ROLE_KEY, STATUS_VALUES.SERVICE_ROLE_KEY);
    assert.equal(call.options.env.DATABASE_URL, STATUS_VALUES.DB_URL);
    assert.equal(call.options.env.MEDIA_ALLOWED_ORIGIN, STATUS_VALUES.API_URL);
    assert.equal(call.options.env.PRECISE_LOCATION_ENCRYPTION_KEY, FIXED_LOCATION_KEY);
    assert.equal(call.options.env.JWT_SECRET, undefined);
    assert.equal(call.options.env.SECRET_KEY, undefined);
  }
});

test('suppresses unmasked startup and status output on their failure paths while still stopping the scoped stack', async (t) => {
  for (const failedStage of ['start', 'status']) {
    await t.test(failedStage, async () => {
      await clearDiagnostic();
      const root = path.resolve(import.meta.dirname, '..');
      const leaked = `raw-${failedStage}-credential`;
      const processes = fakeProcesses({
        failAt: failedStage,
        startStdout: `start ${leaked} ${START_ONLY_SECRET}\n`,
        startStderr: `start-stderr ${leaked}\n`,
        statusStdout: statusOutput({ JWT_SECRET: leaked }),
        statusStderr: `status-stderr ${leaked}\n`,
      });
      const output = outputRecorder();

      await assert.rejects(
        runPilotGate2A({
          repoRoot: root,
          processAdapter: processes.adapter,
          outputAdapter: output.adapter,
          parentEnvironment: parentEnvironment(),
        }),
        new RegExp(`Pilot Gate 2A failed at supabase-${failedStage}`),
      );

      assert.equal(allRecordedText(output).includes(leaked), false);
      assert.equal(allRecordedText(output).includes(START_ONLY_SECRET), false);
      assert.equal(processes.calls.some(({ stage }) => stage === 'pgtap'), false);
      assert.equal(processes.calls.some(({ stage }) => stage === 'stop'), true);
      const diagnostic = await readFile(failureDiagnosticPath(), 'utf8');
      assert.equal(diagnostic.includes(leaked), false);
      assert.equal(diagnostic.includes(START_ONLY_SECRET), false);
      assert.match(diagnostic, new RegExp(`stage=supabase-${failedStage}`));
      await clearDiagnostic();
    });
  }
});

test('rejects a remote status URL before any downstream process or visible output', async () => {
  await clearDiagnostic();
  const root = path.resolve(import.meta.dirname, '..');
  const remoteSecret = 'remote-status-secret';
  const processes = fakeProcesses({
    statusStdout: statusOutput({
      API_URL: 'https://project-ref.supabase.co',
      ANON_KEY: remoteSecret,
    }),
  });
  const output = outputRecorder();

  await assert.rejects(
    runPilotGate2A({
      repoRoot: root,
      processAdapter: processes.adapter,
      outputAdapter: output.adapter,
      parentEnvironment: parentEnvironment(),
    }),
    /Pilot Gate 2A failed at status-validation/,
  );

  assert.deepEqual(output.masks, []);
  assert.deepEqual(output.messages, []);
  assert.equal(processes.calls.some(({ stage }) => stage === 'pgtap'), false);
  assert.equal(processes.calls.some(({ stage }) => stage === 'stop'), true);
  const diagnostic = await readFile(failureDiagnosticPath(), 'utf8');
  assert.equal(diagnostic.includes(remoteSecret), false);
  assert.equal(diagnostic.includes('supabase.co'), false);
  await clearDiagnostic();
});

test('sanitizes failed child and Edge logs against secrets, bearer tokens, queries, UUIDs, and paths before retention', async () => {
  await clearDiagnostic();
  const root = path.resolve(import.meta.dirname, '..');
  const bearer = 'header.payload.signature';
  const uuid = '11111111-2222-4333-8444-555555555555';
  const processes = fakeProcesses({
    failAt: 'integration',
    failedStdout: `contract failed safely\nBearer ${bearer}\n{"body":"private"}\n`,
    failedStderr: `request http://127.0.0.1/upload?token=signed-value C:\\runner\\work\\secret\n`,
    edgeStdout: `Edge worker stopped\n${STATUS_VALUES.SERVICE_ROLE_KEY}\n${FIXED_LOCATION_KEY}\n/jobs/${uuid}.jpg\n`,
    edgeStderr: 'at /home/runner/work/project/index.ts:10\n',
  });
  const output = outputRecorder();

  await assert.rejects(
    runPilotGate2A({
      repoRoot: root,
      processAdapter: processes.adapter,
      outputAdapter: output.adapter,
      parentEnvironment: parentEnvironment(),
    }),
    /Pilot Gate 2A failed at integration/,
  );

  const diagnostic = await readFile(failureDiagnosticPath(), 'utf8');
  assert.match(diagnostic, /stage=integration/);
  assert.match(diagnostic, /contract failed safely/);
  assert.match(diagnostic, /Edge worker stopped/);
  for (const forbidden of [
    START_ONLY_SECRET,
    FIXED_LOCATION_KEY,
    ...Object.values(STATUS_VALUES),
    bearer,
    '?token=',
    'signed-value',
    'C:\\runner',
    '/home/runner',
    '/jobs/',
    uuid,
    '{"body"',
  ]) {
    assert.equal(diagnostic.includes(forbidden), false, `diagnostic retained ${forbidden}`);
    assert.equal(allRecordedText(output).includes(forbidden), false, `visible output retained ${forbidden}`);
  }
  assert.equal(processes.calls.some(({ kind }) => kind === 'stop-child'), true);
  assert.equal(processes.calls.some(({ stage }) => stage === 'stop'), true);
  assert.equal(existsSync(processes.observations.edgeEnvPath), false);
  await clearDiagnostic();
});

test('runtime sanitizer preserves bounded safe lines and replaces unsafe diagnostic lines', () => {
  const secret = 'service-role-secret';
  const sanitized = sanitizeRuntimeOutput([
    'bounded safe diagnostic',
    `Bearer ${secret}`,
    'request=https://127.0.0.1/path?token=value',
    'at C:\\runner\\work\\index.ts:9',
    'at /home/runner/work/index.ts:9',
    '{"body":"private"}',
  ].join('\n'), [secret]);

  assert.match(sanitized, /^bounded safe diagnostic$/m);
  assert.equal(sanitized.includes(secret), false);
  assert.equal(sanitized.includes('?'), false);
  assert.equal(sanitized.includes('C:\\'), false);
  assert.equal(sanitized.includes('/home/'), false);
  assert.equal(sanitized.includes('{"body"'), false);
  assert.match(sanitized, /\[redacted\]/);
});

test('runtime sanitizer redacts every canonical UUID shape including v7, Nil, and Max', () => {
  const canonicalUuids = [
    '01890f47-eabc-7def-8123-456789abcdef',
    '00000000-0000-0000-0000-000000000000',
    'ffffffff-ffff-ffff-ffff-ffffffffffff',
  ];

  const sanitized = sanitizeRuntimeOutput(canonicalUuids.map((value, index) => (
    index === 0 ? `prefix${value}suffix` : `job ${value}`
  )).join('\n'));

  for (const uuid of canonicalUuids) assert.equal(sanitized.includes(uuid), false);
  assert.deepEqual(sanitized.split('\n'), canonicalUuids.map(() => '[redacted]'));
});

test('real abort kills a TERM-resistant descendant tree promptly without waiting for inherited pipes to close', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'pilot-gate-process-tree-'));
  const parentPidFile = path.join(directory, 'parent.pid');
  const grandchildPidFile = path.join(directory, 'grandchild.pid');
  let parentPid = 0;
  let grandchildPid = 0;
  t.after(async () => {
    forceKillFixtureTree(parentPid, grandchildPid);
    await rm(directory, { recursive: true, force: true });
  });

  const controller = new AbortController();
  const adapter = createSystemProcessAdapter();
  const fixture = path.resolve(import.meta.dirname, 'fixtures', 'pilot-gate-process-tree-child.mjs');
  const startedAt = Date.now();
  const capture = adapter.capture(process.execPath, [fixture, parentPidFile, grandchildPidFile], {
    cwd: path.resolve(import.meta.dirname, '..'),
    env: testChildEnvironment(),
    signal: controller.signal,
    timeoutMs: 1_000,
  });

  parentPid = await readSpawnedPid(parentPidFile);
  grandchildPid = await readSpawnedPid(grandchildPidFile);
  assert.equal(processExists(parentPid), true);
  assert.equal(processExists(grandchildPid), true);
  controller.abort();

  const result = await capture;
  assert.equal(result.exitCode, 1);
  assert.equal(await waitForProcessExit(parentPid), true);
  assert.equal(await waitForProcessExit(grandchildPid), true);
  assert.equal(result.terminationConfirmed, true);
  assert.ok(Date.now() - startedAt < 6_000, 'abort exceeded the independent process-tree cleanup deadline');
});

test('failed Windows tree supervision is not hidden by leader exit while a descendant remains', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'pilot-gate-windows-supervisor-'));
  const parentPidFile = path.join(directory, 'parent.pid');
  const grandchildPidFile = path.join(directory, 'grandchild.pid');
  const exitTriggerFile = path.join(directory, 'exit.trigger');
  let parentPid = 0;
  let grandchildPid = 0;
  t.after(async () => {
    forceKillFixtureTree(parentPid, grandchildPid);
    await rm(directory, { recursive: true, force: true });
  });

  const supervisorAttempts = [];
  const controller = new AbortController();
  const adapter = createSystemProcessAdapter({
    platform: 'win32',
    async windowsTreeKill(_pid, force) {
      supervisorAttempts.push(force);
      return false;
    },
  });
  const fixture = path.resolve(import.meta.dirname, 'fixtures', 'pilot-gate-process-tree-child.mjs');
  const capture = adapter.capture(
    process.execPath,
    [fixture, parentPidFile, grandchildPidFile, 'parent-exits-after-trigger', exitTriggerFile],
    {
      cwd: path.resolve(import.meta.dirname, '..'),
      env: testChildEnvironment(),
      signal: controller.signal,
      timeoutMs: 5_000,
    },
  );

  parentPid = await readSpawnedPid(parentPidFile);
  grandchildPid = await readSpawnedPid(grandchildPidFile);
  controller.abort();
  await writeFile(exitTriggerFile, 'exit\n');

  const result = await capture;
  assert.deepEqual(supervisorAttempts, [false, true]);
  assert.equal(result.terminationConfirmed, false);
  assert.equal(await waitForProcessExit(parentPid), true);
  assert.equal(processExists(grandchildPid), true);
});

test('a POSIX killpg supervision failure cannot be reported as confirmed termination', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'pilot-gate-posix-supervisor-'));
  const parentPidFile = path.join(directory, 'parent.pid');
  const grandchildPidFile = path.join(directory, 'grandchild.pid');
  let parentPid = 0;
  let grandchildPid = 0;
  t.after(async () => {
    forceKillFixtureTree(parentPid, grandchildPid);
    await rm(directory, { recursive: true, force: true });
  });

  const signals = [];
  let groupChecks = 0;
  const controller = new AbortController();
  const adapter = createSystemProcessAdapter({
    platform: 'linux',
    signalProcessGroup(_pid, signal) {
      signals.push(signal);
      const failure = new Error('injected process-group supervisor failure');
      failure.code = 'EPERM';
      throw failure;
    },
    processGroupExists() {
      groupChecks += 1;
      return true;
    },
  });
  const fixture = path.resolve(import.meta.dirname, 'fixtures', 'pilot-gate-process-tree-child.mjs');
  const capture = adapter.capture(process.execPath, [fixture, parentPidFile, grandchildPidFile], {
    cwd: path.resolve(import.meta.dirname, '..'),
    env: testChildEnvironment(),
    signal: controller.signal,
    timeoutMs: 5_000,
  });

  parentPid = await readSpawnedPid(parentPidFile);
  grandchildPid = await readSpawnedPid(grandchildPidFile);
  controller.abort();

  const result = await capture;
  assert.deepEqual(signals, ['SIGTERM', 'SIGKILL']);
  assert.ok(groupChecks > 1, 'process-group disappearance was not polled');
  assert.equal(result.terminationConfirmed, false);
  assert.equal(processExists(parentPid), true);
  assert.equal(processExists(grandchildPid), true);
});

test('an abort observed at a child boundary prevents later work and still performs full cleanup', async () => {
  await clearDiagnostic();
  const root = path.resolve(import.meta.dirname, '..');
  const controller = new AbortController();
  const processes = fakeProcesses();
  const originalCapture = processes.adapter.capture;
  processes.adapter.capture = async (command, args, options) => {
    const result = await originalCapture(command, args, options);
    if (commandStage(command, args) === 'readiness') controller.abort();
    return result;
  };
  const output = outputRecorder();

  await assert.rejects(
    runPilotGate2A({
      repoRoot: root,
      processAdapter: processes.adapter,
      outputAdapter: output.adapter,
      parentEnvironment: parentEnvironment(),
      signal: controller.signal,
    }),
    /Pilot Gate 2A failed at cancelled/,
  );

  assert.equal(processes.calls.some(({ stage }) => stage === 'integration'), false);
  assert.equal(processes.calls.some(({ kind }) => kind === 'stop-child'), true);
  assert.equal(processes.calls.some(({ stage }) => stage === 'stop'), true);
  assert.equal(existsSync(processes.observations.edgeEnvPath), false);
  assert.equal(output.messages.includes('Pilot Gate 2A readiness passed.'), false);
  await clearDiagnostic();
});

test('an unconfirmed child-tree exit becomes a fixed cleanup failure and still performs scoped cleanup', async () => {
  await clearDiagnostic();
  const root = path.resolve(import.meta.dirname, '..');
  const processes = fakeProcesses();
  const originalCapture = processes.adapter.capture;
  processes.adapter.capture = async (command, args, options) => {
    const result = await originalCapture(command, args, options);
    return commandStage(command, args) === 'pgtap'
      ? { ...result, terminationConfirmed: false }
      : result;
  };

  await assert.rejects(
    runPilotGate2A({
      repoRoot: root,
      processAdapter: processes.adapter,
      outputAdapter: outputRecorder().adapter,
      parentEnvironment: parentEnvironment(),
    }),
    /Pilot Gate 2A failed at process-tree-cleanup/,
  );

  assert.equal(processes.calls.some(({ kind }) => kind === 'stop-child'), false);
  assert.equal(processes.calls.some(({ stage }) => stage === 'stop'), true);
  assert.match(await readFile(failureDiagnosticPath(), 'utf8'), /stage=process-tree-cleanup/);
  await clearDiagnostic();
});

test('an Edge serve process that exits after readiness blocks the complete suite and is cleaned up', async () => {
  await clearDiagnostic();
  const root = path.resolve(import.meta.dirname, '..');
  const processes = fakeProcesses({ failAt: 'edge-exit' });
  const output = outputRecorder();

  await assert.rejects(
    runPilotGate2A({
      repoRoot: root,
      processAdapter: processes.adapter,
      outputAdapter: output.adapter,
      parentEnvironment: parentEnvironment(),
    }),
    /Pilot Gate 2A failed at edge-runtime/,
  );

  assert.equal(processes.calls.some(({ stage }) => stage === 'readiness'), true);
  assert.equal(processes.calls.some(({ stage }) => stage === 'integration'), false);
  assert.equal(processes.calls.some(({ kind }) => kind === 'stop-child'), true);
  assert.equal(processes.calls.some(({ stage }) => stage === 'stop'), true);
  assert.equal(existsSync(processes.observations.edgeEnvPath), false);
  await clearDiagnostic();
});

test('cleanup refuses to stop when the repository project id is not exactly animalhelper', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'pilot-gate-2a-project-'));
  t.after(async () => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'supabase'), { recursive: true });
  await writeFile(path.join(root, 'supabase', 'config.toml'), 'project_id = "another-project"\n');
  const processes = fakeProcesses();

  await assert.rejects(
    stopPilotGate2AStack({
      repoRoot: root,
      processAdapter: processes.adapter,
      parentEnvironment: parentEnvironment(),
    }),
    /Pilot Gate 2A project id validation failed/,
  );
  assert.deepEqual(processes.calls, []);
});
