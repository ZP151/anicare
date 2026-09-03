import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  buildProducerFailureDiagnostic, cleanupRunnerTemporary, configureHostedAuth, hostedCheckDiagnosticPath,
  readHostedGateControl, createDefaultProcessAdapter,
  runPilotGate2B, validHostedApiKeys, validateRemoteFunctionInventory,
} from './run-pilot-gate-2b.mjs';
import { DEPLOYED_FUNCTIONS } from './pilot-gate-2b-inputs.mjs';

test('configures and reads back the exact Auth redirects', async () => {
  const calls = [];
  const fetchAdapter = async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({
      site_url: 'animalhelper://', uri_allow_list: 'animalhelper://auth/callback',
    }), { status: 200 });
  };
  await configureHostedAuth({ fetchAdapter, accessToken: 'token-value' });
  assert.deepEqual(calls.map((call) => [call.init.method, call.url]), [
    ['PATCH', 'https://api.supabase.com/v1/projects/fhugdtpjbgiatqhvjioy/config/auth'],
    ['GET', 'https://api.supabase.com/v1/projects/fhugdtpjbgiatqhvjioy/config/auth'],
  ]);
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    site_url: 'animalhelper://', uri_allow_list: 'animalhelper://auth/callback',
  });
});

test('rejects wildcard or unrelated Auth readback', async () => {
  const fetchAdapter = async () => new Response(JSON.stringify({
    site_url: 'animalhelper://', uri_allow_list: 'animalhelper://auth/callback,http://*',
  }), { status: 200 });
  await assert.rejects(configureHostedAuth({ fetchAdapter, accessToken: 'token-value' }), /hosted_auth_invalid/);
});

test('accepts only correctly paired modern keys or legacy role JWTs', () => {
  const jwt = (role) => [
    Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
    Buffer.from(JSON.stringify({ role })).toString('base64url'),
    'signature',
  ].join('.');
  assert.equal(validHostedApiKeys('sb_publishable_public', 'sb_secret_service'), true);
  assert.equal(validHostedApiKeys(jwt('anon'), jwt('service_role')), true);
  assert.equal(validHostedApiKeys(jwt('service_role'), jwt('anon')), false);
  assert.equal(validHostedApiKeys(jwt('anon'), jwt('anon')), false);
  assert.equal(validHostedApiKeys('sb_publishable_public', jwt('service_role')), true);
});

test('accepts only the exact active deployed function inventory', () => {
  const inventory = DEPLOYED_FUNCTIONS.map((slug, index) => ({
    id: `function-${index}`, name: slug, slug, status: 'ACTIVE', version: 1,
    created_at: 1, updated_at: 1,
  }));
  assert.doesNotThrow(() => validateRemoteFunctionInventory(JSON.stringify(inventory)));
  assert.throws(() => validateRemoteFunctionInventory(JSON.stringify(inventory.slice(1))), /remote_functions_invalid/);
  assert.throws(() => validateRemoteFunctionInventory(JSON.stringify([
    ...inventory, { ...inventory[0], id: 'extra', name: 'extra', slug: 'extra' },
  ])), /remote_functions_invalid/);
  assert.throws(() => validateRemoteFunctionInventory(JSON.stringify([
    { ...inventory[0], status: 'THROTTLED' }, ...inventory.slice(1),
  ])), /remote_functions_invalid/);
});

test('removes only the exact current-run temporary directory', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'animalhelper-gate-2b-cleanup-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const current = path.join(root, 'animalhelper-gate-2b-123-1');
  const other = path.join(root, 'animalhelper-gate-2b-123-2');
  await mkdir(current);
  await mkdir(other);
  await cleanupRunnerTemporary({ temporaryRoot: root, runId: '123', runAttempt: '1' });
  await assert.rejects(access(current));
  await access(other);
});

test('fails closed for invalid run selectors or a non-directory cleanup target', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'animalhelper-gate-2b-cleanup-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await assert.rejects(
    cleanupRunnerTemporary({ temporaryRoot: root, runId: '../123', runAttempt: '1' }),
    /hosted_temporary_cleanup_failed/,
  );
  await writeFile(path.join(root, 'animalhelper-gate-2b-123-1'), 'not a directory');
  await assert.rejects(
    cleanupRunnerTemporary({ temporaryRoot: root, runId: '123', runAttempt: '1' }),
    /hosted_temporary_cleanup_failed/,
  );
});

test('keeps bounded successful child output while discarding failing child output', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'animalhelper-gate-2b-child-output-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const adapter = createDefaultProcessAdapter({ temporaryRoot: root, runId: '123', runAttempt: '1' });
  const successful = await adapter.run(process.execPath, ['-e', 'process.stdout.write("expected-output")'], {
    cwd: root, env: process.env, timeoutMs: 10_000,
  });
  assert.equal(successful.stdout, 'expected-output');
  await assert.rejects(adapter.run(process.execPath, [
    '-e', 'process.stderr.write("PILOT_GATE_2B_CHECK=media_staging\\nBearer secret"); process.exit(1)',
  ], { cwd: root, env: process.env, timeoutMs: 10_000 }), (error) =>
    error instanceof Error && error.message === 'hosted_process_failed' && !Object.hasOwn(error, 'hostedCheckId'));
});

test('deploys incrementally in fixed order without privileged command arguments', async () => {
  const sourceArchive = path.join('C:/temp/source', 'source.tar');
  const functionsRoot = path.join('C:/temp/source', 'supabase', 'functions');
  const runtimeDigest = 'public.ecr.aws/supabase/edge-runtime@sha256:3775cdbe86dab8cd7495157af69377dfedf208ba3cb4165031b58ed691514c22';
  const commands = [];
  const stages = [];
  const processAdapter = {
    run: async (command, args, options) => {
      commands.push({ command, args, options });
      if (command === 'git' && args[0] === 'rev-parse') return { stdout: `${'a'.repeat(40)}\n` };
      if (command === 'supabase' && args[0] === 'functions' && args[1] === 'list') {
        return { stdout: JSON.stringify(DEPLOYED_FUNCTIONS.map((slug, index) => ({
          id: `function-${index}`, name: slug, slug, status: 'ACTIVE', version: 1,
          created_at: 1, updated_at: 1,
        }))) };
      }
      return { stdout: '' };
    },
    createSourceDirectory: async () => 'C:/temp/source',
    writeEdgeSecretFile: async () => 'C:/temp/edge.env',
    removeTemporaryFiles: async () => undefined,
  };
  const fetchAdapter = async () => new Response(JSON.stringify({
    site_url: 'animalhelper://', uri_allow_list: 'animalhelper://auth/callback',
  }), { status: 200 });
  const values = {
    SUPABASE_ACCESS_TOKEN: 'access-secret',
    SUPABASE_DATABASE_URL: 'postgresql://postgres.fhugdtpjbgiatqhvjioy:db-secret@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres',
    SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_service', SUPABASE_PUBLIC_KEY: 'sb_publishable_public',
    PRECISE_LOCATION_ENCRYPTION_KEY: Buffer.alloc(32).toString('base64'),
    GITHUB_REPOSITORY: 'ZP151/anicare', GITHUB_EVENT_NAME: 'push',
    GITHUB_REF: 'refs/heads/codex/hosted-gate-2b', GITHUB_SHA: 'a'.repeat(40),
    GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '1', GITHUB_ENVIRONMENT: 'hosted-gate-2b',
  };
  await runPilotGate2B({ repoRoot: 'C:/repo', processAdapter, fetchAdapter, parentEnvironment: values,
    discoverInputs: () => ({ deploymentTreeSha256: 'b'.repeat(64) }), outputAdapter: { write: () => undefined },
    stageAdapter: { enter: (stage) => stages.push(stage) } });
  assert.deepEqual(commands.map(({ command, args }) => [command, ...args]), [
    ['git', 'rev-parse', 'HEAD'],
    ['git', 'status', '--porcelain=v1', '--untracked-files=all'],
    ['git', 'archive', '--format=tar', `--output=${sourceArchive}`, 'a'.repeat(40)],
    ['tar', '--extract', '--file', sourceArchive, '--directory', 'C:/temp/source'],
    ['docker', 'info', '--format', '{{.ServerVersion}}'],
    ['docker', 'pull', runtimeDigest],
    ['docker', 'image', 'tag', runtimeDigest, 'public.ecr.aws/supabase/edge-runtime:v1.73.0'],
    ['docker', 'run', '--rm', '-e', 'DENO_NO_PACKAGE_JSON=1', '--mount',
      `type=bind,src=${functionsRoot},dst=/work/functions,readonly`, runtimeDigest,
      'bundle', '--entrypoint', '/work/functions/cleanup-legacy-media/index.ts', '--output', '/tmp/probe.eszip'],
    ['supabase', 'link', '--project-ref', 'fhugdtpjbgiatqhvjioy'],
    ['supabase', 'db', 'push', '--dry-run'],
    ['supabase', 'db', 'push'],
    ['supabase', 'secrets', 'set', '--env-file', 'C:/temp/edge.env', '--project-ref', 'fhugdtpjbgiatqhvjioy'],
    ...DEPLOYED_FUNCTIONS.map((name) => ['supabase', 'functions', 'deploy', name, '--project-ref', 'fhugdtpjbgiatqhvjioy', '--use-docker']),
    ['supabase', 'functions', 'list', '--project-ref', 'fhugdtpjbgiatqhvjioy', '--output', 'json'],
    ['pnpm', '--filter', '@animalhelper/pilot-gate-2b', 'test:integration'],
    ['pnpm', '--filter', '@animalhelper/pilot-gate-2b', 'evidence:write'],
  ]);
  const commandText = JSON.stringify(commands.map(({ command, args }) => [command, args]));
  assert.equal(commandText.includes('access-secret') || commandText.includes('db-secret') ||
    commandText.includes('sb_secret_service'), false);
  const forbidden = new Set(['reset', 'repair', 'seed', 'dump', 'restore', 'prune', 'delete', 'pause', 'query']);
  assert.equal(commands.some(({ command, args }) => [command, ...args].some((token) => forbidden.has(token))), false);
  assert.deepEqual(stages, [
    'environment_validation', 'source_verification', 'docker_bundler_verification', 'public_key_origin', 'supabase_link',
    'database_dry_run', 'database_push', 'auth_configuration', 'edge_secret_configuration',
    'function_deployment', 'function_inventory', 'source_reverification', 'hosted_checks', 'evidence_write',
  ]);
});

test('fails before every hosted operation when the Docker bundler is unavailable', async () => {
  const commands = [];
  let fetchCalls = 0;
  const processAdapter = {
    run: async (command, args) => {
      commands.push([command, ...args]);
      if (command === 'git' && args[0] === 'rev-parse') return { stdout: `${'a'.repeat(40)}\n` };
      if (command === 'docker') throw new Error('docker daemon unavailable');
      return { stdout: '' };
    },
    createSourceDirectory: async () => 'C:/temp/source',
    removeTemporaryFiles: async () => undefined,
  };
  const values = {
    SUPABASE_ACCESS_TOKEN: 'access-secret',
    SUPABASE_DATABASE_URL: 'postgresql://postgres.fhugdtpjbgiatqhvjioy:db-secret@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres',
    SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_service', SUPABASE_PUBLIC_KEY: 'sb_publishable_public',
    PRECISE_LOCATION_ENCRYPTION_KEY: Buffer.alloc(32).toString('base64'),
    GITHUB_REPOSITORY: 'ZP151/anicare', GITHUB_EVENT_NAME: 'push',
    GITHUB_REF: 'refs/heads/codex/hosted-gate-2b', GITHUB_SHA: 'a'.repeat(40),
    GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '1', GITHUB_ENVIRONMENT: 'hosted-gate-2b',
  };
  await assert.rejects(runPilotGate2B({
    repoRoot: 'C:/repo', processAdapter, parentEnvironment: values,
    fetchAdapter: async () => { fetchCalls += 1; return new Response(null, { status: 200 }); },
    discoverInputs: () => ({ deploymentTreeSha256: 'b'.repeat(64) }),
    stageAdapter: { enter: () => undefined },
  }), /docker daemon unavailable/);
  assert.equal(fetchCalls, 0);
  assert.equal(commands.some(([command]) => command === 'supabase'), false);
});

test('reports the fixed source verification stage before an operation fails', async () => {
  let observedStage = 'unknown';
  const processAdapter = {
    run: async () => { throw new Error('external failure must not enter the diagnostic'); },
    removeTemporaryFiles: async () => undefined,
  };
  const values = {
    SUPABASE_ACCESS_TOKEN: 'access-secret',
    SUPABASE_DATABASE_URL: 'postgresql://postgres.fhugdtpjbgiatqhvjioy:db-secret@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres',
    SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_service', SUPABASE_PUBLIC_KEY: 'sb_publishable_public',
    PRECISE_LOCATION_ENCRYPTION_KEY: Buffer.alloc(32).toString('base64'),
    GITHUB_REPOSITORY: 'ZP151/anicare', GITHUB_EVENT_NAME: 'push',
    GITHUB_REF: 'refs/heads/codex/hosted-gate-2b', GITHUB_SHA: 'a'.repeat(40),
    GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '1', GITHUB_ENVIRONMENT: 'hosted-gate-2b',
  };
  await assert.rejects(runPilotGate2B({
    repoRoot: 'C:/repo', processAdapter, parentEnvironment: values,
    discoverInputs: () => ({ deploymentTreeSha256: 'b'.repeat(64) }),
    stageAdapter: { enter: (stage) => { observedStage = stage; } },
  }), /external failure/);
  assert.equal(observedStage, 'source_verification');
});

test('serializes only allowlisted producer diagnostics with canonical bytes', async () => {
  const allowed = [
    'environment_validation', 'source_verification', 'public_key_origin', 'supabase_link',
    'docker_bundler_verification',
    'database_dry_run', 'database_push', 'auth_configuration', 'edge_secret_configuration',
    'function_deployment', 'function_inventory', 'source_reverification', 'hosted_checks', 'evidence_write',
    'temporary_cleanup',
  ];
  for (const stage of allowed) {
    assert.equal(buildProducerFailureDiagnostic(stage),
      `${JSON.stringify({ stage, code: 'hosted_gate_failed' })}\n`);
  }
  const hostile = 'function_deployment\\nBearer secret JWT.part.value https://db.example/path?id=1';
  const diagnostic = buildProducerFailureDiagnostic(hostile);
  assert.equal(diagnostic, '{"stage":"unknown","code":"hosted_gate_failed"}\n');
  assert.equal(diagnostic.includes('secret') || diagnostic.includes('https://') || diagnostic.includes('Bearer'), false);
});

test('reads only a canonical regular hosted-check diagnostic inside the owned run directory', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'animalhelper-gate-2b-diagnostic-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const diagnostic = hostedCheckDiagnosticPath({ temporaryRoot: root, runId: '123', runAttempt: '1' });
  const owned = path.join(root, 'animalhelper-gate-2b-123-1');
  assert.equal(path.dirname(diagnostic), owned);
  assert.equal(path.relative(owned, diagnostic), 'hosted-check-diagnostic.json');
  await mkdir(owned, { recursive: true });
  const control = { gateStage: 'cleanup', check: 'media_staging', cleanup: ['storage_remove', 'absence_proof'] };
  await writeFile(diagnostic, `${JSON.stringify(control)}\n`, { mode: 0o600 });
  await assert.doesNotReject(async () => access(diagnostic));
  assert.deepEqual(await readHostedGateControl({ temporaryRoot: root, runId: '123', runAttempt: '1' }), control);
  const longest = {
    gateStage: 'cleanup', check: 'cross_owner_isolation', cleanup: [
      'setup', 'recover_auth', 'recover_sighting', 'storage_remove', 'jobs_delete', 'assets_delete',
      'sightings_delete', 'profiles_delete', 'auth_delete', 'absence_proof', 'connection_close',
    ],
  };
  const longestSource = `${JSON.stringify(longest)}\n`;
  assert.ok(Buffer.byteLength(longestSource) <= 256);
  await writeFile(diagnostic, longestSource);
  assert.deepEqual(await readHostedGateControl({ temporaryRoot: root, runId: '123', runAttempt: '1' }), longest);
  await writeFile(diagnostic, 'x'.repeat(257));
  assert.equal(await readHostedGateControl({ temporaryRoot: root, runId: '123', runAttempt: '1' }), undefined);
  await writeFile(diagnostic, '{"gateStage":"evidence","check":"media_staging"}\n');
  assert.equal(await readHostedGateControl({ temporaryRoot: root, runId: '123', runAttempt: '1' }), undefined);
  await writeFile(diagnostic, '{"gateStage":"checks","cleanup":["storage_remove"]}\n');
  assert.equal(await readHostedGateControl({ temporaryRoot: root, runId: '123', runAttempt: '1' }), undefined);
  await writeFile(diagnostic, '{"gateStage":"cleanup","check":"media_staging","cleanup":["absence_proof","storage_remove"]}\n');
  assert.equal(await readHostedGateControl({ temporaryRoot: root, runId: '123', runAttempt: '1' }), undefined);
  await writeFile(diagnostic, '{"gateStage":"cleanup","check":"media_staging"}');
  assert.equal(await readHostedGateControl({ temporaryRoot: root, runId: '123', runAttempt: '1' }), undefined);
  await rm(diagnostic);
  await writeFile(path.join(owned, 'target'), `${JSON.stringify(control)}\n`);
  try {
    await symlink(path.join(owned, 'target'), diagnostic, 'file');
  } catch (error) {
    if (error?.code !== 'EPERM') throw error;
    const directoryTarget = path.join(owned, 'target-directory');
    await mkdir(directoryTarget);
    try {
      await symlink(directoryTarget, diagnostic, 'junction');
    } catch (junctionError) {
      if (junctionError?.code !== 'EPERM') throw junctionError;
      t.skip('Windows symlink creation requires a developer-mode or elevated test host.');
      return;
    }
  }
  assert.equal(await readHostedGateControl({ temporaryRoot: root, runId: '123', runAttempt: '1' }), undefined);
  assert.equal(buildProducerFailureDiagnostic('hosted_checks', control),
    '{"stage":"hosted_checks","code":"hosted_gate_failed","gateStage":"cleanup","check":"media_staging","cleanup":["storage_remove","absence_proof"]}\n');
  assert.equal(buildProducerFailureDiagnostic('hosted_checks', { gateStage: 'cleanup', check: 'media_staging\\nBearer secret' }),
    '{"stage":"hosted_checks","code":"hosted_gate_failed"}\n');
  assert.equal(buildProducerFailureDiagnostic('hosted_checks', { gateStage: 'evidence', check: 'media_staging' }),
    '{"stage":"hosted_checks","code":"hosted_gate_failed"}\n');
  assert.equal(buildProducerFailureDiagnostic('hosted_checks', { gateStage: 'checks', cleanup: ['storage_remove'] }),
    '{"stage":"hosted_checks","code":"hosted_gate_failed"}\n');
});

test('propagates only a canonical owned diagnostic and ignores hostile child output', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'animalhelper-gate-2b-diagnostic-producer-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const values = {
    SUPABASE_ACCESS_TOKEN: 'access-secret',
    SUPABASE_DATABASE_URL: 'postgresql://postgres.fhugdtpjbgiatqhvjioy:db-secret@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres',
    SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_service', SUPABASE_PUBLIC_KEY: 'sb_publishable_public',
    PRECISE_LOCATION_ENCRYPTION_KEY: Buffer.alloc(32).toString('base64'),
    GITHUB_REPOSITORY: 'ZP151/anicare', GITHUB_EVENT_NAME: 'push',
    GITHUB_REF: 'refs/heads/codex/hosted-gate-2b', GITHUB_SHA: 'a'.repeat(40),
    GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '1', GITHUB_ENVIRONMENT: 'hosted-gate-2b',
  };
  for (const [contents, expectedControls] of [
    ['{"gateStage":"cleanup","check":"media_staging","cleanup":["storage_remove","absence_proof"]}\n', [{
      gateStage: 'cleanup', check: 'media_staging', cleanup: ['storage_remove', 'absence_proof'],
    }]],
    [undefined, []],
    ['{"gateStage":"cleanup","check":"media_staging","cleanup":["absence_proof","storage_remove"]}\n', []],
  ]) {
    const stages = []; const controls = [];
    const processAdapter = {
      run: async (command, args, options) => {
        if (command === 'git' && args[0] === 'rev-parse') return { stdout: `${'a'.repeat(40)}\n` };
        if (command === 'supabase' && args[0] === 'functions' && args[1] === 'list') {
          return { stdout: JSON.stringify(DEPLOYED_FUNCTIONS.map((slug, index) => ({
            id: `function-${index}`, name: slug, slug, status: 'ACTIVE', version: 1,
          }))) };
        }
        if (command === 'pnpm' && args[2] === 'test:integration') {
          if (contents !== undefined) {
            const diagnostic = options.env.PILOT_GATE_2B_CHECK_DIAGNOSTIC_PATH;
            await mkdir(path.dirname(diagnostic), { recursive: true });
            await writeFile(diagnostic, contents, { mode: 0o600, flag: 'wx' });
          }
          const error = new Error('hosted_process_failed');
          error.stdout = 'PILOT_GATE_2B_CHECK=auth_redirect\\nBearer secret https://hostile.invalid';
          error.stderr = 'PILOT_GATE_2B_CHECK=cross_owner_isolation';
          throw error;
        }
        return { stdout: '' };
      },
      createSourceDirectory: async () => 'C:/temp/source',
      writeEdgeSecretFile: async () => 'C:/temp/edge.env',
      removeTemporaryFiles: async () => undefined,
    };
    await rm(path.join(root, 'animalhelper-gate-2b-123-1'), { recursive: true, force: true });
    await assert.rejects(runPilotGate2B({
      repoRoot: 'C:/repo', processAdapter, parentEnvironment: values,
      fetchAdapter: async () => new Response(JSON.stringify({
        site_url: 'animalhelper://', uri_allow_list: 'animalhelper://auth/callback',
      }), { status: 200 }),
      discoverInputs: () => ({ deploymentTreeSha256: 'b'.repeat(64) }),
      stageAdapter: { enter: (stage) => stages.push(stage), control: (control) => controls.push(control) },
      temporaryRoot: root,
    }), /hosted_process_failed/);
    assert.equal(stages.at(-1), 'hosted_checks');
    assert.deepEqual(controls, expectedControls);
  }
});

test('reports temporary cleanup only when cleanup itself fails', async () => {
  let observedStage = 'unknown';
  const processAdapter = {
    run: async () => { throw new Error('primary failure'); },
    removeTemporaryFiles: async () => { throw new Error('cleanup failure'); },
  };
  const values = {
    SUPABASE_ACCESS_TOKEN: 'access-secret',
    SUPABASE_DATABASE_URL: 'postgresql://postgres.fhugdtpjbgiatqhvjioy:db-secret@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres',
    SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_service', SUPABASE_PUBLIC_KEY: 'sb_publishable_public',
    PRECISE_LOCATION_ENCRYPTION_KEY: Buffer.alloc(32).toString('base64'),
    GITHUB_REPOSITORY: 'ZP151/anicare', GITHUB_EVENT_NAME: 'push',
    GITHUB_REF: 'refs/heads/codex/hosted-gate-2b', GITHUB_SHA: 'a'.repeat(40),
    GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '1', GITHUB_ENVIRONMENT: 'hosted-gate-2b',
  };
  await assert.rejects(runPilotGate2B({
    repoRoot: 'C:/repo', processAdapter, parentEnvironment: values,
    discoverInputs: () => ({ deploymentTreeSha256: 'b'.repeat(64) }),
    stageAdapter: { enter: (stage) => { observedStage = stage; } },
  }), /cleanup failure/);
  assert.equal(observedStage, 'temporary_cleanup');
});
