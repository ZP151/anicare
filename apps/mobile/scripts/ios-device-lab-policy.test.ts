import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  evaluateDeviceLabInputs,
  evaluateGate2BReadiness,
  type DeviceLabInputCode,
  type Gate2BReadinessCode,
} from './ios-device-lab-policy';

const hostedOrigin = 'https://fhugdtpjbgiatqhvjioy.supabase.co';
const compileProbe = {
  googleMapsIosApiKey: 'compile-probe-google-maps-ios-key',
  supabaseUrl: 'https://compile-probe.invalid',
  supabasePublicKey: 'compile-probe-supabase-public-key',
} as const;
const validManualInput = {
  eventName: 'workflow_dispatch',
  ref: 'refs/heads/main',
  googleMapsIosApiKey: 'AIzaSyD-device-lab-test-key',
  supabaseUrl: hostedOrigin,
  supabasePublicKey: 'sb_publishable_device_lab_test_key',
} as const;
const anonJwt = [
  'eyJhbGciOiJub25lIn0',
  'eyJyb2xlIjoiYW5vbiJ9',
  'signature',
].join('.');
const serviceRoleJwt = [
  'eyJhbGciOiJub25lIn0',
  'eyJyb2xlIjoic2VydmljZV9yb2xlIn0',
  'signature',
].join('.');

const validEvidence = {
  schemaVersion: 1,
  projectRef: 'fhugdtpjbgiatqhvjioy',
  projectOrigin: hostedOrigin,
  sourceCommit: 'a'.repeat(40),
  migrationHead: {
    filename: '20260903000000_device_lab.sql',
    sha256: 'b'.repeat(64),
  },
  edgeFunctionsTreeSha256: 'c'.repeat(64),
  workflowRunId: 123456789,
  workflowRunAttempt: 1,
  createdAt: '2026-09-03T00:00:00.000Z',
  expiresAt: '2026-09-04T00:00:00.000Z',
  authRedirectCheck: 'passed',
  mediaStagingCheck: 'passed',
  publicKeyOriginCheck: 'passed',
  syntheticOwnerHappyPath: 'passed',
  crossOwnerIsolation: 'passed',
} as const;

const readinessInput = {
  evidence: validEvidence,
  nowIso: '2026-09-03T12:00:00.000Z',
  candidateCommit: 'd'.repeat(40),
  isAncestor: (source: string, candidate: string) =>
    source === validEvidence.sourceCommit && candidate === 'd'.repeat(40),
  migrationHead: validEvidence.migrationHead,
  edgeFunctionsTreeSha256: validEvidence.edgeFunctionsTreeSha256,
} as const;

describe('iOS Device Lab input policy', () => {
  it('accepts only the repository compile placeholders for a pull-request probe', () => {
    expect(evaluateDeviceLabInputs({
      eventName: 'pull_request',
      ref: 'refs/pull/42/merge',
      ...compileProbe,
    })).toEqual({ ok: true, mode: 'compile_probe' });
  });

  it('accepts a manual main candidate with a publishable key or legacy anon JWT', () => {
    expect(evaluateDeviceLabInputs(validManualInput)).toEqual({ ok: true, mode: 'device_candidate' });
    expect(evaluateDeviceLabInputs({ ...validManualInput, supabasePublicKey: anonJwt }))
      .toEqual({ ok: true, mode: 'device_candidate' });
  });

  it.each([
    ['an unapproved event', { ...validManualInput, eventName: 'push' }, 'event_not_allowed'],
    ['a PR value other than the repository placeholders', {
      ...validManualInput, eventName: 'pull_request', ref: 'refs/pull/42/merge',
    }, 'compile_probe_placeholder_invalid'],
    ['a manual ref other than main', { ...validManualInput, ref: 'refs/heads/feature/device-lab' }, 'manual_ref_invalid'],
    ['a missing maps key', { ...validManualInput, googleMapsIosApiKey: undefined }, 'maps_ios_key_missing'],
    ['a whitespace maps key', { ...validManualInput, googleMapsIosApiKey: 'a maps key' }, 'maps_ios_key_whitespace'],
    ['a known placeholder maps key', { ...validManualInput, googleMapsIosApiKey: 'YOUR_GOOGLE_MAPS_IOS_API_KEY' }, 'maps_ios_key_placeholder'],
    ['a missing Supabase URL', { ...validManualInput, supabaseUrl: undefined }, 'supabase_url_missing'],
    ['a whitespace Supabase URL', { ...validManualInput, supabaseUrl: `${hostedOrigin} ` }, 'supabase_url_whitespace'],
    ['an HTTP Supabase URL', { ...validManualInput, supabaseUrl: 'http://fhugdtpjbgiatqhvjioy.supabase.co' }, 'supabase_url_invalid'],
    ['a userinfo Supabase URL', { ...validManualInput, supabaseUrl: 'https://user@fhugdtpjbgiatqhvjioy.supabase.co' }, 'supabase_url_invalid'],
    ['a query Supabase URL', { ...validManualInput, supabaseUrl: `${hostedOrigin}?x=1` }, 'supabase_url_invalid'],
    ['a fragment Supabase URL', { ...validManualInput, supabaseUrl: `${hostedOrigin}#fragment` }, 'supabase_url_invalid'],
    ['a loopback Supabase URL', { ...validManualInput, supabaseUrl: 'https://127.0.0.1' }, 'supabase_url_invalid'],
    ['a wrong-host Supabase URL', { ...validManualInput, supabaseUrl: 'https://other.supabase.co' }, 'supabase_url_invalid'],
    ['a missing Supabase public key', { ...validManualInput, supabasePublicKey: undefined }, 'supabase_public_key_missing'],
    ['a whitespace Supabase public key', { ...validManualInput, supabasePublicKey: 'sb_publishable_bad key' }, 'supabase_public_key_whitespace'],
    ['a known placeholder public key', { ...validManualInput, supabasePublicKey: 'compile-probe-supabase-public-key' }, 'supabase_public_key_placeholder'],
    ['a secret-prefixed key', { ...validManualInput, supabasePublicKey: 'sb_secret_do_not_accept' }, 'supabase_public_key_privileged'],
    ['a service-role JWT', { ...validManualInput, supabasePublicKey: serviceRoleJwt }, 'supabase_public_key_privileged'],
    ['a malformed JWT', { ...validManualInput, supabasePublicKey: 'eyJhbGciOiJub25lIn0.not-json.signature' }, 'supabase_public_key_invalid'],
    ['a JWT with a non-anon role', { ...validManualInput, supabasePublicKey: [
      'eyJhbGciOiJub25lIn0', 'eyJyb2xlIjoiYXV0aGVudGljYXRlZCJ9', 'signature',
    ].join('.') }, 'supabase_public_key_invalid'],
  ] as const)('rejects %s with a bounded code', (_description, input, code) => {
    const result = evaluateDeviceLabInputs(input);

    expect(result).toEqual(expect.objectContaining({ ok: false }));
    if (result.ok) throw new Error('expected a rejected Device Lab input');
    expect(result.codes).toContain(code as DeviceLabInputCode);
    expect(JSON.stringify(result.codes)).not.toContain('AIzaSyD-device-lab-test-key');
    expect(JSON.stringify(result.codes)).not.toContain('sb_secret_do_not_accept');
    expect(result.codes.every((value) => /^[a-z0-9_]+$/.test(value))).toBe(true);
  });

  it('writes only bounded input codes from the CLI adapter', () => {
    const script = resolve(__dirname, 'validate-ios-device-lab.ts');
    const invalid = spawnSync(process.execPath, [require.resolve('tsx/cli'), script], {
      encoding: 'utf8',
      env: {
        ...process.env,
        GITHUB_EVENT_NAME: 'workflow_dispatch',
        GITHUB_REF: 'refs/heads/main',
        GOOGLE_MAPS_IOS_API_KEY: 'AIzaSyD-device-lab-test-key',
        EXPO_PUBLIC_SUPABASE_URL: hostedOrigin,
        EXPO_PUBLIC_SUPABASE_ANON_KEY: 'sb_secret_do_not_accept',
      },
    });

    expect(invalid.status).toBe(1);
    expect(invalid.stdout).toBe('');
    expect(invalid.stderr.trim()).toBe('supabase_public_key_privileged');
    expect(`${invalid.stdout}${invalid.stderr}`).not.toContain('sb_secret_do_not_accept');
  });
});

describe('Gate 2B readiness policy', () => {
  it('accepts current, fully-passed readiness evidence from an ancestor source', () => {
    expect(evaluateGate2BReadiness(readinessInput)).toEqual([]);
  });

  it('accepts the exact creation boundary but rejects future-dated readiness evidence', () => {
    expect(evaluateGate2BReadiness({ ...readinessInput, nowIso: validEvidence.createdAt })).toEqual([]);
    expect(evaluateGate2BReadiness({ ...readinessInput, nowIso: '2026-09-02T23:59:59.999Z' }))
      .toContain('evidence_timestamps_invalid');
  });

  it('keeps the readiness schema timestamps no wider than the canonical millisecond UTC form', () => {
    const schemaPath = resolve(__dirname, '../../../docs/evidence/pilot-gate-2b-readiness.schema.json');
    const schema = JSON.parse(readFileSync(schemaPath, 'utf8')) as {
      properties: Record<string, { type: string; format: string; pattern?: string }>;
    };
    const canonicalPattern = '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$';

    for (const name of ['createdAt', 'expiresAt']) {
      expect(schema.properties[name]).toEqual({ type: 'string', format: 'date-time', pattern: canonicalPattern });
      const pattern = new RegExp(schema.properties[name].pattern ?? '');
      expect(pattern.test('2026-09-03T00:00:00.000Z')).toBe(true);
      expect(pattern.test('2026-09-03T00:00:00Z')).toBe(false);
    }
  });

  it.each([
    ['a non-record evidence value', null, 'evidence_shape_invalid'],
    ['an unknown evidence field', { ...validEvidence, unexpected: true }, 'evidence_shape_invalid'],
    ['a missing required evidence field', (() => {
      const { crossOwnerIsolation: _removed, ...evidence } = validEvidence;
      return evidence;
    })(), 'evidence_shape_invalid'],
    ['an unsupported schema version', { ...validEvidence, schemaVersion: 2 }, 'evidence_schema_version_invalid'],
    ['a changed project ref', { ...validEvidence, projectRef: 'other-project' }, 'evidence_project_invalid'],
    ['a changed project origin', { ...validEvidence, projectOrigin: 'https://other.supabase.co' }, 'evidence_project_invalid'],
    ['a failed approved readiness result', { ...validEvidence, mediaStagingCheck: 'failed' }, 'evidence_checks_failed'],
    ['an invalid readiness result enum', { ...validEvidence, authRedirectCheck: 'unknown' }, 'evidence_shape_invalid'],
    ['a malformed source commit', { ...validEvidence, sourceCommit: 'not-a-commit' }, 'evidence_shape_invalid'],
    ['a malformed migration hash', { ...validEvidence, migrationHead: { ...validEvidence.migrationHead, sha256: 'bad' } }, 'evidence_shape_invalid'],
    ['a malformed Edge Functions hash', { ...validEvidence, edgeFunctionsTreeSha256: 'bad' }, 'evidence_shape_invalid'],
    ['a non-positive evidence window', { ...validEvidence, expiresAt: validEvidence.createdAt }, 'evidence_timestamps_invalid'],
    ['an evidence window longer than 72 hours', { ...validEvidence, expiresAt: '2026-09-06T00:00:00.001Z' }, 'evidence_timestamps_invalid'],
    ['expired evidence at the exact expiry boundary', { ...validEvidence, expiresAt: '2026-09-03T12:00:00.000Z' }, 'evidence_expired'],
  ] as const)('rejects %s with a bounded code', (_description, evidence, code) => {
    const codes = evaluateGate2BReadiness({ ...readinessInput, evidence });

    expect(codes).toContain(code as Gate2BReadinessCode);
    expect(codes.every((value) => /^[a-z0-9_]+$/.test(value))).toBe(true);
  });

  it.each([
    ['an invalid current time', { ...readinessInput, nowIso: 'not-a-time' }, 'evidence_timestamps_invalid'],
    ['a short candidate commit', { ...readinessInput, candidateCommit: 'abc123' }, 'candidate_commit_invalid'],
    ['a branch-like candidate commit', { ...readinessInput, candidateCommit: 'refs/heads/main' }, 'candidate_commit_invalid'],
    ['an uppercase candidate commit', { ...readinessInput, candidateCommit: 'D'.repeat(40) }, 'candidate_commit_invalid'],
    ['a non-hex candidate commit', { ...readinessInput, candidateCommit: `${'d'.repeat(39)}g` }, 'candidate_commit_invalid'],
    ['an unrelated source commit', { ...readinessInput, isAncestor: () => false }, 'evidence_source_not_ancestor'],
    ['a changed migration filename', { ...readinessInput, migrationHead: { ...validEvidence.migrationHead, filename: '20260904000000_changed.sql' } }, 'evidence_migration_head_mismatch'],
    ['a changed migration hash', { ...readinessInput, migrationHead: { ...validEvidence.migrationHead, sha256: 'd'.repeat(64) } }, 'evidence_migration_head_mismatch'],
    ['a changed Edge Functions hash', { ...readinessInput, edgeFunctionsTreeSha256: 'd'.repeat(64) }, 'evidence_edge_functions_tree_mismatch'],
  ] as const)('rejects %s with a bounded code', (_description, input, code) => {
    expect(evaluateGate2BReadiness(input)).toContain(code as Gate2BReadinessCode);
  });

  it('does not authorize an invalid candidate commit through the ancestry callback', () => {
    let ancestryWasCalled = false;
    const codes = evaluateGate2BReadiness({
      ...readinessInput,
      candidateCommit: 'not-an-immutable-commit',
      isAncestor: () => {
        ancestryWasCalled = true;
        return true;
      },
    });

    expect(codes).toContain('candidate_commit_invalid');
    expect(ancestryWasCalled).toBe(false);
  });
});
