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
  commitEncrypted(mediaId: string, bytes: Uint8Array): Promise<string>;
  cacheRootUri: string;
  deleteProcessorCache(uri: string): Promise<void>;
}>;

export type PersistReviewedMediaInput = Readonly<{
  draftId: string;
  mediaId: string;
  review: MediaReviewState;
  processorCacheUris: readonly string[];
}>;

export type PersistedReviewedMedia = Readonly<{
  encryptedReviewedRef: string;
  encryptionVersion: typeof ENCRYPTION_VERSION;
  mediaId: string;
}>;

function stableId(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9-]{7,63}$/.test(value);
}

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
  writeTemp(reference: string, bytes: Uint8Array): Promise<void>;
  replaceTemp(temporaryReference: string, finalReference: string): Promise<void>;
  deleteTemp(reference: string): Promise<void>;
}>;

export async function commitEncryptedFile(
  mediaId: string,
  bytes: Uint8Array,
  dependencies: EncryptedFileDependencies,
): Promise<string> {
  if (!stableId(mediaId)) throw new Error('invalid_media_identity');
  const randomId = dependencies.randomId();
  if (!stableId(randomId)) throw new Error('invalid_temporary_identity');
  const finalReference = `reviewed-media/${mediaId}.agcm`;
  const temporaryReference = `reviewed-media/.${mediaId}.${randomId}.tmp`;
  try {
    await dependencies.writeTemp(temporaryReference, bytes);
    await dependencies.replaceTemp(temporaryReference, finalReference);
    return finalReference;
  } finally {
    await dependencies.deleteTemp(temporaryReference).catch(() => undefined);
  }
}

export function isOwnedProcessorCacheUri(uri: string, cacheRootUri: string): boolean {
  const root = cacheRootUri.endsWith('/') ? cacheRootUri : `${cacheRootUri}/`;
  if (!uri.startsWith(root)) return false;
  const fileName = uri.slice(root.length);
  return /^animalhelper-(canonical|reviewed)-[A-Za-z0-9-]{8,64}\.jpg$/.test(fileName);
}

function isOwnedReviewedCacheUri(uri: string, cacheRootUri: string): boolean {
  const root = cacheRootUri.endsWith('/') ? cacheRootUri : `${cacheRootUri}/`;
  return isOwnedProcessorCacheUri(uri, root) && uri.slice(root.length).startsWith('animalhelper-reviewed-');
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

const getOrCreateNativeKey = createKeyCoordinator<Crypto.AESEncryptionKey>({
  loadKey: async () => {
    if (!await SecureStore.isAvailableAsync()) throw new Error('secure_media_storage_unavailable');
    const stored = await SecureStore.getItemAsync(REVIEWED_MEDIA_KEY_NAME);
    return stored ? Crypto.AESEncryptionKey.import(stored, 'base64') as Promise<Crypto.AESEncryptionKey> : null;
  },
  generateKey: async () => Crypto.AESEncryptionKey.generate(Crypto.AESKeySize.AES256) as Promise<Crypto.AESEncryptionKey>,
  persistKey: async (key) => {
    const encoded = await key.encoded('base64');
    await SecureStore.setItemAsync(REVIEWED_MEDIA_KEY_NAME, encoded, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  },
});

function reviewedMediaDirectory(): Directory {
  const directory = new Directory(Paths.document, 'reviewed-media');
  if (!directory.exists) directory.create({ idempotent: true, intermediates: true });
  return directory;
}

function fileForReviewedReference(reference: string): File {
  const match = /^reviewed-media\/(\.?[A-Za-z0-9][A-Za-z0-9.-]{7,190}\.(?:agcm|tmp))$/.exec(reference);
  if (!match || match[1].includes('..')) throw new Error('invalid_reviewed_media_reference');
  return new File(reviewedMediaDirectory(), match[1]);
}

const nativeFileDependencies: EncryptedFileDependencies = {
  randomId: () => Crypto.randomUUID(),
  writeTemp: async (reference, bytes) => {
    const temporary = fileForReviewedReference(reference);
    temporary.create({ overwrite: false });
    temporary.write(bytes);
  },
  replaceTemp: async (temporaryReference, finalReference) => {
    await fileForReviewedReference(temporaryReference).move(fileForReviewedReference(finalReference), { overwrite: true });
  },
  deleteTemp: async (reference) => {
    const temporary = fileForReviewedReference(reference);
    if (temporary.exists) temporary.delete();
  },
};

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
  commitEncrypted: async (mediaId, bytes) => commitEncryptedFile(mediaId, bytes, nativeFileDependencies),
  cacheRootUri: Paths.cache.uri,
  deleteProcessorCache: async (uri) => {
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
  if (!isOwnedReviewedCacheUri(renderedUri, dependencies.cacheRootUri)) throw new Error('unowned_rendered_media');
  const bytes = await dependencies.readBytes(renderedUri);
  if (bytes.byteLength !== input.review.receipt.byteLength ||
      await dependencies.sha256(bytes) !== input.review.receipt.sanitizedSha256.toLowerCase()) {
    throw new Error('reviewed_media_changed');
  }
  const key = await dependencies.getOrCreateKey();
  const encrypted = await dependencies.encrypt(bytes, key, authenticatedContext(input));
  const encryptedReviewedRef = await dependencies.commitEncrypted(input.mediaId, encrypted);

  const processorCacheUris = [...new Set([...input.processorCacheUris, renderedUri])]
    .filter((uri) => isOwnedProcessorCacheUri(uri, dependencies.cacheRootUri));
  await Promise.allSettled(processorCacheUris.map((uri) => dependencies.deleteProcessorCache(uri)));
  return { encryptedReviewedRef, encryptionVersion: ENCRYPTION_VERSION, mediaId: input.mediaId };
}
