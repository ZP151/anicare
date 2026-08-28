import { describe, expect, it } from 'vitest';

import { sanitizeDiagnostic } from './diagnostics.js';

const LOCAL_DATABASE_USER = 'postgres';
const LOCAL_DATABASE_PASSWORD = LOCAL_DATABASE_USER;

function localDatabaseUrl(): string {
  const url = new URL('postgresql://127.0.0.1');
  url.username = LOCAL_DATABASE_USER;
  url.password = LOCAL_DATABASE_PASSWORD;
  url.port = '54322';
  url.pathname = 'postgres';
  return url.toString();
}

function bearerToken(): string {
  return ['eyJhbGciOiJIUzI1NiJ9', 'eyJzdWIiOiJhY3RvciJ9', 'signature'].join('.');
}

function signedUrl(): string {
  const url = new URL('http://127.0.0.1/upload');
  url.searchParams.set('token', ['signed', 'upload', 'token'].join('-'));
  return url.toString();
}

function requestBody(): string {
  return JSON.stringify({ receipt: ['receipt', 'payload'].join('-') });
}

function storagePath(): string {
  return ['staging', 'synthetic-owner', 'client-media.jpeg'].join('/');
}

function expectNestedSecretRedacted(value: unknown, secrets: readonly string[], secret: string): void {
  const result = sanitizeDiagnostic({ scenario: 'owner-finalize', error: { nested: value } }, secrets);

  expect(JSON.parse(result)).toEqual({ scenario: 'owner-finalize', error: '[redacted]' });
  expect(result).not.toContain(secret);
}

describe('sanitizeDiagnostic', () => {
  it('redacts a nested bearer JWT independently', () => {
    const token = bearerToken();
    expectNestedSecretRedacted(`Bearer ${token}`, [], token);
  });

  it('redacts a nested service key independently', () => {
    const key = ['service', 'role', 'key'].join('-');
    expectNestedSecretRedacted(key, [key], key);
  });

  it('redacts a nested signed query token independently', () => {
    const url = signedUrl();
    expectNestedSecretRedacted(url, [], url);
  });

  it('redacts a nested password independently', () => {
    const password = ['synthetic', 'password'].join('-');
    expectNestedSecretRedacted({ password }, [password], password);
  });

  it('redacts a nested database URL independently', () => {
    const databaseUrl = localDatabaseUrl();
    expectNestedSecretRedacted(databaseUrl, [databaseUrl], databaseUrl);
  });

  it('redacts a nested request body independently', () => {
    const body = requestBody();
    expectNestedSecretRedacted({ request: { body } }, [body], body);
  });

  it('redacts a nested Storage path independently', () => {
    const path = storagePath();
    expectNestedSecretRedacted({ storage: { path } }, [path], path);
  });

  it('redacts a nested secret in another allowed field', () => {
    const key = ['nested', 'service', 'key'].join('-');
    const result = sanitizeDiagnostic({ scenario: { details: [key] } }, [key]);

    expect(JSON.parse(result)).toEqual({ scenario: '[redacted]' });
    expect(result).not.toContain(key);
  });

  it('emits only bounded top-level diagnostic fields', () => {
    expect(
      JSON.parse(
        sanitizeDiagnostic(
          {
            scenario: 'owner-finalize',
            status: 401,
            error: 'UPLOAD_FORBIDDEN',
            count: 1,
            request: { ignored: true },
          },
          [],
        ),
      ),
    ).toEqual({ scenario: 'owner-finalize', status: 401, error: 'UPLOAD_FORBIDDEN', count: 1 });
  });
});
