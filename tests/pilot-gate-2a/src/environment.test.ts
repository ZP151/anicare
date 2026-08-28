import { describe, expect, it } from 'vitest';

import { readLocalStackEnvironment } from './environment.js';

const LOCAL_DATABASE_USER = 'postgres';
const LOCAL_DATABASE_PASSWORD = LOCAL_DATABASE_USER;
const LOCAL_DATABASE_HOST = '127.0.0.1';
const LOCAL_DATABASE_PORT = '54322';
const LOCAL_DATABASE_NAME = 'postgres';
const LOCAL_API_URL = 'http://127.0.0.1:54321';
const LOCAL_CORS_ORIGIN = 'http://127.0.0.1:8081';

function localDatabaseUrl(overrides: Partial<URL> = {}): string {
  const url = new URL(`postgresql://${LOCAL_DATABASE_HOST}`);
  url.username = LOCAL_DATABASE_USER;
  url.password = LOCAL_DATABASE_PASSWORD;
  url.port = LOCAL_DATABASE_PORT;
  url.pathname = LOCAL_DATABASE_NAME;
  Object.assign(url, overrides);
  return url.toString();
}

function localHttpUrl(overrides: Partial<URL> = {}): string {
  const url = new URL(LOCAL_API_URL);
  Object.assign(url, overrides);
  return url.toString().replace(/\/$/, '');
}

function localAnonKey(): string {
  return ['anon', 'key'].join('-');
}

function localServiceRoleKey(): string {
  return ['service', 'role', 'key'].join('-');
}

function localPreciseLocationEncryptionKey(): string {
  return Buffer.alloc(32, 17).toString('base64');
}

function localEnvironment(): NodeJS.ProcessEnv {
  return {
    SUPABASE_URL: LOCAL_API_URL,
    SUPABASE_ANON_KEY: localAnonKey(),
    SUPABASE_SERVICE_ROLE_KEY: localServiceRoleKey(),
    DATABASE_URL: localDatabaseUrl(),
    MEDIA_ALLOWED_ORIGIN: LOCAL_CORS_ORIGIN,
    PRECISE_LOCATION_ENCRYPTION_KEY: localPreciseLocationEncryptionKey(),
  };
}

describe('readLocalStackEnvironment', () => {
  it.each([
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'DATABASE_URL',
    'MEDIA_ALLOWED_ORIGIN',
    'PRECISE_LOCATION_ENCRYPTION_KEY',
  ])('rejects a missing %s without echoing environment values', (missingName) => {
    const source = { ...localEnvironment(), [missingName]: undefined };

    expect(() => readLocalStackEnvironment(source)).toThrow('Invalid Pilot Gate 2A environment.');
    expect(() => readLocalStackEnvironment(source)).not.toThrow(localAnonKey());
  });

  it.each([
    ['SUPABASE_ANON_KEY', 'anon key'],
    ['SUPABASE_SERVICE_ROLE_KEY', 'service\trole-key'],
  ])('rejects whitespace-bearing credential keys', (name, value) => {
    expect(() => readLocalStackEnvironment({ ...localEnvironment(), [name]: value })).toThrow(
      'Invalid Pilot Gate 2A environment.',
    );
  });

  it.each([
    ['non-standard alphabet', ['A'.repeat(43), '-'].join('')],
    ['invalid padding', ['A'.repeat(42), '=='].join('')],
    ['non-canonical trailing bits', ['A'.repeat(42), 'B='].join('')],
    ['wrong decoded length', Buffer.alloc(31, 17).toString('base64')],
  ])('rejects a %s precise-location encryption key', (_name, key) => {
    expect(() => readLocalStackEnvironment({ ...localEnvironment(), PRECISE_LOCATION_ENCRYPTION_KEY: key })).toThrow(
      'Invalid Pilot Gate 2A environment.',
    );
  });

  it.each([
    ['SUPABASE_URL', localHttpUrl({ username: 'user', password: ['pass', 'word'].join('') })],
    ['MEDIA_ALLOWED_ORIGIN', localHttpUrl({ username: 'user', password: ['pass', 'word'].join('') })],
  ])('rejects credentials embedded in HTTP URLs', (name, value) => {
    expect(() => readLocalStackEnvironment({ ...localEnvironment(), [name]: value })).toThrow(
      'Invalid Pilot Gate 2A environment.',
    );
  });

  it.each([
    ['SUPABASE_URL', 'ftp://127.0.0.1:54321'],
    ['SUPABASE_URL', 'https://example.com'],
    ['SUPABASE_URL', 'http://10.0.0.1:54321'],
    ['SUPABASE_URL', 'http://[::1]:54321'],
  ])('rejects a non-HTTP or non-loopback API URL', (name, value) => {
    expect(() => readLocalStackEnvironment({ ...localEnvironment(), [name]: value })).toThrow(
      'Invalid Pilot Gate 2A environment.',
    );
  });

  it.each([
    () => localDatabaseUrl({ hostname: 'localhost' }),
    () => localDatabaseUrl({ hostname: '10.0.0.1' }),
    () => localDatabaseUrl({ password: 'other' }),
    () => localDatabaseUrl({ port: '54323' }),
    () => localDatabaseUrl({ pathname: 'other' }),
  ])('rejects an unexpected local database URL shape', (databaseUrl) => {
    expect(() => readLocalStackEnvironment({ ...localEnvironment(), DATABASE_URL: databaseUrl() })).toThrow(
      'Invalid Pilot Gate 2A environment.',
    );
  });

  it.each([
    'https://127.0.0.1:54321',
    'http://10.0.0.1:8081',
    'http://localhost:54321',
    'http://127.0.0.1:54321/other',
  ])('rejects an unexpected allowed origin', (allowedOrigin) => {
    expect(() => readLocalStackEnvironment({ ...localEnvironment(), MEDIA_ALLOWED_ORIGIN: allowedOrigin })).toThrow(
      'Invalid Pilot Gate 2A environment.',
    );
  });

  it('returns the approved local values without normalization', () => {
    expect(readLocalStackEnvironment(localEnvironment())).toEqual({
      apiUrl: LOCAL_API_URL,
      anonKey: localAnonKey(),
      serviceRoleKey: localServiceRoleKey(),
      databaseUrl: localDatabaseUrl(),
      allowedOrigin: LOCAL_CORS_ORIGIN,
      preciseLocationEncryptionKey: localPreciseLocationEncryptionKey(),
    });
  });
});
