import { describe, expect, it } from 'vitest';

import { readHostedGateEnvironment } from './environment.js';

const PROJECT_ORIGIN = 'https://fhugdtpjbgiatqhvjioy.supabase.co';
const POOLER_HOST = 'aws-0-ap-southeast-1.pooler.supabase.com';

function hostedEnvironment(): NodeJS.ProcessEnv {
  return {
    SUPABASE_URL: PROJECT_ORIGIN,
    SUPABASE_PUBLIC_KEY: 'sb_publishable_hosted_gate_test_key',
    SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_hosted_gate_test_key',
    SUPABASE_DATABASE_URL:
      `postgresql://postgres.fhugdtpjbgiatqhvjioy:database-password@${POOLER_HOST}:5432/postgres`,
    PRECISE_LOCATION_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
    GITHUB_SHA: 'a'.repeat(40),
    GITHUB_RUN_ID: '123456789',
    GITHUB_RUN_ATTEMPT: '1',
  };
}

describe('hosted Gate 2B environment', () => {
  it('accepts only the fixed hosted project and reviewed pooler identity', () => {
    expect(readHostedGateEnvironment(hostedEnvironment())).toMatchObject({
      apiUrl: PROJECT_ORIGIN,
      sourceCommit: 'a'.repeat(40),
      workflowRunId: 123456789,
      workflowRunAttempt: 1,
    });
    expect(() => readHostedGateEnvironment({
      ...hostedEnvironment(),
      SUPABASE_URL: 'https://other.supabase.co',
    })).toThrow('hosted_environment_invalid');
  });

  it.each([
    'SUPABASE_URL',
    'SUPABASE_PUBLIC_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'SUPABASE_DATABASE_URL',
    'PRECISE_LOCATION_ENCRYPTION_KEY',
    'GITHUB_SHA',
    'GITHUB_RUN_ID',
    'GITHUB_RUN_ATTEMPT',
  ])('rejects missing or empty %s', (name) => {
    const missing = hostedEnvironment();
    delete missing[name];
    expect(() => readHostedGateEnvironment(missing)).toThrow('hosted_environment_invalid');
    expect(() => readHostedGateEnvironment({ ...hostedEnvironment(), [name]: '' }))
      .toThrow('hosted_environment_invalid');
  });

  it.each([' leading', 'trailing ', 'line\nbreak', 'carriage\rreturn', 'nul\0byte'])
    ('rejects unsafe credential text %j', (value) => {
      expect(() => readHostedGateEnvironment({
        ...hostedEnvironment(),
        SUPABASE_PUBLIC_KEY: value,
      })).toThrow('hosted_environment_invalid');
    });

  it.each([
    'http://fhugdtpjbgiatqhvjioy.supabase.co',
    'https://user@fhugdtpjbgiatqhvjioy.supabase.co',
    'https://fhugdtpjbgiatqhvjioy.supabase.co/path',
    'https://fhugdtpjbgiatqhvjioy.supabase.co?query=1',
    'https://fhugdtpjbgiatqhvjioy.supabase.co/#fragment',
    'https://fhugdtpjbgiatqhvjioy.supabase.co:8443',
  ])('rejects nonexact API origin %s', (value) => {
    expect(() => readHostedGateEnvironment({ ...hostedEnvironment(), SUPABASE_URL: value }))
      .toThrow('hosted_environment_invalid');
  });

  it.each([
    'postgres://postgres.fhugdtpjbgiatqhvjioy:database-password@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres',
    'postgresql://postgres:database-password@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres',
    'postgresql://postgres.fhugdtpjbgiatqhvjioy:database-password@other.pooler.supabase.com:5432/postgres',
    'postgresql://postgres.fhugdtpjbgiatqhvjioy:database-password@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres',
    'postgresql://postgres.fhugdtpjbgiatqhvjioy:database-password@aws-0-ap-southeast-1.pooler.supabase.com:5432/other',
    'postgresql://postgres.fhugdtpjbgiatqhvjioy@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres',
    'postgresql://postgres.fhugdtpjbgiatqhvjioy:database-password@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres?sslmode=require',
    'postgresql://postgres.fhugdtpjbgiatqhvjioy:database-password@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres#fragment',
  ])('rejects an unreviewed database URL %s', (value) => {
    expect(() => readHostedGateEnvironment({ ...hostedEnvironment(), SUPABASE_DATABASE_URL: value }))
      .toThrow('hosted_environment_invalid');
  });

  it('rejects key privilege confusion', () => {
    expect(() => readHostedGateEnvironment({
      ...hostedEnvironment(),
      SUPABASE_PUBLIC_KEY: 'sb_secret_wrong_side',
    })).toThrow('hosted_environment_invalid');
    expect(() => readHostedGateEnvironment({
      ...hostedEnvironment(),
      SUPABASE_SERVICE_ROLE_KEY: 'sb_publishable_wrong_side',
    })).toThrow('hosted_environment_invalid');
    expect(() => readHostedGateEnvironment({
      ...hostedEnvironment(),
      SUPABASE_SERVICE_ROLE_KEY: 'sb_publishable_hosted_gate_test_key',
    })).toThrow('hosted_environment_invalid');
  });

  it.each([
    Buffer.alloc(31, 7).toString('base64'),
    Buffer.alloc(33, 7).toString('base64'),
    `${Buffer.alloc(32, 7).toString('base64')}=`,
    'not-base64',
  ])('rejects malformed encryption key %s', (value) => {
    expect(() => readHostedGateEnvironment({
      ...hostedEnvironment(),
      PRECISE_LOCATION_ENCRYPTION_KEY: value,
    })).toThrow('hosted_environment_invalid');
  });

  it.each([
    ['GITHUB_SHA', 'A'.repeat(40)],
    ['GITHUB_SHA', 'a'.repeat(39)],
    ['GITHUB_RUN_ID', '0'],
    ['GITHUB_RUN_ID', '01'],
    ['GITHUB_RUN_ID', '1.5'],
    ['GITHUB_RUN_ATTEMPT', '-1'],
    ['GITHUB_RUN_ATTEMPT', `${Number.MAX_SAFE_INTEGER + 1}`],
  ])('rejects noncanonical metadata %s=%s', (name, value) => {
    expect(() => readHostedGateEnvironment({ ...hostedEnvironment(), [name]: value }))
      .toThrow('hosted_environment_invalid');
  });
});
