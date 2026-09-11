import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { randomUUID } from 'expo-crypto';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { createCommunityCommentReply, listCommunityCommentReplies } from '../api/community-comment-replies';
import type { CommunityReply } from '../api/community';
import { getCommunityAvatars } from '../api/community-avatar';
import { useAccountSession } from '../auth/use-account-session';
import { AppIcon } from '../components/AppIcon';
import { ScreenScaffold } from '../components/ScreenScaffold';
import { GlassSurface } from '../design/GlassSurface';
import { useNativeColors } from '../design/native-colors';
import { useLocale } from '../i18n/LocaleContext';
import { CommunityAuthorAvatar } from './CommunityAuthorAvatar';
import { CommunityContentActions } from './CommunityContentActions';
import { communitySampleAuthor, communitySampleText } from './test-samples';

type Pending = { key: string; requestId: string };

export function CommunityCommentThread() {
  const { id, childId } = useLocalSearchParams<{ id: string; childId?: string }>();
  const router = useRouter();
  const auth = useAccountSession();
  const { locale } = useLocale();
  const zh = locale === 'zh-CN';
  const colors = useNativeColors();
  const styles = makeStyles(colors);
  const [items, setItems] = useState<readonly CommunityReply[]>([]);
  const [avatars, setAvatars] = useState(new Map<string, string>());
  const [cursor, setCursor] = useState<string | null>(null);
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);
  const [notice, setNotice] = useState('');
  const [writing, setWriting] = useState(false);
  const alive = useRef(true), generation = useRef(0), loadingRequest = useRef(false), writingRequest = useRef(false), pending = useRef<Pending | null>(null);
  const scope = `${auth.owner ?? ''}|${id}`;

  const load = async (more = false, refresh = false) => {
    if (!alive.current || loadingRequest.current || (more && !cursor)) return;
    loadingRequest.current = true;
    const token = ++generation.current, current = auth.pin(), requestedCursor = more ? cursor : null;
    if (refresh) setRefreshing(true); else if (!more) setLoading(true);
    setFailed(false);
    try {
      const page = await listCommunityCommentReplies(id, requestedCursor);
      const photos = await getCommunityAvatars('community_reply', page.items.map(item => item.replyId)).catch(() => new Map<string, string>());
      if (alive.current && token === generation.current && await current()) {
        setItems(old => more ? [...old, ...page.items] : page.items);
        setAvatars(old => new Map([...(more ? old : []), ...photos]));
        setCursor(page.nextCursor);
      }
    } catch {
      if (alive.current && token === generation.current && await current()) setFailed(true);
    } finally {
      loadingRequest.current = false;
      if (alive.current && token === generation.current && await current()) {
        if (refresh) setRefreshing(false); else if (!more) setLoading(false);
      }
    }
  };

  useEffect(() => { alive.current = true; return () => { alive.current = false; ++generation.current; }; }, []);
  useEffect(() => {
    ++generation.current; loadingRequest.current = false; writingRequest.current = false; pending.current = null;
    setItems([]); setAvatars(new Map()); setCursor(null); setBody(''); setNotice(''); setFailed(false); setWriting(false);
    if (auth.owner !== undefined) void load();
  }, [id, auth.owner]);

  const reply = async () => {
    const trimmed = body.trim();
    if (!auth.owner || !trimmed || writingRequest.current) return;
    writingRequest.current = true; setWriting(true);
    const current = auth.pin(), requestScope = scope, key = JSON.stringify([requestScope, trimmed]);
    if (pending.current?.key !== key) pending.current = { key, requestId: randomUUID() };
    const requestId = pending.current.requestId;
    try {
      if (!await current()) return;
      await createCommunityCommentReply(id, body, undefined, requestId);
      if (alive.current && requestScope === `${auth.owner ?? ''}|${id}` && await current()) {
        pending.current = null; setBody(''); setNotice(zh ? '回复已发布' : 'Reply posted'); await load();
      }
    } catch {
      if (alive.current && requestScope === `${auth.owner ?? ''}|${id}` && await current()) setNotice(zh ? '回复未完成，内容已保留。请重试。' : 'Reply not completed. Your text is kept; please retry.');
    } finally {
      if (requestScope === `${auth.owner ?? ''}|${id}`) { writingRequest.current = false; if (alive.current) setWriting(false); }
    }
  };

  const sample = (item: CommunityReply) => communitySampleText(item.replyId, item.body, locale);
  return <ScreenScaffold compact title={zh ? '评论回复' : 'Comment replies'} refreshing={refreshing} refreshLabel={zh ? '刷新' : 'Refresh'} onRefresh={() => void load(false, true)} trailing={<Pressable accessibilityRole="button" accessibilityLabel={zh ? '返回' : 'Back'} onPress={() => router.canGoBack() ? router.back() : router.replace('/' as never)} style={styles.touch}><AppIcon name="close" color={colors.actionPrimary} /></Pressable>}>
    {auth.failed ? <Pressable accessibilityRole="button" onPress={() => void auth.reload()} style={styles.touch}><Text style={styles.link}>{zh ? '重试账户连接' : 'Retry account connection'}</Text></Pressable> : null}
    {loading && !items.length ? <ActivityIndicator color={colors.actionPrimary} /> : null}
    {failed ? <Pressable accessibilityRole="button" onPress={() => void load()} style={styles.touch}><Text style={styles.link}>{zh ? '回复暂不可用，点此重试。' : 'Replies unavailable. Tap to retry.'}</Text></Pressable> : null}
    {!loading && !failed && !items.length ? <Text style={styles.note}>{zh ? '还没有回复。' : 'No replies yet.'}</Text> : null}
    {items.map(item => { const fixture = sample(item), selected = childId === item.replyId; return <View key={item.replyId} accessibilityState={{ selected }} style={[styles.row, selected && { backgroundColor: colors.leafSoft }]}>
      <View style={styles.author}><CommunityAuthorAvatar id={item.replyId} avatarKey={fixture.label ? 'person' : item.author.avatarKey} photoUri={avatars.get(item.replyId)} size={36} /><View style={{ flex: 1 }}><Text style={styles.name}>{communitySampleAuthor(item.replyId, locale)?.name ?? item.author.name}</Text><Text style={styles.meta}>{new Date(item.createdAt).toLocaleDateString(zh ? 'zh-SG' : 'en-SG', { month: 'short', day: 'numeric' })}</Text></View>{auth.owner ? <CommunityContentActions type="community_reply" id={item.replyId} canDelete={item.canDelete} zh={zh} pin={auth.pin} onChanged={() => void load(false, true)} onNotice={setNotice} /> : null}</View>
      <Text style={styles.body}>{fixture.body}</Text>{selected ? <Text accessibilityLiveRegion="polite" style={styles.selected}>{zh ? '已定位到此回复' : 'Reply located'}</Text> : null}
    </View>; })}
    {cursor ? <Pressable accessibilityRole="button" accessibilityLabel={zh ? '载入更多回复' : 'Load more replies'} onPress={() => void load(true)} style={styles.touch}><Text style={styles.link}>{zh ? '载入更多回复' : 'Load more replies'}</Text></Pressable> : null}
    {notice ? <Text accessibilityLiveRegion="polite" style={styles.note}>{notice}</Text> : null}
    {auth.owner ? <GlassSurface style={styles.composer}><TextInput accessibilityLabel={zh ? '写回复' : 'Write a reply'} value={body} onChangeText={setBody} multiline maxLength={2000} editable={!writing} placeholder={zh ? '写一条回复…' : 'Write a reply…'} placeholderTextColor={colors.muted} style={styles.input}/><Pressable accessibilityRole="button" accessibilityLabel={zh ? '发送回复' : 'Send reply'} disabled={writing || !body.trim()} onPress={() => void reply()} style={styles.send}><AppIcon name="send" color={colors.onAction} size={19}/></Pressable></GlassSurface> : auth.owner === null ? <Pressable accessibilityRole="button" onPress={() => router.push('/profile' as never)} style={styles.touch}><Text style={styles.link}>{zh ? '登录后参与讨论' : 'Sign in to join the conversation'}</Text></Pressable> : null}
  </ScreenScaffold>;
}

const makeStyles = (c: ReturnType<typeof useNativeColors>) => StyleSheet.create({
  row: { gap: 8, padding: 14, borderRadius: 18, backgroundColor: c.surface }, author: { flexDirection: 'row', alignItems: 'center', gap: 10 }, name: { fontSize: 15, fontWeight: '700', color: c.ink }, meta: { fontSize: 12, color: c.muted }, body: { fontSize: 16, lineHeight: 24, color: c.ink }, selected: { color: c.actionPrimary, fontSize: 13, fontWeight: '600' }, composer: { borderRadius: 22, padding: 12, flexDirection: 'row', alignItems: 'flex-end', gap: 10 }, input: { flex: 1, minHeight: 48, color: c.ink, fontSize: 16, lineHeight: 23 }, send: { width: 44, height: 44, borderRadius: 22, backgroundColor: c.actionPrimary, alignItems: 'center', justifyContent: 'center' }, touch: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start' }, link: { fontSize: 15, fontWeight: '600', color: c.actionPrimary }, note: { fontSize: 15, lineHeight: 23, color: c.muted },
});
