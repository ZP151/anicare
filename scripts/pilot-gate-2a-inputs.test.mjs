import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import {
  buildPilotGate2ATestArgs,
  discoverPilotGate2AInputs,
  validatePilotGate2AInputs,
  validatePilotGate2AWorkflow,
} from './pilot-gate-2a-inputs.mjs';

const EXPECTED_ENDPOINTS = [
  'cleanup-media-staging',
  'create-sighting',
  'delete-media',
  'finalize-media-upload',
  'reserve-media-upload',
];

async function createFixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'pilot-gate-2a-inputs-'));
  t.after(async () => rm(root, { recursive: true, force: true }));

  await mkdir(path.join(root, 'tests', 'pilot-gate-2a', 'src', 'nested'), { recursive: true });
  await mkdir(path.join(root, 'supabase', 'functions'), { recursive: true });
  await writeFile(
    path.join(root, 'tests', 'pilot-gate-2a', 'src', 'environment.ts'),
    'export function readLocalStackEnvironment() { return "local-only"; }\n',
  );
  await writeFile(
    path.join(root, 'tests', 'pilot-gate-2a', 'src', 'readiness.integration.test.ts'),
    'fetch("http://127.0.0.1/functions/v1/create-sighting");\n',
  );
  await writeFile(
    path.join(root, 'tests', 'pilot-gate-2a', 'src', 'media.integration.test.ts'),
    [
      'fetch("http://127.0.0.1/functions/v1/reserve-media-upload");',
      'fetch("http://127.0.0.1/functions/v1/finalize-media-upload");',
      'fetch("http://127.0.0.1/functions/v1/delete-media");',
    ].join('\n'),
  );
  await writeFile(
    path.join(root, 'tests', 'pilot-gate-2a', 'src', 'nested', 'cleanup.integration.test.ts'),
    'fetch("http://127.0.0.1/functions/v1/cleanup-media-staging");\n',
  );
  await writeFile(
    path.join(root, 'tests', 'pilot-gate-2a', 'src', 'ordinary.test.ts'),
    'throw new Error("unit-only");\n',
  );

  for (const endpoint of EXPECTED_ENDPOINTS) {
    const directory = path.join(root, 'supabase', 'functions', endpoint);
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, 'index.ts'), 'Deno.serve(() => new Response());\n');
  }
  return root;
}

test('discovers every recursive integration test, allowlisted Edge handler, endpoint reference, and environment guard', async (t) => {
  const root = await createFixture(t);

  assert.deepEqual(discoverPilotGate2AInputs(root), {
    integrationTests: [
      'tests/pilot-gate-2a/src/media.integration.test.ts',
      'tests/pilot-gate-2a/src/nested/cleanup.integration.test.ts',
      'tests/pilot-gate-2a/src/readiness.integration.test.ts',
    ],
    edgeHandlers: [
      'supabase/functions/cleanup-media-staging/index.ts',
      'supabase/functions/create-sighting/index.ts',
      'supabase/functions/delete-media/index.ts',
      'supabase/functions/finalize-media-upload/index.ts',
      'supabase/functions/reserve-media-upload/index.ts',
    ],
    referencedEndpoints: EXPECTED_ENDPOINTS,
    environmentGuard: 'tests/pilot-gate-2a/src/environment.ts',
  });
});

test('rejects a missing allowlisted Edge handler instead of silently narrowing the gate', async (t) => {
  const root = await createFixture(t);
  await rm(path.join(root, 'supabase', 'functions', 'delete-media', 'index.ts'));

  assert.throws(
    () => validatePilotGate2AInputs(discoverPilotGate2AInputs(root)),
    /missing Gate 2A Edge handler: supabase\/functions\/delete-media\/index\.ts/,
  );
});

test('rejects an endpoint referenced by Gate 2A sources until it joins the reviewed allowlist', async (t) => {
  const root = await createFixture(t);
  await writeFile(
    path.join(root, 'tests', 'pilot-gate-2a', 'src', 'unexpected.ts'),
    'fetch("http://127.0.0.1/functions/v1/unreviewed-endpoint");\n',
  );

  assert.throws(
    () => validatePilotGate2AInputs(discoverPilotGate2AInputs(root)),
    /unreviewed Gate 2A Edge endpoint: unreviewed-endpoint/,
  );
});

test('builds explicit readiness and complete-suite arguments from discovered files', () => {
  const integrationTests = [
    'tests/pilot-gate-2a/src/media-a.integration.test.ts',
    'tests/pilot-gate-2a/src/media-b.integration.test.ts',
    'tests/pilot-gate-2a/src/readiness.integration.test.ts',
  ];

  assert.deepEqual(buildPilotGate2ATestArgs(integrationTests, { readinessOnly: true }), [
    '--filter', '@animalhelper/pilot-gate-2a',
    'exec', 'vitest', 'run',
    '--config', 'vitest.integration.config.ts',
    'src/readiness.integration.test.ts',
  ]);
  assert.deepEqual(buildPilotGate2ATestArgs(integrationTests), [
    '--filter', '@animalhelper/pilot-gate-2a',
    'exec', 'vitest', 'run',
    '--config', 'vitest.integration.config.ts',
    'src/media-a.integration.test.ts',
    'src/media-b.integration.test.ts',
    'src/readiness.integration.test.ts',
  ]);
});

test('discovers the complete repository Gate 2A source contract', () => {
  const root = path.resolve(import.meta.dirname, '..');

  assert.deepEqual(validatePilotGate2AInputs(discoverPilotGate2AInputs(root)), {
    integrationTests: [
      'tests/pilot-gate-2a/src/media-concurrency.integration.test.ts',
      'tests/pilot-gate-2a/src/media-happy-path.integration.test.ts',
      'tests/pilot-gate-2a/src/media-isolation.integration.test.ts',
      'tests/pilot-gate-2a/src/media-lifecycle.integration.test.ts',
      'tests/pilot-gate-2a/src/media-replay.integration.test.ts',
      'tests/pilot-gate-2a/src/readiness.integration.test.ts',
    ],
    edgeHandlers: [
      'supabase/functions/cleanup-media-staging/index.ts',
      'supabase/functions/create-sighting/index.ts',
      'supabase/functions/delete-media/index.ts',
      'supabase/functions/finalize-media-upload/index.ts',
      'supabase/functions/reserve-media-upload/index.ts',
    ],
    referencedEndpoints: EXPECTED_ENDPOINTS,
    environmentGuard: 'tests/pilot-gate-2a/src/environment.ts',
  });
});

test('repository input check exits successfully without printing discovered paths', () => {
  const root = path.resolve(import.meta.dirname, '..');
  const result = spawnSync(process.execPath, ['scripts/pilot-gate-2a-inputs.mjs'], {
    cwd: root,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, 'Pilot Gate 2A inputs verified: 6 tests, 5 endpoints.\n');
  assert.equal(result.stderr, '');
});

test('database-contracts enforces the pinned guarded Gate 2A workflow in dependency order', async () => {
  const root = path.resolve(import.meta.dirname, '..');
  const workflow = await readFile(path.join(root, '.github', 'workflows', 'ci.yml'), 'utf8');

  assert.deepEqual(validatePilotGate2AWorkflow(workflow), {
    node: '22',
    pnpm: '11.19.0',
    deno: 'v2.9.5',
    supabase: '2.84.2',
    orderedSteps: [
      'frozen-install',
      'orchestration-tests',
      'gate-input-discovery',
      'uuid-source-gate',
      'deno-source-gate',
      'guarded-gate',
      'sanitized-artifact',
      'diagnostic-cleanup',
    ],
  });
});

test('workflow policy rejects raw Supabase lifecycle output and failure bypasses', async () => {
  const root = path.resolve(import.meta.dirname, '..');
  const workflow = await readFile(path.join(root, '.github', 'workflows', 'ci.yml'), 'utf8');
  const rawStatus = workflow.replace('run: pnpm pilot-gate-2a', 'run: supabase status -o env');
  const bypassed = workflow.replace('id: pilot_gate_2a', 'id: pilot_gate_2a\n        continue-on-error: true');

  assert.throws(() => validatePilotGate2AWorkflow(rawStatus), /raw Supabase lifecycle command/);
  assert.throws(() => validatePilotGate2AWorkflow(bypassed), /continue-on-error/);
});

test('package scripts expose the guarded gate and Docker-free orchestration tests', async () => {
  const root = path.resolve(import.meta.dirname, '..');
  const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));

  assert.equal(packageJson.scripts['pilot-gate-2a'], 'node scripts/run-pilot-gate-2a.mjs');
  assert.equal(
    packageJson.scripts['pilot-gate-2a:cleanup-diagnostic'],
    'node scripts/run-pilot-gate-2a.mjs cleanup-diagnostic',
  );
  assert.equal(
    packageJson.scripts['test:pilot-gate-2a-ci'],
    'node --test scripts/pilot-gate-2a-inputs.test.mjs scripts/run-pilot-gate-2a.test.mjs',
  );
});
