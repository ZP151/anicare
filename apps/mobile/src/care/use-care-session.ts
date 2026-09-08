import { useCallback, useEffect, useRef, useState } from 'react';
import { canRecordCare, correctCareEvent, recordCompletedCare, withdrawCareEvent } from '../api/care';
import { readSessionSubjectStrict, subscribeSessionSubject } from '../auth/session-subject';
import { clearPendingCare, loadPendingCare, savePendingCare, type PendingCare } from './care-pending';

type Session = Readonly<{ owner: string | null; adult: boolean; pending: PendingCare | null }>;
export function useCareSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const epoch = useRef(0);
  const inFlight = useRef(false);
  const reload = useCallback(async () => {
    const token = ++epoch.current;
    inFlight.current = false;
    setSession(null); setFailed(false); setBusy(false);
    try {
      const owner = await readSessionSubjectStrict();
      const pending = owner ? await loadPendingCare(owner) : null;
      const adult = owner ? await canRecordCare() : false;
      if (token !== epoch.current || await readSessionSubjectStrict() !== owner || token !== epoch.current) return;
      setSession({ owner, adult, pending });
    } catch { if (token === epoch.current) setFailed(true); }
  }, []);
  useEffect(() => {
    void reload();
    const unsubscribe = subscribeSessionSubject(() => { void reload(); });
    return () => { ++epoch.current; unsubscribe(); };
  }, [reload]);
  const pin = useCallback(() => {
    const token = epoch.current; const owner = session?.owner ?? null;
    return async () => token === epoch.current && await readSessionSubjectStrict().catch(() => undefined) === owner && token === epoch.current;
  }, [session?.owner]);
  const perform = async (pending: PendingCare) => {
    const owner = session?.owner;
    if (!owner || inFlight.current) throw new Error('care_unavailable');
    const current = pin(); const token = epoch.current;
    inFlight.current = true; setBusy(true); setFailed(false);
    try {
      if (!await current()) throw new Error('account_changed');
      await savePendingCare(owner, pending);
      if (!await current()) throw new Error('account_changed');
      setSession(state => state ? { ...state, pending } : state);
      if (pending.kind === 'record') await recordCompletedCare(pending.input);
      else if (pending.kind === 'correct') await correctCareEvent(pending.targetId, pending.input);
      else if (pending.kind === 'withdraw') await withdrawCareEvent(pending.targetId, pending.requestId);
      if (!await current()) throw new Error('account_changed');
      await clearPendingCare(owner, pending);
      if (!await current()) throw new Error('account_changed');
      setSession(state => state ? { ...state, pending: null } : state);
    } catch (error) {
      if (await current()) setFailed(true);
      throw error;
    } finally {
      if (token === epoch.current) { inFlight.current = false; setBusy(false); }
    }
  };
  const stopRetrying = async () => {
    if (!session?.owner || !session.pending || inFlight.current) return;
    const current = pin();
    if (!await current()) return;
    await clearPendingCare(session.owner, session.pending);
    if (!await current()) return;
    setSession(value => value ? { ...value, pending: null } : value);
    setFailed(false);
  };
  return { session, failed, busy, reload, pin, perform, stopRetrying };
}
