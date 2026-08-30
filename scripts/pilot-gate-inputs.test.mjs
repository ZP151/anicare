import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { buildDenoCheckArgs, discoverPilotGateInputs } from './pilot-gate-inputs.mjs';

test('discovers SQL tests and direct Edge handlers in lexical order', async (t) => {
  const fixtureRoot = await mkdtemp(path.join(tmpdir(), 'pilot-gate-inputs-'));
  t.after(async () => rm(fixtureRoot, { recursive: true, force: true }));

  await mkdir(path.join(fixtureRoot, 'supabase', 'tests'), { recursive: true });
  await mkdir(path.join(fixtureRoot, 'supabase', 'functions', 'zebra', 'nested'), { recursive: true });
  await mkdir(path.join(fixtureRoot, 'supabase', 'functions', 'alpha'), { recursive: true });
  await mkdir(path.join(fixtureRoot, 'supabase', 'functions', '_shared'), { recursive: true });
  await writeFile(path.join(fixtureRoot, 'supabase', 'tests', '200_second.sql'), 'select 1;');
  await writeFile(path.join(fixtureRoot, 'supabase', 'tests', '010_first.sql'), 'select 1;');
  await writeFile(path.join(fixtureRoot, 'supabase', 'tests', 'notes.sql'), 'select 1;');
  await writeFile(path.join(fixtureRoot, 'supabase', 'functions', 'zebra', 'index.ts'), '');
  await writeFile(path.join(fixtureRoot, 'supabase', 'functions', 'alpha', 'index.ts'), '');
  await writeFile(path.join(fixtureRoot, 'supabase', 'functions', '_shared', 'index.ts'), '');
  await writeFile(path.join(fixtureRoot, 'supabase', 'functions', 'zebra', 'nested', 'index.ts'), '');

  assert.deepEqual(discoverPilotGateInputs(fixtureRoot), {
    sqlTests: [
      'supabase/tests/010_first.sql',
      'supabase/tests/200_second.sql',
    ],
    edgeHandlers: [
      'supabase/functions/_shared/index.ts',
      'supabase/functions/alpha/index.ts',
      'supabase/functions/zebra/index.ts',
    ],
  });
});

test('discovers the complete repository source contract', () => {
  const repoRoot = path.resolve(import.meta.dirname, '..');
  const inputs = discoverPilotGateInputs(repoRoot);

  assert.equal(inputs.sqlTests.length, 12);
  assert.equal(
    inputs.sqlTests.at(-1),
    'supabase/tests/012_identity_assistance_job_foundation.sql',
  );
  assert.equal(inputs.edgeHandlers.length, 6);
  assert.deepEqual(inputs.edgeHandlers, [
    'supabase/functions/cleanup-legacy-media/index.ts',
    'supabase/functions/cleanup-media-staging/index.ts',
    'supabase/functions/create-sighting/index.ts',
    'supabase/functions/delete-media/index.ts',
    'supabase/functions/finalize-media-upload/index.ts',
    'supabase/functions/reserve-media-upload/index.ts',
  ]);
});

test('builds a frozen Deno check with relative handler arguments', () => {
  const handlers = [
    'supabase/functions/alpha/index.ts',
    'supabase/functions/zebra/index.ts',
  ];

  assert.deepEqual(buildDenoCheckArgs(handlers), [
    'check',
    '--config', 'supabase/functions/deno.json',
    '--lock', 'supabase/functions/deno.lock',
    '--frozen=true',
    'supabase/functions/alpha/index.ts',
    'supabase/functions/zebra/index.ts',
  ]);
  assert.deepEqual(buildDenoCheckArgs(handlers, false), [
    'check',
    '--config', 'supabase/functions/deno.json',
    '--lock', 'supabase/functions/deno.lock',
    '--frozen=false',
    'supabase/functions/alpha/index.ts',
    'supabase/functions/zebra/index.ts',
  ]);
});
