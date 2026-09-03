import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  DEPLOYED_FUNCTIONS, REVIEWED_MIGRATIONS, discoverPilotGate2BInputs, validatePilotGate2BInputs,
} from './pilot-gate-2b-inputs.mjs';

const reviewedEdgeLockUrl = new URL('../supabase/functions/deno.lock', import.meta.url);
const reviewedEdgeLock = readFileSync(reviewedEdgeLockUrl);
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function functionConfig() {
  return {
    nodeModulesDir: 'none',
    lock: { path: '../deno.lock', frozen: true },
    imports: {
      '@supabase/supabase-js': 'npm:@supabase/supabase-js@2.98.0',
      zod: 'npm:zod@4.3.6',
      'h3-js': 'npm:h3-js@4.4.0',
    },
  };
}

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'gate-2b-inputs-'));
  for (const migration of REVIEWED_MIGRATIONS) {
    const file = path.join(root, 'supabase', 'migrations', migration);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, 'select 1;\n');
  }
  for (const name of DEPLOYED_FUNCTIONS) {
    const file = path.join(root, 'supabase', 'functions', name, 'index.ts');
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, 'export {};\n');
    writeFileSync(path.join(path.dirname(file), 'deno.json'), `${JSON.stringify(functionConfig(), null, 2)}\n`);
  }
  writeFileSync(path.join(root, 'supabase', 'functions', 'deno.lock'), reviewedEdgeLock);
  writeFileSync(path.join(root, 'supabase', 'config.toml'), [
    'project_id = "fixture"', '', '[edge_runtime]', 'enabled = true', 'deno_version = 2', '',
  ].join('\n'));
  const shared = path.join(root, 'supabase', 'functions', '_shared', 'policy.ts');
  mkdirSync(path.dirname(shared), { recursive: true });
  writeFileSync(shared, 'export const policy = true;\n');
  for (const file of [
    'tests/pilot-gate-2b/src/hosted.integration.test.ts',
    'docs/evidence/pilot-gate-2b-readiness.schema.json',
    '.github/workflows/hosted-gate-2b.yml',
  ]) {
    const target = path.join(root, ...file.split('/'));
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, '{}\n');
  }
  return root;
}

test('discovers only the exact reviewed hosted deployment inventory', () => {
  const root = fixture();
  try {
    const discovered = discoverPilotGate2BInputs(root);
    assert.deepEqual({ ...discovered, deploymentTreeSha256: undefined }, {
      migrations: REVIEWED_MIGRATIONS,
      functions: DEPLOYED_FUNCTIONS,
      integration: 'tests/pilot-gate-2b/src/hosted.integration.test.ts',
      schema: 'docs/evidence/pilot-gate-2b-readiness.schema.json',
      workflow: '.github/workflows/hosted-gate-2b.yml',
      deploymentTreeSha256: undefined,
    });
    assert.match(discovered.deploymentTreeSha256, /^[a-f0-9]{64}$/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('accepts the exact current repository deployment inventory', () => {
  const discovered = discoverPilotGate2BInputs(repositoryRoot);
  assert.match(discovered.deploymentTreeSha256, /^[a-f0-9]{64}$/);
  assert.equal(discovered.migrations.at(-1), '202609030001_finalize_media_preflight.sql');
});

test('hashes every deployable migration, config, function, and shared source file', () => {
  const root = fixture();
  try {
    const before = discoverPilotGate2BInputs(root).deploymentTreeSha256;
    writeFileSync(path.join(root, 'supabase', 'functions', '_shared', 'policy.ts'), 'export const policy = false;\n');
    const after = discoverPilotGate2BInputs(root).deploymentTreeSha256;
    assert.notEqual(after, before);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('rejects any added or missing migration and function before execution', () => {
  const root = fixture();
  try {
    writeFileSync(path.join(root, 'supabase', 'migrations', '202609030001_extra.sql'), 'select 2;\n');
    assert.throws(() => discoverPilotGate2BInputs(root), /pilot_gate_2b_inputs_invalid/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('rejects a deployable function without an isolated Deno configuration', () => {
  const root = fixture();
  try {
    const config = path.join(root, 'supabase', 'functions', DEPLOYED_FUNCTIONS[0], 'deno.json');
    rmSync(config);
    assert.throws(() => discoverPilotGate2BInputs(root), /pilot_gate_2b_inputs_invalid/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('rejects each isolated Deno configuration policy drift independently', () => {
  const mutations = [
    (value) => { value.nodeModulesDir = 'auto'; },
    (value) => { value.lock.path = './deno.lock'; },
    (value) => { value.lock.frozen = false; },
    (value) => { value.imports.zod = 'npm:zod@4.3.7'; },
    (value) => { value.imports.unreviewed = 'npm:unreviewed@1.0.0'; },
    (value) => { value.tasks = { deploy: 'unreviewed' }; },
  ];
  for (const mutate of mutations) {
    const root = fixture();
    try {
      const config = path.join(root, 'supabase', 'functions', DEPLOYED_FUNCTIONS[0], 'deno.json');
      const value = functionConfig();
      mutate(value);
      writeFileSync(config, `${JSON.stringify(value)}\n`);
      assert.throws(() => discoverPilotGate2BInputs(root), /pilot_gate_2b_inputs_invalid/);
    } finally { rmSync(root, { recursive: true, force: true }); }
  }
});

test('requires the exact reviewed shared Edge lock before remote operations', () => {
  const root = fixture();
  try {
    const lock = path.join(root, 'supabase', 'functions', 'deno.lock');
    rmSync(lock);
    assert.throws(() => discoverPilotGate2BInputs(root), /pilot_gate_2b_inputs_invalid/);
    writeFileSync(lock, '{"version":"5","specifiers":{}}\n');
    assert.throws(() => discoverPilotGate2BInputs(root), /pilot_gate_2b_inputs_invalid/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('requires the Deno 2 Edge Runtime before remote operations', () => {
  const root = fixture();
  try {
    const config = path.join(root, 'supabase', 'config.toml');
    writeFileSync(config, readFileSync(config, 'utf8').replace('deno_version = 2', 'deno_version = 1'));
    assert.throws(() => discoverPilotGate2BInputs(root), /pilot_gate_2b_inputs_invalid/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('rejects a symlinked shared Edge lock', (t) => {
  const root = fixture();
  try {
    const lock = path.join(root, 'supabase', 'functions', 'deno.lock');
    rmSync(lock);
    try {
      symlinkSync(reviewedEdgeLockUrl, lock, 'file');
    } catch (error) {
      if (error?.code === 'EPERM') return t.skip('file symlinks require Windows Developer Mode');
      throw error;
    }
    assert.throws(() => discoverPilotGate2BInputs(root), /pilot_gate_2b_inputs_invalid/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('hashes semantic-preserving bytes in a function-local Deno configuration', () => {
  const root = fixture();
  try {
    const before = discoverPilotGate2BInputs(root).deploymentTreeSha256;
    const config = path.join(root, 'supabase', 'functions', DEPLOYED_FUNCTIONS[0], 'deno.json');
    writeFileSync(config, `${JSON.stringify(functionConfig())}\n`);
    const after = discoverPilotGate2BInputs(root).deploymentTreeSha256;
    assert.notEqual(after, before);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('accepts only the exact bootstrap workflow context', () => {
  assert.doesNotThrow(() => validatePilotGate2BInputs({
    repository: 'ZP151/anicare', eventName: 'push', ref: 'refs/heads/codex/hosted-gate-2b',
    sha: 'a'.repeat(40), environment: 'hosted-gate-2b', projectRef: 'fhugdtpjbgiatqhvjioy',
  }));
  for (const [field, value] of [['repository', 'attacker/repo'], ['eventName', 'pull_request'], ['ref', 'refs/heads/main'],
    ['environment', 'production'], ['projectRef', 'other']]) {
    assert.throws(() => validatePilotGate2BInputs({
      repository: 'ZP151/anicare', eventName: 'push', ref: 'refs/heads/codex/hosted-gate-2b',
      sha: 'a'.repeat(40), environment: 'hosted-gate-2b', projectRef: 'fhugdtpjbgiatqhvjioy', [field]: value,
    }), /pilot_gate_2b_context_invalid/);
  }
});

test('accepts a manual Hosted Gate 2B dispatch at the protected producer ref', () => {
  assert.doesNotThrow(() => validatePilotGate2BInputs({
    repository: 'ZP151/anicare', eventName: 'workflow_dispatch', ref: 'refs/heads/codex/hosted-gate-2b',
    sha: 'a'.repeat(40), environment: 'hosted-gate-2b', projectRef: 'fhugdtpjbgiatqhvjioy',
  }));
});

test('rejects a manual Hosted Gate 2B dispatch from an arbitrary branch', () => {
  assert.throws(() => validatePilotGate2BInputs({
    repository: 'ZP151/anicare', eventName: 'workflow_dispatch', ref: 'refs/heads/feature/relaxed-timeout',
    sha: 'a'.repeat(40), environment: 'hosted-gate-2b', projectRef: 'fhugdtpjbgiatqhvjioy',
  }), /pilot_gate_2b_context_invalid/);
});
