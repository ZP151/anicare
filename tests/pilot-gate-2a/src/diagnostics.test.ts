import { describe, expect, it } from 'vitest';

import { sanitizeDiagnostic } from './diagnostics.js';

describe('sanitizeDiagnostic', () => {
  it('emits only bounded diagnostic fields and redacts all capability-bearing values', () => {
    const bearerJwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhY3RvciJ9.signature';
    const serviceKey = 'service-role-key';
    const signedToken = 'signed-upload-token';
    const password = 'synthetic-password';
    const databaseUrl = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
    const storagePath = 'staging/owner-id/client-media-id.jpeg';
    const body = '{"receipt":"receipt-secret"}';

    const result = sanitizeDiagnostic(
      {
        scenario: 'owner-finalize',
        status: 401,
        error: `Bearer ${bearerJwt}; key=${serviceKey}; https://127.0.0.1/upload?token=${signedToken}; password=${password}; ${databaseUrl}; ${storagePath}; ${body}`,
        count: 1,
        authorization: `Bearer ${bearerJwt}`,
        request: { body, storagePath },
        databaseUrl,
      },
      [serviceKey, signedToken, password, databaseUrl],
    );

    expect(JSON.parse(result)).toEqual({
      scenario: 'owner-finalize',
      status: 401,
      error: '[redacted]',
      count: 1,
    });
    for (const secret of [bearerJwt, serviceKey, signedToken, password, databaseUrl, storagePath, body]) {
      expect(result).not.toContain(secret);
    }
  });

  it('bounds malformed diagnostic values instead of serializing nested input', () => {
    expect(
      JSON.parse(
        sanitizeDiagnostic(
          {
            scenario: 'x'.repeat(129),
            status: 999,
            error: { message: 'request body must not be logged' },
            count: -1,
            nested: { scenario: 'nested-scenario', status: 500 },
          },
          [],
        ),
      ),
    ).toEqual({});
  });
});
