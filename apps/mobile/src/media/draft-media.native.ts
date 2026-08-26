import * as Crypto from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';

import type { MediaReviewState } from './contracts';
import { canStageMedia } from './review-policy';

const REVIEWED_MEDIA_KEY_NAME = 'animalhelper.reviewed-media.v1';
const ENCRYPTION_VERSION = 'aes-256-gcm.v1' as const;

export type DraftMediaDependencies = Readonly<{
  getOrCreateKey(): Promise<unknown>;
  readBytes(uri: string): Promise<Uint8Array>;
  sha256(bytes: Uint8Array): Promise<string>;
  encrypt(bytes: Uint8Array, key: unknown, additionalAuthenticatedData: string): Promise<Uint8Array>;
  writeEncrypted(mediaId: string, bytes: Uint8Array): Promise<string>;
  deleteTransient(uri: string): Promise<void>;
}>;

export type PersistReviewedMediaInput = Readonly<{
  draftId: string;
  mediaId: string;
  review: MediaReviewState;
  transientUris: readonly string[];
}>;

export type PersistedReviewedMedia = Readonly<{
  encryptedReviewedPath: string;
  encryptionVersion: typeof ENCRYPTION_VERSION;
  mediaId: string;
}>;

function stableId(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9-]{7,63}$/.test(value);
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function authenticatedContext(input: PersistReviewedMediaInput): string {
  const receipt = input.review.receipt!;
  return JSON.stringify({
    draftId: input.draftId,
    mediaId: input.mediaId,
    sanitizedSha256: receipt.sanitizedSha256,
    recipeVersion: receipt.recipeVersion,
    detectorVersions: Object.fromEntries(Object.entries(receipt.detectorVersions).sort(([a], [b]) => a.localeCompare(b))),
    width: receipt.width,
    height: receipt.height,
    byteLength: receipt.byteLength,
    encryptionVersion: ENCRYPTION_VERSION,
  });
}

async function getOrCreateNativeKey(): Promise<Crypto.AESEncryptionKey> {
  if (!await SecureStore.isAvailableAsync()) throw new Error('secure_media_storage_unavailable');
  const stored = await SecureStore.getItemAsync(REVIEWED_MEDIA_KEY_NAME);
  if (stored) return Crypto.AESEncryptionKey.import(stored, 'base64') as Promise<Crypto.AESEncryptionKey>;

  const key = await Crypto.AESEncryptionKey.generate(Crypto.AESKeySize.AES256) as Crypto.AESEncryptionKey;
  const encoded = await key.encoded('base64');
  await SecureStore.setItemAsync(REVIEWED_MEDIA_KEY_NAME, encoded, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  return key;
}

const nativeDependencies: DraftMediaDependencies = {
  getOrCreateKey: getOrCreateNativeKey,
  readBytes: async (uri) => new File(uri).bytes(),
  sha256: async (bytes) => {
    const digestInput = new Uint8Array(bytes.byteLength);
    digestInput.set(bytes);
    return bytesToHex(new Uint8Array(
      await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, digestInput),
    ));
  },
  encrypt: async (bytes, key, additionalAuthenticatedData) => {
    const sealed = await Crypto.aesEncryptAsync(bytes, key as Crypto.AESEncryptionKey, {
      nonce: { length: 12 },
      tagLength: 16,
      additionalData: new TextEncoder().encode(additionalAuthenticatedData),
    });
    return sealed.combined();
  },
  writeEncrypted: async (mediaId, bytes) => {
    const directory = new Directory(Paths.document, 'reviewed-media');
    if (!directory.exists) directory.create({ idempotent: true, intermediates: true });
    const file = new File(directory, `${mediaId}.agcm`);
    file.create({ overwrite: false });
    file.write(bytes);
    return file.uri;
  },
  deleteTransient: async (uri) => {
    const file = new File(uri);
    if (file.exists) file.delete();
  },
};

export async function persistReviewedMedia(
  input: PersistReviewedMediaInput,
  dependencies: DraftMediaDependencies = nativeDependencies,
): Promise<PersistedReviewedMedia> {
  if (!stableId(input.draftId) || !stableId(input.mediaId)) throw new Error('invalid_media_identity');
  if (!canStageMedia(input.review) || !input.review.rendered || !input.review.receipt) {
    throw new Error('media_review_required');
  }

  const renderedUri = input.review.rendered.uri;
  const bytes = await dependencies.readBytes(renderedUri);
  if (bytes.byteLength !== input.review.receipt.byteLength ||
      await dependencies.sha256(bytes) !== input.review.receipt.sanitizedSha256.toLowerCase()) {
    throw new Error('reviewed_media_changed');
  }
  const key = await dependencies.getOrCreateKey();
  const encrypted = await dependencies.encrypt(bytes, key, authenticatedContext(input));
  const encryptedReviewedPath = await dependencies.writeEncrypted(input.mediaId, encrypted);

  const transientUris = [...new Set([...input.transientUris, renderedUri])];
  await Promise.allSettled(transientUris.map((uri) => dependencies.deleteTransient(uri)));
  return { encryptedReviewedPath, encryptionVersion: ENCRYPTION_VERSION, mediaId: input.mediaId };
}
