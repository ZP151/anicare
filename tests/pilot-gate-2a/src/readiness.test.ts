import { describe, expect, it } from 'vitest';

import { postgrestReadinessRequest } from './readiness.js';

describe('postgrestReadinessRequest', () => {
  it('uses a bodyless HEAD request for PostgREST readiness', () => {
    const request = postgrestReadinessRequest(
      ['http:', '//127.0.0.1:54321'].join(''),
      ['synthetic', 'anon', 'key'].join('-'),
    );

    expect(request.method).toBe('HEAD');
    expect(request.body).toBeNull();
    expect(request.headers.get('apikey')).toBe(['synthetic', 'anon', 'key'].join('-'));
  });
});
