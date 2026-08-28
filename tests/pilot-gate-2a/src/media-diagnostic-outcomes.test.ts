import { describe, expect, it } from 'vitest';

import { classifyActorResult } from './media-diagnostic-outcomes.js';

describe('safe media diagnostic outcomes', () => {
  it('classifies a successful actor result as accepted', () => {
    expect(classifyActorResult({ ok: true, status: 200 })).toBe('accepted');
  });

  it('classifies an upload HTTP failure by its bounded integer status', () => {
    expect(classifyActorResult({
      ok: false,
      stage: 'upload',
      kind: 'http',
      status: 409,
      code: 'storage_upload_failed',
    })).toBe('http_409');
  });

  it('does not turn out-of-range or non-integer statuses into diagnostic data', () => {
    for (const status of [99, 600, 409.5, Number.NaN]) {
      const outcome = classifyActorResult({
        ok: false,
        stage: 'upload',
        kind: 'http',
        status,
        code: 'Bearer token body /jobs/11111111-2222-4333-8444-555555555555',
      });
      expect(outcome).toBe('invalid_response');
      expect(outcome).not.toContain(String(status));
      expect(outcome).not.toContain('Bearer');
      expect(outcome).not.toContain('jobs');
    }
  });

  it('classifies network and malformed response failures without exposing their fields', () => {
    expect(classifyActorResult({
      ok: false,
      stage: 'upload',
      kind: 'network',
      status: null,
      code: 'network_error',
    })).toBe('network_failure');
    expect(classifyActorResult({
      ok: false,
      stage: 'upload',
      kind: 'invalid_response',
      status: null,
      code: 'https://127.0.0.1/upload?token=secret',
    })).toBe('invalid_response');
  });

  it('classifies a non-upload actor stage as unexpected_stage', () => {
    expect(classifyActorResult({
      ok: false,
      stage: 'delete',
      kind: 'http',
      status: 409,
      code: 'media_not_found_or_forbidden',
    })).toBe('unexpected_stage');
  });
});
