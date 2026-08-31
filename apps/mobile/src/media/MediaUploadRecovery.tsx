import { AppState } from 'react-native';
import { useEffect, useRef } from 'react';

import { getSupabaseClient } from '../api/supabase';
import { recoverPendingMediaDrafts } from './media-recovery';
import { retryRecoverableMediaDrafts } from './media-upload-runtime';

export type MediaUploadRecoveryDependencies = Readonly<{
  recoverLocalJournal(): Promise<void>;
  retryMedia(signal?: AbortSignal): Promise<unknown>;
  currentSubject(): Promise<string | null>;
  onAuthChange(listener: (subject: string | null) => void): () => void;
  onForegroundChange(listener: (active: boolean) => void): () => void;
  schedule(work: () => void): () => void;
}>;

function scheduleOutsideCallback(work: () => void): () => void {
  const timer = setTimeout(work, 0);
  return () => clearTimeout(timer);
}

function defaultDependencies(): MediaUploadRecoveryDependencies {
  return {
    recoverLocalJournal: recoverPendingMediaDrafts,
    retryMedia: retryRecoverableMediaDrafts,
    currentSubject: async () => {
      const supabase = getSupabaseClient();
      if (!supabase) return null;
      const { data } = await supabase.auth.getSession();
      return data.session?.user.id ?? null;
    },
    onAuthChange: (listener) => {
      const supabase = getSupabaseClient();
      if (!supabase) return () => undefined;
      const { data } = supabase.auth.onAuthStateChange((_event, session) => listener(session?.user.id ?? null));
      return () => data.subscription.unsubscribe();
    },
    onForegroundChange: (listener) => {
      const subscription = AppState.addEventListener('change', (state) => listener(state === 'active'));
      return () => subscription.remove();
    },
    schedule: scheduleOutsideCallback,
  };
}

export function createMediaUploadRecoveryController(dependencies: MediaUploadRecoveryDependencies) {
  let stopped = false;
  let scheduled = false;
  let running = false;
  let rerun = false;
  let cancelScheduled: (() => void) | null = null;
  let unsubscribeAuth: (() => void) | null = null;
  let unsubscribeForeground: (() => void) | null = null;
  let activeAbort: AbortController | null = null;
  let subject: string | null | undefined;
  let restartAfterAbort = false;

  async function run(): Promise<void> {
    if (stopped || running) return;
    running = true;
    activeAbort = new AbortController();
    try {
      do {
        rerun = false;
        // Journal repair is independent of auth and always precedes transport.
        let localJournalReady = true;
        try {
          await dependencies.recoverLocalJournal();
        } catch {
          localJournalReady = false;
        }
        const activeSubject = localJournalReady && !stopped
          ? await dependencies.currentSubject().catch(() => null)
          : null;
        if (subject === undefined) subject = activeSubject;
        if (activeSubject && subject === activeSubject) {
          await dependencies.retryMedia(activeAbort.signal).catch(() => undefined);
        }
      } while (!stopped && rerun);
    } finally {
      running = false;
      activeAbort = null;
      if (restartAfterAbort && !stopped) {
        restartAfterAbort = false;
        requestRun();
      }
    }
  }

  function requestRun(): void {
    if (stopped) return;
    if (running) {
      rerun = true;
      return;
    }
    if (scheduled) return;
    scheduled = true;
    cancelScheduled = dependencies.schedule(() => {
      scheduled = false;
      cancelScheduled = null;
      void run();
    });
  }

  function start(): void {
    if (stopped || unsubscribeAuth || unsubscribeForeground) return;
    unsubscribeAuth = dependencies.onAuthChange((nextSubject) => {
      if (subject === undefined) {
        subject = nextSubject;
        if (scheduled || running) return;
        if (nextSubject) requestRun();
        return;
      }
      const changed = subject !== nextSubject;
      subject = nextSubject;
      if (!changed) return;
      rerun = false;
      activeAbort?.abort();
      cancelScheduled?.();
      cancelScheduled = null;
      scheduled = false;
      if (nextSubject) {
        if (running) restartAfterAbort = true;
        else requestRun();
      }
    });
    unsubscribeForeground = dependencies.onForegroundChange((active) => {
      if (active) requestRun();
    });
    requestRun();
  }

  function stop(): void {
    stopped = true;
    activeAbort?.abort();
    cancelScheduled?.();
    cancelScheduled = null;
    unsubscribeAuth?.();
    unsubscribeForeground?.();
    unsubscribeAuth = null;
    unsubscribeForeground = null;
  }

  return { start, stop, requestRun };
}

export function MediaUploadRecovery({ dependencies }: Readonly<{
  dependencies?: MediaUploadRecoveryDependencies;
}>) {
  const defaultDependenciesRef = useRef<MediaUploadRecoveryDependencies | null>(null);
  if (!dependencies && !defaultDependenciesRef.current) defaultDependenciesRef.current = defaultDependencies();
  const activeDependencies = dependencies ?? defaultDependenciesRef.current!;
  useEffect(() => {
    const controller = createMediaUploadRecoveryController(activeDependencies);
    controller.start();
    return () => controller.stop();
  }, [activeDependencies]);
  return null;
}
