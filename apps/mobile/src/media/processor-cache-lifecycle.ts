export type ProcessorCacheCleanup = (uris: readonly string[]) => Promise<void>;

export type ProcessorCacheLifecycle = Readonly<{
  startSelection(token: number): Promise<void>;
  startMutation(token: number): void;
  adopt(token: number, uri: string): Promise<void>;
  beginAsyncWork(): void;
  endAsyncWork(): Promise<void>;
  requestCleanup(): Promise<void>;
  abandonAll(): Promise<void>;
  ownedUris(): readonly string[];
  cleanupOwned(uris: readonly string[]): Promise<void>;
  release(token: number): Promise<void>;
}>;

export function createProcessorCacheLifecycle(cleanup: ProcessorCacheCleanup): ProcessorCacheLifecycle {
  const ownedByToken = new Map<number, Set<string>>();
  const scheduled = new Map<string, Promise<void>>();
  let currentToken: number | null = null;
  let activeAsyncWork = 0;
  let cleanupRequested = false;
  let cleanupWaiters: Array<() => void> = [];

  function unique(uris: readonly string[]): string[] {
    return [...new Set(uris)].filter((uri) => uri.length > 0);
  }

  async function deleteOnce(uris: readonly string[]): Promise<void> {
    const pending = new Map<string, Promise<void>>();
    const fresh: string[] = [];
    for (const uri of unique(uris)) {
      const existing = scheduled.get(uri);
      if (existing) {
        pending.set(uri, existing);
        continue;
      }
      fresh.push(uri);
    }
    if (fresh.length > 0) {
      const operation = Promise.resolve().then(() => cleanup(fresh)).catch(() => undefined);
      for (const uri of fresh) {
        scheduled.set(uri, operation);
        pending.set(uri, operation);
        void operation.finally(() => {
          if (scheduled.get(uri) === operation) scheduled.delete(uri);
        });
      }
    }
    await Promise.all(pending.values());
  }

  function takeOwned(filter?: (uri: string) => boolean): string[] {
    const result: string[] = [];
    for (const [token, uris] of ownedByToken) {
      for (const uri of uris) {
        if (!filter || filter(uri)) {
          result.push(uri);
          uris.delete(uri);
        }
      }
      if (uris.size === 0) ownedByToken.delete(token);
    }
    return unique(result);
  }

  function ownedUris(): readonly string[] {
    return unique([...ownedByToken.values()].flatMap((uris) => [...uris]));
  }

  async function flushRequestedCleanup(): Promise<void> {
    if (!cleanupRequested || activeAsyncWork > 0) return;
    const uris = takeOwned();
    await deleteOnce(uris);
    if (cleanupRequested && activeAsyncWork === 0 && ownedByToken.size === 0) {
      const waiters = cleanupWaiters;
      cleanupWaiters = [];
      for (const resolve of waiters) resolve();
    }
  }

  function waitForCleanup(): Promise<void> {
    if (!cleanupRequested || activeAsyncWork === 0 && ownedByToken.size === 0) return Promise.resolve();
    return new Promise<void>((resolve) => { cleanupWaiters.push(resolve); });
  }

  return {
    async startSelection(token) {
      currentToken = token;
      const stale = takeOwned();
      await deleteOnce(stale);
      ownedByToken.set(token, new Set());
    },
    startMutation(token) {
      currentToken = token;
      ownedByToken.set(token, new Set());
    },
    async adopt(token, uri) {
      if (currentToken === token) {
        const owned = ownedByToken.get(token) ?? new Set<string>();
        owned.add(uri);
        ownedByToken.set(token, owned);
        return;
      }
      await deleteOnce([uri]);
    },
    beginAsyncWork() {
      activeAsyncWork += 1;
    },
    async endAsyncWork() {
      activeAsyncWork = Math.max(0, activeAsyncWork - 1);
      await flushRequestedCleanup();
    },
    async requestCleanup() {
      currentToken = null;
      cleanupRequested = true;
      await flushRequestedCleanup();
      await waitForCleanup();
    },
    async abandonAll() {
      currentToken = null;
      const owned = takeOwned();
      await deleteOnce(owned);
    },
    ownedUris,
    async cleanupOwned(uris) {
      const requested = new Set(unique(uris));
      const owned = takeOwned((uri) => requested.has(uri));
      await deleteOnce(owned);
    },
    async release(token) {
      const owned = takeOwned((uri) => ownedByToken.get(token)?.has(uri) ?? false);
      await deleteOnce(owned);
      await flushRequestedCleanup();
    },
  };
}
