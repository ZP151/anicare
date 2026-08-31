import { createMediaUploadRecoveryController } from './MediaUploadRecovery';

async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('MediaUploadRecovery', () => {
  it('cancels a queued recovery run when the session signs out', async () => {
    let authListener: ((subject: string | null) => void) | undefined;
    const retryMedia = jest.fn(async () => undefined);
    const queued: Array<() => void> = [];
    const controller = createMediaUploadRecoveryController({
      recoverLocalJournal: async () => undefined,
      retryMedia,
      currentSubject: async () => null,
      onAuthChange: (listener) => { authListener = listener; return () => undefined; },
      onForegroundChange: () => () => undefined,
      schedule: (work) => { queued.push(work); return () => { queued.splice(queued.indexOf(work), 1); }; },
    });
    controller.start();
    authListener?.(null);
    queued.shift()?.();
    await settle();
    expect(retryMedia).not.toHaveBeenCalled();
  });

  it('actively aborts an in-flight transport trigger when the account signs out', async () => {
    let authListener: ((subject: string | null) => void) | undefined;
    let signal: AbortSignal | undefined;
    const queued: Array<() => void> = [];
    let release!: () => void;
    const controller = createMediaUploadRecoveryController({
      recoverLocalJournal: async () => undefined,
      retryMedia: async (activeSignal) => {
        signal = activeSignal;
        await new Promise<void>((resolve) => { release = resolve; });
      },
      currentSubject: async () => 'owner-12345678',
      onAuthChange: (listener) => { authListener = listener; return () => undefined; },
      onForegroundChange: () => () => undefined,
      schedule: (work) => { queued.push(work); return () => undefined; },
    });
    controller.start();
    queued.shift()?.();
    await settle();
    authListener?.(null);
    expect(signal?.aborted).toBe(true);
    release();
    await settle();
  });

  it('aborts A and schedules exactly one fresh epoch when auth changes directly to B', async () => {
    let authListener: ((subject: string | null) => void) | undefined;
    let subject: string | null = 'owner-12345678';
    const signals: AbortSignal[] = [];
    const queued: Array<() => void> = [];
    let releaseA!: () => void;
    const controller = createMediaUploadRecoveryController({
      recoverLocalJournal: async () => undefined,
      retryMedia: async (signal) => {
        signals.push(signal!);
        if (signals.length === 1) await new Promise<void>((resolve) => { releaseA = resolve; });
      },
      currentSubject: async () => subject,
      onAuthChange: (listener) => { authListener = listener; return () => undefined; },
      onForegroundChange: () => () => undefined,
      schedule: (work) => { queued.push(work); return () => undefined; },
    });
    controller.start();
    queued.shift()?.();
    await settle();
    subject = 'owner-87654321';
    authListener?.(subject);
    expect(signals[0]?.aborted).toBe(true);
    releaseA();
    await settle();
    expect(queued).toHaveLength(1);
    queued.shift()?.();
    await settle();
    expect(signals).toHaveLength(2);
    expect(signals[1]?.aborted).toBe(false);
  });

  it('coalesces a same-subject token refresh without a duplicate recovery run', async () => {
    let authListener: ((subject: string | null) => void) | undefined;
    const queued: Array<() => void> = [];
    const retryMedia = jest.fn(async () => undefined);
    const controller = createMediaUploadRecoveryController({
      recoverLocalJournal: async () => undefined,
      retryMedia,
      currentSubject: async () => 'owner-12345678',
      onAuthChange: (listener) => { authListener = listener; return () => undefined; },
      onForegroundChange: () => () => undefined,
      schedule: (work) => { queued.push(work); return () => undefined; },
    });
    controller.start();
    authListener?.('owner-12345678');
    expect(queued).toHaveLength(1);
    queued.shift()?.();
    await settle();
    expect(retryMedia).toHaveBeenCalledTimes(1);
  });
  it('runs journal recovery before one coalesced authenticated transport batch', async () => {
    const events: string[] = [];
    const queued: Array<() => void> = [];
    let authListener: ((subject: string | null) => void) | null = null;
    let foregroundListener: ((active: boolean) => void) | null = null;
    let currentSubject: string | null = null;
    const controller = createMediaUploadRecoveryController({
      recoverLocalJournal: async () => { events.push('journal'); },
      retryMedia: async () => { events.push('transport'); },
      currentSubject: async () => currentSubject,
      onAuthChange: (listener) => { authListener = listener; return () => { authListener = null; }; },
      onForegroundChange: (listener) => { foregroundListener = listener; return () => { foregroundListener = null; }; },
      schedule: (work) => { queued.push(work); return () => undefined; },
    });
    controller.start();

    queued.shift()?.();
    await settle();
    expect(events).toEqual(['journal']);

    currentSubject = 'owner-12345678';
    (authListener as ((subject: string | null) => void) | null)?.(currentSubject);
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
      currentSubject: async () => 'owner-12345678',
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
      currentSubject: async () => 'owner-12345678',
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
