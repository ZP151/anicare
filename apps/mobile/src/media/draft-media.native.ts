import * as Crypto from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';

import type { MediaReviewState, ReviewReceipt } from './contracts';
import { createReviewedMediaTempReference, isReviewedMediaReference, isReviewedMediaTempReference, isStableMediaId, selectReviewedMediaSweepTargets } from './media-reference';
import { canStageMedia } from './review-policy';

const REVIEWED_MEDIA_KEY_NAME = 'animalhelper.reviewed-media.v1';
const ENCRYPTION_VERSION = 'aes-256-gcm.v1' as const;
const ENVELOPE_MAGIC = new Uint8Array([0x41, 0x48, 0x4d, 0x31]);
const ENVELOPE_HEADER_LENGTH = 8;

export type DraftMediaDependencies = Readonly<{
  getOrCreateKey(): Promise<unknown>;
  readBytes(uri: string): Promise<Uint8Array>;
  sha256(bytes: Uint8Array): Promise<string>;
  encrypt(bytes: Uint8Array, key: unknown, additionalAuthenticatedData: string): Promise<Uint8Array>;
  commitEncrypted(reference: string, bytes: Uint8Array): Promise<string>;
  cacheRootUri: string;
  deleteProcessorCache(uri: string): Promise<void>;
}>;

export type PersistReviewedMediaInput = Readonly<{
  draftId: string;
  mediaId: string;
  intendedEncryptedRef: string;
  review: MediaReviewState;
  processorCacheUris: readonly string[];
}>;

export type PersistedReviewedMedia = Readonly<{
  encryptedReviewedRef: string;
  encryptionVersion: typeof ENCRYPTION_VERSION;
  mediaId: string;
}>;

export type ReviewedMediaArtifactStatus = 'absent' | 'valid' | 'corrupt';
export type VerifyReviewedMediaInput = Readonly<{
  draftId: string;
  mediaId: string;
  encryptedReviewedRef: string;
  receipt: ReviewReceipt;
}>;
export type VerifyReviewedMediaDependencies = Readonly<{
  getOrCreateKey(): Promise<unknown>;
  readCommitted(reference: string): Promise<Uint8Array | null>;
  decryptEnvelope(payload: Uint8Array, key: unknown, additionalAuthenticatedData: string): Promise<Uint8Array>;
  sha256(bytes: Uint8Array): Promise<string>;
}>;

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export type KeyCoordinatorDependencies<Key> = Readonly<{
  loadKey(): Promise<Key | null>;
  generateKey(): Promise<Key>;
  persistKey(key: Key): Promise<void>;
}>;

export function createKeyCoordinator<Key>(dependencies: KeyCoordinatorDependencies<Key>): () => Promise<Key> {
  let initialization: Promise<Key> | null = null;
  return async () => {
    if (!initialization) {
      initialization = (async () => {
        const stored = await dependencies.loadKey();
        if (stored) return stored;
        const generated = await dependencies.generateKey();
        const raced = await dependencies.loadKey();
        if (raced) return raced;
        await dependencies.persistKey(generated);
        return generated;
      })();
    }
    const active = initialization;
    try {
      return await active;
    } catch (error) {
      if (initialization === active) initialization = null;
      throw error;
    }
  };
}

export type EncryptedFileDependencies = Readonly<{
  randomId(): string;
  finalExists(reference: string): Promise<boolean>;
  writeTemp(reference: string, bytes: Uint8Array): Promise<void>;
  moveTemp(temporaryReference: string, finalReference: string, options: { overwrite: false }): Promise<void>;
  deleteTemp(reference: string): Promise<void>;
}>;

export async function commitEncryptedFile(finalReference: string, bytes: Uint8Array, dependencies: EncryptedFileDependencies): Promise<string> {
  if (!isReviewedMediaReference(finalReference)) throw new Error('invalid_reviewed_media_reference');
  const temporaryId = dependencies.randomId();
  if (!isStableMediaId(temporaryId)) throw new Error('invalid_temporary_identity');
  const temporaryReference = createReviewedMediaTempReference(finalReference, temporaryId);
  try {
    if (await dependencies.finalExists(finalReference)) throw new Error('encrypted_media_already_exists');
    await dependencies.writeTemp(temporaryReference, bytes);
    await dependencies.moveTemp(temporaryReference, finalReference, { overwrite: false });
    return finalReference;
  } finally {
    await dependencies.deleteTemp(temporaryReference).catch(() => undefined);
  }
}

export function encodeEncryptedEnvelope(payload: Uint8Array): Uint8Array {
  if (payload.byteLength > 0xffffffff) throw new Error('encrypted_media_too_large');
  const result = new Uint8Array(ENVELOPE_HEADER_LENGTH + payload.byteLength);
  result.set(ENVELOPE_MAGIC);
  new DataView(result.buffer).setUint32(4, payload.byteLength, false);
  result.set(payload, ENVELOPE_HEADER_LENGTH);
  return result;
}

export function decodeEncryptedEnvelope(envelope: Uint8Array): Uint8Array {
  if (envelope.byteLength < ENVELOPE_HEADER_LENGTH || ENVELOPE_MAGIC.some((byte, index) => envelope[index] !== byte)) {
    throw new Error('invalid_encrypted_media_envelope');
  }
  const length = new DataView(envelope.buffer, envelope.byteOffset, envelope.byteLength).getUint32(4, false);
  if (length !== envelope.byteLength - ENVELOPE_HEADER_LENGTH) throw new Error('invalid_encrypted_media_envelope');
  return envelope.slice(ENVELOPE_HEADER_LENGTH);
}

export function isOwnedProcessorCacheUri(uri: string, cacheRootUri: string): boolean {
  const root = cacheRootUri.endsWith('/') ? cacheRootUri : `${cacheRootUri}/`;
  if (!uri.startsWith(root)) return false;
  return /^animalhelper-(canonical|reviewed)-[A-Za-z0-9-]{8,64}\.jpg$/.test(uri.slice(root.length));
}

function isOwnedReviewedCacheUri(uri: string, cacheRootUri: string): boolean {
  const root = cacheRootUri.endsWith('/') ? cacheRootUri : `${cacheRootUri}/`;
  return isOwnedProcessorCacheUri(uri, root) && uri.slice(root.length).startsWith('animalhelper-reviewed-');
}

function authenticatedContext(input: VerifyReviewedMediaInput): string {
  return JSON.stringify({
    draftId: input.draftId,
    mediaId: input.mediaId,
    encryptedReviewedRef: input.encryptedReviewedRef,
    sanitizedSha256: input.receipt.sanitizedSha256,
    recipeVersion: input.receipt.recipeVersion,
    detectorVersions: Object.fromEntries(Object.entries(input.receipt.detectorVersions).sort(([a], [b]) => a.localeCompare(b))),
    width: input.receipt.width,
    height: input.receipt.height,
    byteLength: input.receipt.byteLength,
    encryptionVersion: ENCRYPTION_VERSION,
  });
}

const getOrCreateNativeKey = createKeyCoordinator<Crypto.AESEncryptionKey>({
  loadKey: async () => {
    if (!await SecureStore.isAvailableAsync()) throw new Error('secure_media_storage_unavailable');
    const stored = await SecureStore.getItemAsync(REVIEWED_MEDIA_KEY_NAME);
    return stored ? Crypto.AESEncryptionKey.import(stored, 'base64') as Promise<Crypto.AESEncryptionKey> : null;
  },
  generateKey: async () => Crypto.AESEncryptionKey.generate(Crypto.AESKeySize.AES256) as Promise<Crypto.AESEncryptionKey>,
  persistKey: async (key) => {
    const encoded = await key.encoded('base64');
    await SecureStore.setItemAsync(REVIEWED_MEDIA_KEY_NAME, encoded, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
  },
});

function reviewedMediaDirectory(): Directory {
  const directory = new Directory(Paths.document, 'reviewed-media');
  if (!directory.exists) directory.create({ idempotent: true, intermediates: true });
  return directory;
}

function fileForReviewedReference(reference: string): File {
  if (!isReviewedMediaReference(reference) && !isReviewedMediaTempReference(reference)) throw new Error('invalid_reviewed_media_reference');
  return new File(reviewedMediaDirectory(), reference.slice('reviewed-media/'.length));
}

const nativeFileDependencies: EncryptedFileDependencies = {
  randomId: () => Crypto.randomUUID(),
  finalExists: async (reference) => fileForReviewedReference(reference).exists,
  writeTemp: async (reference, bytes) => {
    const temporary = fileForReviewedReference(reference);
    temporary.create({ overwrite: false });
    temporary.write(bytes);
  },
  moveTemp: async (temporaryReference, finalReference, options) => {
    await fileForReviewedReference(temporaryReference).move(fileForReviewedReference(finalReference), options);
  },
  deleteTemp: async (reference) => {
    const temporary = fileForReviewedReference(reference);
    if (temporary.exists) temporary.delete();
  },
};

const nativeDependencies: DraftMediaDependencies = {
  getOrCreateKey: getOrCreateNativeKey,
  readBytes: async (uri) => new File(uri).bytes(),
  sha256: async (bytes) => bytesToHex(new Uint8Array(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, bytes.slice()))),
  encrypt: async (bytes, key, additionalAuthenticatedData) => {
    const sealed = await Crypto.aesEncryptAsync(bytes, key as Crypto.AESEncryptionKey, {
      nonce: { length: 12 }, tagLength: 16, additionalData: new TextEncoder().encode(additionalAuthenticatedData),
    });
    return encodeEncryptedEnvelope(await sealed.combined());
  },
  commitEncrypted: async (reference, bytes) => commitEncryptedFile(reference, bytes, nativeFileDependencies),
  cacheRootUri: Paths.cache.uri,
  deleteProcessorCache: async (uri) => { const file = new File(uri); if (file.exists) file.delete(); },
};

const nativeVerifyDependencies: VerifyReviewedMediaDependencies = {
  getOrCreateKey: getOrCreateNativeKey,
  readCommitted: async (reference) => { const file = fileForReviewedReference(reference); return file.exists ? file.bytes() : null; },
  decryptEnvelope: async (payload, key, additionalAuthenticatedData) => {
    const sealed = Crypto.AESSealedData.fromCombined(payload, { ivLength: 12, tagLength: 16 });
    return Crypto.aesDecryptAsync(sealed, key as Crypto.AESEncryptionKey, {
      output: 'bytes', additionalData: new TextEncoder().encode(additionalAuthenticatedData),
    });
  },
  sha256: nativeDependencies.sha256,
};

export async function cleanupProcessorCacheUris(uris: readonly string[], dependencies: Pick<DraftMediaDependencies, 'cacheRootUri' | 'deleteProcessorCache'> = nativeDependencies): Promise<void> {
  const owned = [...new Set(uris)].filter((uri) => isOwnedProcessorCacheUri(uri, dependencies.cacheRootUri));
  await Promise.allSettled(owned.map((uri) => dependencies.deleteProcessorCache(uri)));
}

export async function persistReviewedMedia(input: PersistReviewedMediaInput, dependencies: DraftMediaDependencies = nativeDependencies): Promise<PersistedReviewedMedia> {
  if (!isStableMediaId(input.draftId) || !isStableMediaId(input.mediaId) || !isReviewedMediaReference(input.intendedEncryptedRef, input.mediaId)) {
    throw new Error('invalid_media_identity');
  }
  if (!canStageMedia(input.review) || !input.review.rendered || !input.review.receipt) throw new Error('media_review_required');
  const renderedUri = input.review.rendered.uri;
  if (!isOwnedReviewedCacheUri(renderedUri, dependencies.cacheRootUri)) throw new Error('unowned_rendered_media');
  const bytes = await dependencies.readBytes(renderedUri);
  if (bytes.byteLength !== input.review.receipt.byteLength || await dependencies.sha256(bytes) !== input.review.receipt.sanitizedSha256.toLowerCase()) {
    throw new Error('reviewed_media_changed');
  }
  const context = { draftId: input.draftId, mediaId: input.mediaId, encryptedReviewedRef: input.intendedEncryptedRef, receipt: input.review.receipt };
  const encrypted = await dependencies.encrypt(bytes, await dependencies.getOrCreateKey(), authenticatedContext(context));
  const encryptedReviewedRef = await dependencies.commitEncrypted(input.intendedEncryptedRef, encrypted);
  if (encryptedReviewedRef !== input.intendedEncryptedRef) throw new Error('encrypted_media_reference_mismatch');
  return { encryptedReviewedRef, encryptionVersion: ENCRYPTION_VERSION, mediaId: input.mediaId };
}

export async function verifyReviewedMedia(input: VerifyReviewedMediaInput, dependencies: VerifyReviewedMediaDependencies = nativeVerifyDependencies): Promise<ReviewedMediaArtifactStatus> {
  if (!isStableMediaId(input.draftId) || !isStableMediaId(input.mediaId) || !isReviewedMediaReference(input.encryptedReviewedRef, input.mediaId)) return 'corrupt';
  const envelope = await dependencies.readCommitted(input.encryptedReviewedRef);
  if (!envelope) return 'absent';
  try {
    const plaintext = await dependencies.decryptEnvelope(decodeEncryptedEnvelope(envelope), await dependencies.getOrCreateKey(), authenticatedContext(input));
    if (plaintext.byteLength !== input.receipt.byteLength) return 'corrupt';
    return await dependencies.sha256(plaintext) === input.receipt.sanitizedSha256.toLowerCase() ? 'valid' : 'corrupt';
  } catch {
    return 'corrupt';
  }
}

export async function deleteReviewedMediaReference(reference: string): Promise<void> {
  if (!isReviewedMediaReference(reference)) return;
  const file = fileForReviewedReference(reference);
  if (file.exists) file.delete();
}

export async function sweepOwnedReviewedMedia(activeReferences: ReadonlySet<string>): Promise<void> {
  const directory = reviewedMediaDirectory();
  const entries = directory.list().map((entry) => `reviewed-media/${entry.name}`);
  await Promise.allSettled(selectReviewedMediaSweepTargets(entries, activeReferences).map(async (reference) => {
    const file = fileForReviewedReference(reference);
    if (file.exists) file.delete();
  }));
}
