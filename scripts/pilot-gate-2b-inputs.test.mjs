import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  DEPLOYED_FUNCTIONS, REVIEWED_MIGRATIONS, discoverPilotGate2BInputs, validatePilotGate2BInputs,
} from './pilot-gate-2b-inputs.mjs';

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
  }
  writeFileSync(path.join(root, 'supabase', 'config.toml'), 'project_id = "fixture"\n');
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
