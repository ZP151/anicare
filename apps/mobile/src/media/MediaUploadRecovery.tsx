import { AppState } from 'react-native';
import { useEffect, useRef } from 'react';

import { getSupabaseClient } from '../api/supabase';
import { recoverPendingMediaDrafts } from './media-recovery';
import { retryRecoverableMediaDrafts } from './media-upload-runtime';

export type MediaUploadRecoveryDependencies = Readonly<{
  recoverLocalJournal(): Promise<void>;
  retryMedia(signal?: AbortSignal): Promise<unknown>;
  hasSession(): Promise<boolean>;
  onAuthChange(listener: (signedIn: boolean) => void): () => void;
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
    hasSession: async () => {
      const supabase = getSupabaseClient();
      if (!supabase) return false;
      const { data } = await supabase.auth.getSession();
      return !!data.session;
    },
    onAuthChange: (listener) => {
      const supabase = getSupabaseClient();
      if (!supabase) return () => undefined;
      const { data } = supabase.auth.onAuthStateChange((_event, session) => listener(!!session));
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
        if (localJournalReady && !stopped && await dependencies.hasSession().catch(() => false)) {
          await dependencies.retryMedia(activeAbort.signal).catch(() => undefined);
        }
      } while (!stopped && rerun);
    } finally {
      running = false;
      activeAbort = null;
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
    unsubscribeAuth = dependencies.onAuthChange((signedIn) => {
      if (signedIn) requestRun();
      else {
        rerun = false;
        activeAbort?.abort();
        cancelScheduled?.();
        cancelScheduled = null;
        scheduled = false;
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
