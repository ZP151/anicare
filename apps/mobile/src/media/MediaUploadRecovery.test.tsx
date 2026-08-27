import { createMediaUploadRecoveryController } from './MediaUploadRecovery';

async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('MediaUploadRecovery', () => {
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
