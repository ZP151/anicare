export interface EncryptedLocation {
  ciphertext: Uint8Array;
  nonce: Uint8Array;
}

export async function encryptPreciseLocation(
  coordinates: { latitude: number; longitude: number },
  keyBytes: Uint8Array,
): Promise<EncryptedLocation> {
  if (keyBytes.byteLength !== 32) {
    throw new Error('Precise location encryption key must be 32 bytes');
  }

  const keyMaterial = new Uint8Array(keyBytes.byteLength);
  keyMaterial.set(keyBytes);
  const key = await crypto.subtle.importKey('raw', keyMaterial.buffer, 'AES-GCM', false, ['encrypt']);
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(coordinates));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, plaintext);

  return { ciphertext: new Uint8Array(ciphertext), nonce };
}
