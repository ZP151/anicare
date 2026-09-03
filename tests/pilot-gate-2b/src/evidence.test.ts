import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { buildReadinessEvidence, hashEdgeFunctionsTree, hashMigrationHead } from './evidence.js';

const roots: string[] = [];

function temporaryRepository(): string {
  const root = mkdtempSync(join(tmpdir(), 'animalhelper-gate-2b-'));
  roots.push(root);
  mkdirSync(join(root, 'supabase', 'migrations'), { recursive: true });
  mkdirSync(join(root, 'supabase', 'functions', 'nested'), { recursive: true });
  writeFileSync(join(root, 'supabase', 'migrations', '202608310009_previous.sql'), 'select 1;\n');
  writeFileSync(join(root, 'supabase', 'migrations', '202608310010_current.sql'), 'select 2;\n');
  writeFileSync(join(root, 'supabase', 'functions', 'z.ts'), 'export const z = 1;\n');
  writeFileSync(join(root, 'supabase', 'functions', 'nested', 'a.ts'), 'export const a = 2;\n');
  return root;
}

function input() {
  return {
    sourceCommit: 'a'.repeat(40),
    migrationHead: { filename: '202608310010_current.sql', sha256: 'b'.repeat(64) },
    edgeFunctionsTreeSha256: 'c'.repeat(64),
    workflowRunId: 123456789,
    workflowRunAttempt: 1,
    createdAt: '2026-09-03T01:02:03.004Z',
    checks: {
      authRedirectCheck: 'passed',
      mediaStagingCheck: 'passed',
      publicKeyOriginCheck: 'passed',
      syntheticOwnerHappyPath: 'passed',
      crossOwnerIsolation: 'passed',
    },
  } as const;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('Gate 2B evidence', () => {
  it('builds the exact canonical 15-field schema with a 72-hour validity window', () => {
    const evidence = buildReadinessEvidence(input());
    expect(Object.keys(evidence)).toEqual([
      'schemaVersion', 'projectRef', 'projectOrigin', 'sourceCommit', 'migrationHead',
      'edgeFunctionsTreeSha256', 'workflowRunId', 'workflowRunAttempt', 'createdAt', 'expiresAt',
      'authRedirectCheck', 'mediaStagingCheck', 'publicKeyOriginCheck',
      'syntheticOwnerHappyPath', 'crossOwnerIsolation',
    ]);
    expect(evidence).toEqual({
      schemaVersion: 1,
      projectRef: 'fhugdtpjbgiatqhvjioy',
      projectOrigin: 'https://fhugdtpjbgiatqhvjioy.supabase.co',
      sourceCommit: 'a'.repeat(40),
      migrationHead: { filename: '202608310010_current.sql', sha256: 'b'.repeat(64) },
      edgeFunctionsTreeSha256: 'c'.repeat(64),
      workflowRunId: 123456789,
      workflowRunAttempt: 1,
      createdAt: '2026-09-03T01:02:03.004Z',
      expiresAt: '2026-09-06T01:02:03.004Z',
      ...input().checks,
    });
    expect(Object.keys(evidence)).not.toEqual(expect.arrayContaining([
      'password', 'token', 'databaseUrl', 'serviceRoleKey', 'publicKey',
    ]));
  });

  it.each([
    { sourceCommit: 'A'.repeat(40) },
    { edgeFunctionsTreeSha256: 'C'.repeat(64) },
    { workflowRunId: 0 },
    { workflowRunAttempt: 1.5 },
    { createdAt: '2026-09-03T01:02:03Z' },
    { checks: { ...input().checks, crossOwnerIsolation: 'failed' } },
  ])('rejects invalid or unsuccessful evidence input', (change) => {
    expect(() => buildReadinessEvidence({ ...input(), ...change } as never))
      .toThrow('gate_2b_evidence_invalid');
  });

  it('hashes the latest regular migration by filename and bytes', () => {
    const root = temporaryRepository();
    expect(hashMigrationHead(root)).toEqual({
      filename: '202608310010_current.sql',
      sha256: createHash('sha256').update('select 2;\n').digest('hex'),
    });
  });

  it('hashes Edge files deterministically with sorted POSIX-relative names and framing', () => {
    const first = temporaryRepository();
    const second = temporaryRepository();
    rmSync(join(second, 'supabase', 'functions'), { recursive: true });
    mkdirSync(join(second, 'supabase', 'functions', 'nested'), { recursive: true });
    writeFileSync(join(second, 'supabase', 'functions', 'nested', 'a.ts'), 'export const a = 2;\n');
    writeFileSync(join(second, 'supabase', 'functions', 'z.ts'), 'export const z = 1;\n');

    const original = hashEdgeFunctionsTree(first);
    expect(hashEdgeFunctionsTree(second)).toBe(original);
    writeFileSync(join(second, 'supabase', 'functions', 'z.ts'), 'export const z = 3;\n');
    expect(hashEdgeFunctionsTree(second)).not.toBe(original);
  });

  it('matches the current repository migration head', () => {
    const repositoryRoot = resolve(import.meta.dirname, '..', '..', '..');
    const result = hashMigrationHead(repositoryRoot);
    expect(result.filename).toBe('202609030001_finalize_media_preflight.sql');
    expect(result.sha256).toBe(
      createHash('sha256')
        .update(readFileSync(join(repositoryRoot, 'supabase', 'migrations', result.filename)))
        .digest('hex'),
    );
  });
});
