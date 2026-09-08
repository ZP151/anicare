import * as Crypto from 'expo-crypto';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, Text } from 'react-native';
import { careId, listPublicCareHistory, type CarePage, type PublicCareEvent } from '../../src/api/care';
import { getPublicCatSummary } from '../../src/api/cats';
import { CareEntry, careStyles as styles } from '../../src/care/CareEntry';
import { CareTimeline } from '../../src/care/CareTimeline';
import { PendingCareNotice } from '../../src/care/PendingCareNotice';
import { useCareSession } from '../../src/care/use-care-session';
import { ScreenScaffold } from '../../src/components/ScreenScaffold';
import { useLocale } from '../../src/i18n/LocaleContext';

export default function CareRoute() {
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const animalId = careId(id) ? id : null;
  const { locale } = useLocale(); const cn = locale === 'zh-CN'; const router = useRouter();
  const auth = useCareSession();
  const [page, setPage] = useState<CarePage<PublicCareEvent, string>>({ items: [], nextCursor: null });
  const [loading, setLoading] = useState(false); const [failed, setFailed] = useState(false);
  const [available, setAvailable] = useState(false); const [done, setDone] = useState(false);
  const generation = useRef(0);
  const load = useCallback(async (cursor: string | null = null) => {
    if (!animalId || !auth.session) return;
    const token = ++generation.current; const current = auth.pin();
    setLoading(true); setFailed(false);
    try {
      const summary = await getPublicCatSummary(animalId);
      if (!await current() || token !== generation.current) return;
      setAvailable(!!summary);
      if (!summary) { setPage({ items: [], nextCursor: null }); return; }
      const result = await listPublicCareHistory(animalId, cursor);
      if (!await current() || token !== generation.current) return;
      setPage(previous => ({ items: cursor ? [...new Map([...previous.items, ...result.items].map(item => [item.careEventId, item])).values()] : result.items, nextCursor: result.nextCursor }));
    } catch { if (token === generation.current && await current()) { setFailed(true); setAvailable(false); setPage({ items: [], nextCursor: null }); } }
    finally { if (token === generation.current) setLoading(false); }
  }, [animalId, auth.session?.owner, !!auth.session, auth.pin]);
  useEffect(() => {
    setPage({ items: [], nextCursor: null }); setAvailable(false); setDone(false);
    void load(); return () => { ++generation.current; };
  }, [load]);
  const retry = async () => {
    if (!auth.session?.pending) return;
    try { const pending = auth.session.pending; await auth.perform(pending); setDone(pending.kind === 'record' && pending.targetId === animalId); await load(); } catch { /* The durable pending notice keeps the request. */ }
  };
  return <ScreenScaffold title={cn ? '照护记录' : 'Care record'} subtitle={cn ? '已完成的社区照护及延迟公开历史。' : 'Completed community care and delayed public history.'}>
    <Pressable accessibilityRole="button" onPress={() => router.push('/care/my-care' as never)} style={styles.choice}><Text>{cn ? '我的照护记录' : 'My care records'}</Text></Pressable>
    {!auth.session ? <><Text>{auth.failed ? (cn ? '无法读取账户状态。' : 'Could not load account state.') : (cn ? '正在加载…' : 'Loading…')}</Text>{auth.failed ? <Pressable accessibilityRole="button" onPress={() => { void auth.reload(); }} style={styles.choice}><Text>{cn ? '重试' : 'Retry'}</Text></Pressable> : null}</> : <>
      {done ? <Text accessibilityLiveRegion="polite">{cn ? '已记录完成的照护。' : 'Completed care recorded.'}</Text> : null}
      {auth.session.pending ? <PendingCareNotice locale={locale} busy={auth.busy} failed={auth.failed} retry={() => { void retry(); }} stop={() => { void auth.stopRetrying().catch(() => undefined); }} />
        : available && !done ? <CareEntry key={`${animalId}:${auth.session.owner}`} animalId={animalId!} locale={locale} signedIn={auth.session.adult}
          createId={Crypto.randomUUID} onSubmit={async input => { await auth.perform({ kind: 'record', targetId: animalId!, input }); setDone(true); await load(); }} /> : null}
      {!auth.session.adult ? <Pressable accessibilityRole="button" onPress={() => router.push('/profile' as never)} style={styles.choice}><Text>{cn ? '登录或确认成年' : 'Sign in or confirm adult status'}</Text></Pressable> : null}
      {!animalId || !available && !loading && !failed ? <Text>{cn ? '猫档案当前不可用。' : 'Cat profile unavailable.'}</Text> : null}
      {available || failed || loading ? <CareTimeline locale={locale} items={page.items} loading={loading} failed={failed} hasMore={!!page.nextCursor} refresh={() => { void load(); }} more={() => { void load(page.nextCursor); }} /> : null}
    </>}
  </ScreenScaffold>;
}
