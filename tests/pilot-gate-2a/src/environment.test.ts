import { describe, expect, it } from 'vitest';

import { readLocalStackEnvironment } from './environment.js';

const validEnvironment: NodeJS.ProcessEnv = {
  SUPABASE_URL: 'http://127.0.0.1:54321',
  SUPABASE_ANON_KEY: 'anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
  DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
  MEDIA_ALLOWED_ORIGIN: 'http://127.0.0.1:54321',
};

describe('readLocalStackEnvironment', () => {
  it.each([
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'DATABASE_URL',
    'MEDIA_ALLOWED_ORIGIN',
  ])('rejects a missing %s without echoing environment values', (missingName) => {
    const source = { ...validEnvironment, [missingName]: undefined };

    expect(() => readLocalStackEnvironment(source)).toThrow('Invalid Pilot Gate 2A environment.');
    expect(() => readLocalStackEnvironment(source)).not.toThrow('anon-key');
  });

  it.each([
    ['SUPABASE_ANON_KEY', 'anon key'],
    ['SUPABASE_SERVICE_ROLE_KEY', 'service\trole-key'],
  ])('rejects whitespace-bearing credential keys', (name, value) => {
    expect(() => readLocalStackEnvironment({ ...validEnvironment, [name]: value })).toThrow(
      'Invalid Pilot Gate 2A environment.',
    );
  });

  it.each([
    ['SUPABASE_URL', 'http://user:password@127.0.0.1:54321'],
    ['MEDIA_ALLOWED_ORIGIN', 'http://user:password@127.0.0.1:54321'],
  ])('rejects credentials embedded in HTTP URLs', (name, value) => {
    expect(() => readLocalStackEnvironment({ ...validEnvironment, [name]: value })).toThrow(
      'Invalid Pilot Gate 2A environment.',
    );
  });

  it.each([
    ['SUPABASE_URL', 'ftp://127.0.0.1:54321'],
    ['SUPABASE_URL', 'https://example.com'],
    ['SUPABASE_URL', 'http://10.0.0.1:54321'],
    ['SUPABASE_URL', 'http://[::1]:54321'],
  ])('rejects a non-HTTP or non-loopback API URL', (name, value) => {
    expect(() => readLocalStackEnvironment({ ...validEnvironment, [name]: value })).toThrow(
      'Invalid Pilot Gate 2A environment.',
    );
  });

  it.each([
    'postgresql://postgres:postgres@localhost:54322/postgres',
    'postgresql://postgres:postgres@10.0.0.1:54322/postgres',
    'postgresql://postgres:other@127.0.0.1:54322/postgres',
    'postgresql://postgres:postgres@127.0.0.1:54323/postgres',
    'postgresql://postgres:postgres@127.0.0.1:54322/other',
  ])('rejects an unexpected local database URL shape', (databaseUrl) => {
    expect(() => readLocalStackEnvironment({ ...validEnvironment, DATABASE_URL: databaseUrl })).toThrow(
      'Invalid Pilot Gate 2A environment.',
    );
  });

  it.each([
    'https://127.0.0.1:54321',
    'http://127.0.0.1:3000',
    'http://localhost:54321',
    'http://127.0.0.1:54321/other',
  ])('rejects an unexpected allowed origin', (allowedOrigin) => {
    expect(() => readLocalStackEnvironment({ ...validEnvironment, MEDIA_ALLOWED_ORIGIN: allowedOrigin })).toThrow(
      'Invalid Pilot Gate 2A environment.',
    );
  });

  it('returns the approved local values without normalization', () => {
    expect(readLocalStackEnvironment(validEnvironment)).toEqual({
      apiUrl: 'http://127.0.0.1:54321',
      anonKey: 'anon-key',
      serviceRoleKey: 'service-role-key',
      databaseUrl: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
      allowedOrigin: 'http://127.0.0.1:54321',
    });
  });
});
