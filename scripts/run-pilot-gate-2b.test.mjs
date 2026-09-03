import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  cleanupRunnerTemporary, configureHostedAuth, runPilotGate2B, validHostedApiKeys, validateRemoteFunctionInventory,
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

test('deploys incrementally in fixed order without privileged command arguments', async () => {
  const sourceArchive = path.join('C:/temp/source', 'source.tar');
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
    ['supabase', 'link', '--project-ref', 'fhugdtpjbgiatqhvjioy'],
    ['supabase', 'db', 'push', '--dry-run'],
    ['supabase', 'db', 'push'],
    ['supabase', 'secrets', 'set', '--env-file', 'C:/temp/edge.env', '--project-ref', 'fhugdtpjbgiatqhvjioy'],
    ...DEPLOYED_FUNCTIONS.map((name) => ['supabase', 'functions', 'deploy', name, '--project-ref', 'fhugdtpjbgiatqhvjioy', '--use-api']),
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
    'environment_validation', 'source_verification', 'public_key_origin', 'supabase_link',
    'database_dry_run', 'database_push', 'auth_configuration', 'edge_secret_configuration',
    'function_deployment', 'function_inventory', 'source_reverification', 'hosted_checks', 'evidence_write',
  ]);
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
  const { buildProducerFailureDiagnostic } = await import('./run-pilot-gate-2b.mjs');
  const allowed = [
    'environment_validation', 'source_verification', 'public_key_origin', 'supabase_link',
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
