import * as Crypto from 'expo-crypto';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, Text } from 'react-native';
import { listMyCareEvents, type CarePage, type MyCareCursor, type MyCareEvent } from '../../src/api/care';
import { CareEntry, careStyles as styles } from '../../src/care/CareEntry';
import { CareTimeline } from '../../src/care/CareTimeline';
import { PendingCareNotice } from '../../src/care/PendingCareNotice';
import { useCareSession } from '../../src/care/use-care-session';
import { ScreenScaffold } from '../../src/components/ScreenScaffold';
import { useLocale } from '../../src/i18n/LocaleContext';

export default function MyCareRoute() {
  const { locale } = useLocale(); const cn = locale === 'zh-CN'; const router = useRouter();
  const auth = useCareSession();
  const [page, setPage] = useState<CarePage<MyCareEvent, MyCareCursor>>({ items: [], nextCursor: null });
  const [loading, setLoading] = useState(false); const [failed, setFailed] = useState(false);
  const [editing, setEditing] = useState<MyCareEvent | null>(null);
  const generation = useRef(0);
  const load = useCallback(async (cursor: MyCareCursor | null = null) => {
    if (!auth.session?.owner) return;
    const token = ++generation.current; const current = auth.pin();
    setLoading(true); setFailed(false);
    try {
      const result = await listMyCareEvents({ cursor });
      if (!await current() || token !== generation.current) return;
      setPage(previous => ({ items: cursor ? [...new Map([...previous.items, ...result.items].map(item => [item.careEventId, item])).values()] : result.items, nextCursor: result.nextCursor }));
    } catch { if (token === generation.current && await current()) { setFailed(true); setPage({ items: [], nextCursor: null }); } }
    finally { if (token === generation.current) setLoading(false); }
  }, [auth.session?.owner, !!auth.session, auth.pin]);
  useEffect(() => { setPage({ items: [], nextCursor: null }); setEditing(null); void load(); return () => { ++generation.current; }; }, [load]);
  const retry = async () => {
    if (!auth.session?.pending) return;
    try { await auth.perform(auth.session.pending); setEditing(null); await load(); } catch { /* Retained request remains retryable. */ }
  };
  return <ScreenScaffold title={cn ? '我的照护记录' : 'My care records'} subtitle={cn ? '查看、更正或撤回自己的完成记录。' : 'View, correct or withdraw your completed records.'}>
    {!auth.session ? <><Text>{auth.failed ? (cn ? '无法读取账户状态。' : 'Could not load account state.') : (cn ? '正在加载…' : 'Loading…')}</Text>{auth.failed ? <Pressable accessibilityRole="button" onPress={() => { void auth.reload(); }} style={styles.choice}><Text>{cn ? '重试' : 'Retry'}</Text></Pressable> : null}</>
      : !auth.session.owner ? <><Text>{cn ? '登录后可查看自己的照护记录。' : 'Sign in to view your care records.'}</Text><Pressable accessibilityRole="button" onPress={() => router.push('/profile' as never)} style={styles.choice}><Text>{cn ? '登录' : 'Sign in'}</Text></Pressable></>
      : <>
        {auth.session.pending ? <PendingCareNotice locale={locale} busy={auth.busy} failed={auth.failed} retry={() => { void retry(); }} stop={() => { void auth.stopRetrying().catch(() => undefined); }} /> : null}
        {editing && !auth.session.pending ? <CareEntry key={editing.careEventId} animalId={editing.animalId} locale={locale} signedIn={auth.session.adult} initial={editing} createId={Crypto.randomUUID}
          onSubmit={async input => { await auth.perform({ kind: 'correct', targetId: editing.careEventId, input }); setEditing(null); await load(); }} /> : null}
        {editing && !auth.session.pending ? <Pressable accessibilityRole="button" onPress={() => setEditing(null)} style={styles.choice}><Text>{cn ? '取消更正' : 'Cancel correction'}</Text></Pressable> : null}
        <CareTimeline locale={locale} items={page.items} loading={loading} failed={failed} hasMore={!!page.nextCursor} busy={auth.busy || !!auth.session.pending || !!editing}
          refresh={() => { void load(); }} more={() => { void load(page.nextCursor); }} correct={auth.session.adult ? setEditing : undefined}
          withdraw={item => { void auth.perform({ kind: 'withdraw', targetId: item.careEventId, requestId: Crypto.randomUUID() }).then(() => load()).catch(() => undefined); }} />
      </>}
  </ScreenScaffold>;
}
