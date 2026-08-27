import { createMediaUploadRecoveryController } from './MediaUploadRecovery';

async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('MediaUploadRecovery', () => {
  it('cancels a queued recovery run when the session signs out', async () => {
    let authListener: ((signedIn: boolean) => void) | undefined;
    const retryMedia = jest.fn(async () => undefined);
    const queued: Array<() => void> = [];
    const controller = createMediaUploadRecoveryController({
      recoverLocalJournal: async () => undefined,
      retryMedia,
      hasSession: async () => true,
      onAuthChange: (listener) => { authListener = listener; return () => undefined; },
      onForegroundChange: () => () => undefined,
      schedule: (work) => { queued.push(work); return () => { queued.splice(queued.indexOf(work), 1); }; },
    });
    controller.start();
    authListener?.(false);
    queued.shift()?.();
    await settle();
    expect(retryMedia).not.toHaveBeenCalled();
  });

  it('actively aborts an in-flight transport trigger when the account signs out', async () => {
    let authListener: ((signedIn: boolean) => void) | undefined;
    let signal: AbortSignal | undefined;
    const queued: Array<() => void> = [];
    let release!: () => void;
    const controller = createMediaUploadRecoveryController({
      recoverLocalJournal: async () => undefined,
      retryMedia: async (activeSignal) => {
        signal = activeSignal;
        await new Promise<void>((resolve) => { release = resolve; });
      },
      hasSession: async () => true,
      onAuthChange: (listener) => { authListener = listener; return () => undefined; },
      onForegroundChange: () => () => undefined,
      schedule: (work) => { queued.push(work); return () => undefined; },
    });
    controller.start();
    queued.shift()?.();
    await settle();
    authListener?.(false);
    expect(signal?.aborted).toBe(true);
    release();
    await settle();
  });
  it('runs journal recovery before one coalesced authenticated transport batch', async () => {
    const events: string[] = [];
    const queued: Array<() => void> = [];
    let authListener: ((signedIn: boolean) => void) | null = null;
    let foregroundListener: ((active: boolean) => void) | null = null;
    let signedIn = false;
    const controller = createMediaUploadRecoveryController({
      recoverLocalJournal: async () => { events.push('journal'); },
      retryMedia: async () => { events.push('transport'); },
      hasSession: async () => signedIn,
      onAuthChange: (listener) => { authListener = listener; return () => { authListener = null; }; },
      onForegroundChange: (listener) => { foregroundListener = listener; return () => { foregroundListener = null; }; },
      schedule: (work) => { queued.push(work); return () => undefined; },
    });
    controller.start();

    queued.shift()?.();
    await settle();
    expect(events).toEqual(['journal']);

    signedIn = true;
    (authListener as ((signedIn: boolean) => void) | null)?.(true);
    (foregroundListener as ((active: boolean) => void) | null)?.(true);
    expect(queued).toHaveLength(1);
    queued.shift()?.();
    await settle();

    expect(events).toEqual(['journal', 'journal', 'transport']);
    controller.stop();
  });

  it('does not start transport when durable local cleanup fails', async () => {
    const queued: Array<() => void> = [];
    const retryMedia = jest.fn(async () => undefined);
    const controller = createMediaUploadRecoveryController({
      recoverLocalJournal: async () => { throw new Error('pending_media_cleanup_conflict'); },
      retryMedia,
      hasSession: async () => true,
      onAuthChange: () => () => undefined,
      onForegroundChange: () => () => undefined,
      schedule: (work) => { queued.push(work); return () => undefined; },
    });
    controller.start();
    queued.shift()?.();
    await settle();
    expect(retryMedia).not.toHaveBeenCalled();
  });

  it('removes lifecycle listeners and ignores queued work on unmount', async () => {
    const queued: Array<() => void> = [];
    const cleanup = { auth: 0, foreground: 0 };
    const recoverLocalJournal = jest.fn(async () => undefined);
    const controller = createMediaUploadRecoveryController({
      recoverLocalJournal,
      retryMedia: async () => undefined,
      hasSession: async () => true,
      onAuthChange: () => () => { cleanup.auth += 1; },
      onForegroundChange: () => () => { cleanup.foreground += 1; },
      schedule: (work) => { queued.push(work); return () => undefined; },
    });
    controller.start();

    controller.stop();
    queued.shift()?.();
    await settle();

    expect(cleanup).toEqual({ auth: 1, foreground: 1 });
    expect(recoverLocalJournal).not.toHaveBeenCalled();
  });
});
