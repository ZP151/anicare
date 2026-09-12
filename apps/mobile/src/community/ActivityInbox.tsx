import {BackButton} from '../components/BackButton';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { listMyCommunityActivity, markCommunityActivityRead, type CommunityActivity } from '../api/community-activity';
import { getCommunityCommentContext } from '../api/community-comment-replies';
import { useAccountSession } from '../auth/use-account-session';
import { AppIcon } from '../components/AppIcon';
import { ScreenScaffold } from '../components/ScreenScaffold';
import { useNativeColors } from '../design/native-colors';
import { useLocale } from '../i18n/LocaleContext';

type Filter = 'all' | CommunityActivity['kind'];
type LoadMode = 'initial' | 'refresh' | 'more';

function mergeActivity(existing: readonly CommunityActivity[], incoming: readonly CommunityActivity[]) {
  return [...new Map([...existing, ...incoming].map(item => [item.eventId, item])).values()];
}

export function ActivityInbox() {
  const { locale } = useLocale();
  const cn = locale === 'zh-CN';
  const colors = useNativeColors();
  const router = useRouter();
  const auth = useAccountSession();
  const [items, setItems] = useState<readonly CommunityActivity[]>([]);
  const [loadedOwner, setLoadedOwner] = useState<string|null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);
  const generation = useRef(0);
  const activeRequest = useRef<number | null>(null);
  const alive = useRef(true);

  const load = useCallback(async (mode: LoadMode = 'initial') => {
    const owner = auth.owner;
    if (!owner || (mode === 'more' && !cursor)) return;
    const token = ++generation.current;
    activeRequest.current = token;
    const current = auth.pin();
    if (mode === 'refresh') setRefreshing(true);
    if (mode === 'initial') setLoading(true);
    setFailed(false);
    try {
      const page = await listMyCommunityActivity(mode === 'more' ? cursor : null);
      if (!alive.current || token !== generation.current || !await current()) return;
      setItems(existing => mode === 'more' ? mergeActivity(existing, page.items) : page.items);
      setLoadedOwner(owner);
      setCursor(page.nextCursor);
    } catch {
      if (alive.current && token === generation.current && await current()) setFailed(true);
    } finally {
      if (activeRequest.current === token) activeRequest.current = null;
      if (alive.current && token === generation.current && await current()) {
        if (mode === 'refresh') setRefreshing(false);
        if (mode === 'initial') setLoading(false);
      }
    }
  }, [auth.owner, auth.pin, cursor]);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      ++generation.current;
      activeRequest.current = null;
    };
  }, []);

  useEffect(() => {
    ++generation.current;
    activeRequest.current = null;
    setItems([]);
    setCursor(null);
    setFilter('all');
    setFailed(false);
    setRefreshing(false);
    if (auth.owner) {
      void load('initial');
    } else if (auth.owner === null) {
      setLoading(false);
    }
  }, [auth.owner]);

  const open = useCallback(async (item: CommunityActivity) => {
    const owner = auth.owner;
    if (!owner) return;
    const current = auth.pin();
    if (!alive.current || !await current()) return;
    if (!item.readAt) {
      try {
        await markCommunityActivityRead([item.eventId]);
      } catch {
        if (alive.current && await current()) {
          if (!item.replyId) router.push(`/community/${item.postId}` as never);
          else {
            try {
              const resolved = await getCommunityCommentContext(item.replyId);
              if (alive.current && await current()) router.push(resolved.parentReplyId ? `/community/comments/${resolved.parentReplyId}?childId=${item.replyId}` as never : `/community/${resolved.postId}` as never);
            } catch { /* hidden content must not reopen stale detail */ }
          }
        }
        return;
      }
      if (!alive.current || !await current()) return;
      setItems(existing => existing.map(value => value.eventId === item.eventId ? { ...value, readAt: new Date().toISOString() } : value));
    }
    if (!alive.current || !await current()) return;
    if (!item.replyId) { router.push(`/community/${item.postId}` as never); return; }
    try {
      const resolved = await getCommunityCommentContext(item.replyId);
      if (alive.current && await current()) router.push(resolved.parentReplyId ? `/community/comments/${resolved.parentReplyId}?childId=${item.replyId}` as never : `/community/${resolved.postId}` as never);
    } catch { /* deleted, hidden, or blocked activity cannot navigate */ }
  }, [auth.owner, auth.pin, router]);

  if (auth.owner === null) {
    return <ScreenScaffold compact title={cn ? '消息' : 'Messages'}>
      <View style={styles.empty}>
        <Text style={{ color: colors.muted }}>{cn ? '登录后查看社区互动。' : 'Sign in to see community activity.'}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={cn ? '登录' : 'Sign in'} onPress={() => router.push('/profile' as never)} style={styles.touch}>
          <Text style={{ color: colors.actionPrimary, fontWeight: '600' }}>{cn ? '登录' : 'Sign in'}</Text>
        </Pressable>
      </View>
    </ScreenScaffold>;
  }

  const visible = loadedOwner === auth.owner && auth.owner ? (filter === 'all' ? items : items.filter(item => item.kind === filter)) : [];
  const label = (item: CommunityActivity) => `${item.actor.name} ${item.kind === 'like' ? (cn ? '赞了你的帖子' : 'liked your post') : item.replyId ? (cn ? '回复了你' : 'replied to you') : (cn ? '评论了你的帖子' : 'commented on your post')}${item.readAt ? '' : cn ? '，未读' : ', unread'}`;
  const filterLabel = (value: Filter) => value === 'all' ? (cn ? '全部' : 'All') : value === 'comment' ? (cn ? '评论' : 'Comments') : (cn ? '点赞' : 'Likes');

  return <ScreenScaffold compact title={cn ? '互动' : 'Activity'} leading={<BackButton onPress={()=>router.back()}/>} refreshing={refreshing} refreshLabel={cn ? '刷新消息' : 'Refresh messages'} onRefresh={() => void load('refresh')}>
    <View style={styles.filters}>{(['all', 'comment', 'like'] as const).map(value => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: filter === value }} accessibilityLabel={filterLabel(value)} onPress={() => setFilter(value)} style={[styles.filter, { backgroundColor: filter === value ? colors.leafSoft : colors.surface }]}><Text style={{ color: colors.actionPrimary, fontWeight: '600' }}>{filterLabel(value)}</Text></Pressable>)}</View>
    {loading && !items.length ? <ActivityIndicator color={colors.actionPrimary} /> : null}
    {failed ? <Text accessibilityLiveRegion="polite" style={{ color: colors.muted }}>{cn ? '互动暂不可用，下拉重试。' : 'Activity unavailable. Pull to retry.'}</Text> : null}
    {!loading && !failed && !visible.length ? <View style={styles.empty}><AppIcon name="activity" size={34} color={colors.actionPrimary} /><Text style={{ color: colors.muted }}>{cn ? '还没有互动。' : 'No activity yet.'}</Text></View> : null}
    <View style={styles.list}>{visible.map(item => <Pressable key={item.eventId} accessibilityRole="button" accessibilityLabel={label(item)} accessibilityState={{ selected: !item.readAt }} onPress={() => void open(item)} style={[styles.row, !item.readAt && { backgroundColor: colors.leafSoft }]}><View style={styles.avatar}><AppIcon name={item.kind === 'like' ? 'heart' : 'reply'} color={colors.actionPrimary} size={16} /></View><View style={{ flex: 1 }}><Text style={{ color: colors.ink, fontWeight: '600' }}>{item.actor.name} {item.kind === 'like' ? (cn ? '赞了你的帖子' : 'liked your post') : item.replyId ? (cn ? '回复了你' : 'replied to you') : (cn ? '评论了你的帖子' : 'commented on your post')}</Text><Text style={{ color: colors.muted, fontSize: 13 }}>{new Date(item.createdAt).toLocaleDateString(cn ? 'zh-SG' : 'en-SG', { month: 'short', day: 'numeric' })}</Text></View>{!item.readAt ? <View accessibilityLabel={cn ? '未读' : 'Unread'} style={[styles.unread, { backgroundColor: colors.actionPrimary }]} /> : null}<AppIcon name="chevron" size={16} color={colors.muted} /></Pressable>)}</View>
    {cursor ? <Pressable accessibilityRole="button" accessibilityLabel={cn ? '载入更多' : 'Load more'} onPress={() => void load('more')} style={styles.touch}><Text style={{ color: colors.actionPrimary, fontWeight: '600' }}>{cn ? '载入更多' : 'Load more'}</Text></Pressable> : null}
  </ScreenScaffold>;
}

const styles = StyleSheet.create({
  filters: { flexDirection: 'row', gap: 8 },
  filter: { minHeight: 44, paddingHorizontal: 14, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  list: { gap: 8 },
  row: { minHeight: 64, borderRadius: 16, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E8F2EA' },
  unread: { width: 8, height: 8, borderRadius: 4 },
  touch: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  empty: { paddingVertical: 24, alignItems: 'center', gap: 12 },
});
