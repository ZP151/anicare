import { describe, expect, it } from 'vitest';

import { sanitizeHostedDiagnostic } from './diagnostics.js';

describe('hosted diagnostic sanitizer', () => {
  it('emits only allowlisted fixed fields and discards recursive sensitive data', () => {
    const secret = 'sb_secret_never_emit_this';
    const output = sanitizeHostedDiagnostic({
      stage: 'checks', code: 'hosted_checks_failed', status: 403, count: 2,
      authorization: `Bearer ${secret}`,
      jwt: 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.signature',
      database: 'postgresql://postgres.ref:password@pooler.example:5432/postgres',
      url: 'https://example.test/path?token=signed-capability',
      user: 'pilot@example.invalid', id: '11111111-1111-4111-8111-111111111111',
      path: 'jobs/11111111-1111-4111-8111-111111111111.jpg', coordinates: [1.3, 103.8],
      body: { receipt: secret }, ansi: '\u001b[31mred\u001b[0m', long: 'x'.repeat(2_000),
    }, [secret]);
    expect(output).toBe('{"stage":"checks","code":"hosted_checks_failed","statusClass":"4xx","count":2}');
    expect(output).not.toMatch(/secret|Bearer|eyJ|postgres|example|11111111|jobs|1\.3|receipt|ansi|xxx/);
  });

  it.each([
    null, new Error('token=secret'), { stage: 'attacker', code: 'anything', status: 999, count: -1 },
  ])('fails closed for unknown input %#', (value) => {
    expect(sanitizeHostedDiagnostic(value, ['secret']))
      .toBe('{"stage":"unknown","code":"hosted_gate_failed"}');
  });
});
