import { describe, expect, it } from 'vitest';

import { readDeniedStorageFailure, sameDeniedStorageFailure } from './storage-oracle.js';

function response(status: number, body: string) {
  return new Response(body, { status, headers: { 'Content-Type': 'application/json' } });
}

describe('storage denial oracle normalization', () => {
  it('accepts only matching bounded status and allowlisted code', async () => {
    const actual = await readDeniedStorageFailure(response(404, JSON.stringify({ error: 'not_found' })));
    const unknown = await readDeniedStorageFailure(response(404, JSON.stringify({ error: 'Object not found' })));
    expect(actual).toEqual({ status: 404, code: 'not_found' });
    expect(sameDeniedStorageFailure(actual, unknown)).toBe(true);
    expect(sameDeniedStorageFailure(actual, { status: 404, code: 'forbidden' })).toBe(false);
  });

  it('fails closed for success, unknown codes, malformed JSON, or oversized bodies', async () => {
    await expect(readDeniedStorageFailure(response(200, JSON.stringify({ error: 'not_found' })))).resolves.toBeNull();
    await expect(readDeniedStorageFailure(response(404, JSON.stringify({ error: 'database detail' })))).resolves.toBeNull();
    await expect(readDeniedStorageFailure(response(404, 'not-json'))).resolves.toBeNull();
    await expect(readDeniedStorageFailure(response(404, JSON.stringify({
      error: 'not_found', padding: 'x'.repeat(3_000),
    })))).resolves.toBeNull();
  });
});
