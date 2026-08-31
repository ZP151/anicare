import { describe, expect, it } from 'vitest';

import { encryptPreciseLocation } from './encryption.js';

describe('encryptPreciseLocation', () => {
  it('encrypts coordinates with AES-GCM and a fresh 96-bit nonce', async () => {
    const keyBytes = new Uint8Array(32).fill(7);
    const encrypted = await encryptPreciseLocation(
      { latitude: 1.3521, longitude: 103.8198 },
      keyBytes,
    );

    expect(encrypted.nonce).toHaveLength(12);
    expect(new TextDecoder().decode(encrypted.ciphertext)).not.toContain('103.8198');

    const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['decrypt']);
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: encrypted.nonce },
      key,
      encrypted.ciphertext,
    );
    expect(JSON.parse(new TextDecoder().decode(plaintext))).toEqual({
      latitude: 1.3521,
      longitude: 103.8198,
    });
  });
});

