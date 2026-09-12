import { getCommunityThreadContext, type CommunityThreadContext } from '../api/community-thread-context';
import {BackButton} from '../components/BackButton';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { randomUUID } from 'expo-crypto';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { createCommunityCommentReply, listCommunityCommentReplies } from '../api/community-comment-replies';
import type { CommunityReply } from '../api/community';
import { getCommunityAvatars } from '../api/community-avatar';
import { useAccountSession } from '../auth/use-account-session';
import { AppIcon } from '../components/AppIcon';
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
  const [header, setHeader] = useState<CommunityThreadContext | null>(null);
  const failedMore = useRef(false);
  const input = useRef<TextInput>(null);
  const [loadedScope, setLoadedScope] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);
  const [notice, setNotice] = useState('');
  const [writing, setWriting] = useState(false);
  const alive = useRef(true), generation = useRef(0), activeLoad = useRef<number | null>(null), writeGeneration = useRef(0), writingRequest = useRef(false), pending = useRef<Pending | null>(null);
  const scope = `${auth.owner ?? ''}|${id}|${childId ?? ''}`;
  const scopeRef = useRef(scope); scopeRef.current = scope;
  const shownHeader = loadedScope === scope ? header : null;
  const shown = loadedScope === scope ? items.filter(item => item.replyId !== shownHeader?.target?.replyId) : [];
  const shownCursor = loadedScope === scope ? cursor : null;

  const load = async (more = false, refresh = false) => {
    if (!alive.current || activeLoad.current !== null || (more && !shownCursor)) return;
    const token = ++generation.current, current = auth.pin(), captured = scope, requestedCursor = more ? shownCursor : null;
    activeLoad.current = token;
    if (!more) failedMore.current = false;
    if (refresh) setRefreshing(true); else if (!more) setLoading(true);
    setFailed(false);
    try {
      const [page, nextHeader] = await Promise.all([listCommunityCommentReplies(id, requestedCursor), getCommunityThreadContext(id, typeof childId === 'string' ? childId : undefined)]);
      const photos = await getCommunityAvatars('community_reply', [nextHeader.parent.replyId, ...(nextHeader.target ? [nextHeader.target.replyId] : []), ...page.items.map(item => item.replyId)]).catch(() => new Map<string, string>());
      if (alive.current && token === generation.current && scopeRef.current === captured && await current()) {
        setHeader(nextHeader);
        setItems(old => more ? [...new Map([...old, ...page.items].map(item => [item.replyId, item])).values()] : page.items);
        setAvatars(old => new Map([...(more ? old : []), ...photos]));
        setCursor(page.nextCursor);
        setLoadedScope(captured);
      }
    } catch (error) {
      if (alive.current && token === generation.current && scopeRef.current === captured && await current()) { failedMore.current = more; setFailed(true); if (error instanceof Error && error.message === 'community_reply_hidden') { setHeader(null); setItems([]); setCursor(null); } }
    } finally {
      if (activeLoad.current === token) activeLoad.current = null;
      if (alive.current && token === generation.current && scopeRef.current === captured && await current()) {
        if (refresh) setRefreshing(false); else if (!more) setLoading(false);
      }
    }
  };

  useEffect(() => { alive.current = true; return () => { alive.current = false; ++generation.current; }; }, []);
  useEffect(() => {
    ++generation.current; ++writeGeneration.current; activeLoad.current = null; failedMore.current = false; writingRequest.current = false; pending.current = null;
    setHeader(null); setItems([]); setAvatars(new Map()); setCursor(null); setLoadedScope(''); setBody(''); setNotice(''); setFailed(false); setWriting(false);
    if (auth.owner !== undefined) void load();
  }, [id, childId, auth.owner]);

  const reply = async () => {
    const trimmed = body.trim();
    if (!shownHeader || !auth.owner || !trimmed || writingRequest.current) return;
    writingRequest.current = true; setWriting(true);
    const current = auth.pin(), requestScope = scope, writeTicket = ++writeGeneration.current, key = JSON.stringify([requestScope, trimmed]);
    const valid = async () => alive.current && writeTicket === writeGeneration.current && scopeRef.current === requestScope && await current();
    if (pending.current?.key !== key) pending.current = { key, requestId: randomUUID() };
    const requestId = pending.current.requestId;
    try {
      if (!await valid()) return;
      await createCommunityCommentReply(id, body, undefined, requestId);
      if (await valid()) {
        pending.current = null; setBody(''); setNotice(zh ? '回复已发布' : 'Reply posted'); await load();
      }
    } catch {
      if (await valid()) setNotice(zh ? '回复未完成，内容已保留。请重试。' : 'Reply not completed. Your text is kept; please retry.');
    } finally {
      if (writeTicket === writeGeneration.current && scopeRef.current === requestScope) { writingRequest.current = false; if (alive.current) setWriting(false); }
    }
  };

  const sample = (item: CommunityReply) => communitySampleText(item.replyId, item.body, locale);
  const renderReply = (item: CommunityReply, selected: boolean, parent = false) => {
    const fixture = sample(item);
    return <View key={item.replyId} accessibilityState={{ selected }} style={[styles.row, { borderBottomColor: colors.line }]}>
      <View style={styles.author}><CommunityAuthorAvatar id={item.replyId} avatarKey={fixture.label ? 'person' : item.author.avatarKey} photoUri={avatars.get(item.replyId)} size={parent ? 36 : 30} /><View style={{ flex: 1 }}><Text style={styles.name}>{communitySampleAuthor(item.replyId, locale)?.name ?? item.author.name}</Text><Text style={styles.meta}>{new Date(item.createdAt).toLocaleDateString(zh ? 'zh-SG' : 'en-SG', { month: 'short', day: 'numeric' })}</Text></View>{auth.owner ? <CommunityContentActions type="community_reply" id={item.replyId} canDelete={item.canDelete} zh={zh} pin={auth.pin} onChanged={() => void load(false, true)} onNotice={setNotice} /> : null}</View>
      <Text style={styles.body}>{fixture.body}</Text>
      {parent ? <Pressable accessibilityRole="button" accessibilityLabel={zh ? '回复这条评论' : 'Reply to this comment'} onPress={() => auth.owner ? input.current?.focus() : router.push('/profile' as never)} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={styles.link}>{zh ? '回复' : 'Reply'}</Text></Pressable> : null}
      {selected ? <Text accessibilityLiveRegion="polite" style={styles.selected}>{zh ? '通知中的回复' : 'Reply from notification'}</Text> : null}
    </View>;
  };
  return <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={[styles.safe, { backgroundColor: colors.canvas }]}><KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.safe}>
    <View style={[styles.header, { borderBottomColor: colors.line }]}><BackButton onPress={() => router.canGoBack() ? router.back() : router.replace('/' as never)}/><Text accessibilityRole="header" style={styles.title}>{zh ? '评论回复' : 'Comment replies'}</Text></View>
    <ScrollView testID="comment-thread-scroll" style={styles.safe} contentContainerStyle={styles.content} keyboardDismissMode="interactive" keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(false, true)} />}>
    {auth.failed ? <Pressable accessibilityRole="button" onPress={() => void auth.reload()} style={styles.touch}><Text style={styles.link}>{zh ? '重试账户连接' : 'Retry account connection'}</Text></Pressable> : null}
    {loading && !shown.length ? <ActivityIndicator color={colors.actionPrimary} /> : null}
    {failed ? <Pressable accessibilityRole="button" onPress={() => void load(failedMore.current)} style={styles.touch}><Text style={styles.link}>{zh ? '回复暂不可用，点此重试。' : 'Replies unavailable. Tap to retry.'}</Text></Pressable> : null}
    {!loading && !failed && !shown.length && !shownHeader?.target ? <Text style={styles.note}>{zh ? '还没有回复。' : 'No replies yet.'}</Text> : null}
    {shownHeader ? <View style={{ marginHorizontal: 16, gap: 8, marginBottom: 16 }}>
      <Pressable accessibilityRole="button" accessibilityLabel={zh ? '查看原帖' : 'View original post'} onPress={() => router.push(`/community/${shownHeader.post.postId}` as never)} style={{ paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line, minHeight: 44 }}>
        <Text style={styles.meta}>{zh ? '原帖' : 'Original post'} · {communitySampleAuthor(shownHeader.post.postId, locale)?.name ?? shownHeader.post.author.name}</Text>
        <Text numberOfLines={2} style={[styles.body, { marginTop: 4 }]}>{communitySampleText(shownHeader.post.postId, shownHeader.post.body, locale).body}</Text>
      </Pressable>
      {renderReply(shownHeader.parent, false, true)}
      {shownHeader.targetUnavailable ? <Text accessibilityLiveRegion="polite" style={styles.meta}>{zh ? '这条通知的回复暂不可用。' : 'This notification reply is unavailable.'}</Text> : null}
    </View> : null}
    {shownHeader?.target ? <View style={[styles.rows, { backgroundColor: colors.leafSoft }]}>{renderReply(shownHeader.target, true)}</View> : null}
    <View style={[styles.rows, { backgroundColor: colors.surface }]}>{shown.map(item => renderReply(item, false))}</View>
    {shownCursor ? <Pressable accessibilityRole="button" accessibilityLabel={zh ? '载入更多回复' : 'Load more replies'} onPress={() => void load(true)} style={styles.touch}><Text style={styles.link}>{zh ? '载入更多回复' : 'Load more replies'}</Text></Pressable> : null}
    {notice ? <Text accessibilityLiveRegion="polite" style={styles.note}>{notice}</Text> : null}
    {auth.owner === null ? <Pressable accessibilityRole="button" onPress={() => router.push('/profile' as never)} style={styles.touch}><Text style={styles.link}>{zh ? '登录后参与讨论' : 'Sign in to join the conversation'}</Text></Pressable> : null}
    </ScrollView>
    {auth.owner && shownHeader ? <GlassSurface style={styles.composer}><TextInput ref={input} accessibilityLabel={zh ? '写回复' : 'Write a reply'} value={body} onChangeText={setBody} multiline maxLength={2000} editable={!writing} placeholder={zh ? '写一条回复…' : 'Write a reply…'} placeholderTextColor={colors.muted} style={styles.input}/><Pressable accessibilityRole="button" accessibilityLabel={zh ? '发送回复' : 'Send reply'} disabled={writing || !body.trim()} onPress={() => void reply()} style={styles.send}><AppIcon name="send" color={colors.onAction} size={19}/></Pressable></GlassSurface> : null}
  </KeyboardAvoidingView></SafeAreaView>;
}

const makeStyles = (c: ReturnType<typeof useNativeColors>) => StyleSheet.create({
  safe: { flex: 1 }, header: { gap:12, minHeight: 56, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth }, title: { flex: 1, fontSize: 17, fontWeight: '700', color: c.ink }, content: { paddingVertical: 12, flexGrow: 1 }, rows: { paddingHorizontal: 16 }, row: { gap: 6, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth }, author: { flexDirection: 'row', alignItems: 'center', gap: 10 }, name: { fontSize: 15, fontWeight: '700', color: c.ink }, meta: { fontSize: 12, color: c.muted }, body: { fontSize: 15, lineHeight: 22, color: c.ink }, selected: { color: c.actionPrimary, fontSize: 13, fontWeight: '600' }, composer: { borderRadius: 0, paddingHorizontal: 12, paddingVertical: 8, flexDirection: 'row', alignItems: 'flex-end', gap: 10 }, input: { flex: 1, minHeight: 44, maxHeight: 120, color: c.ink, fontSize: 15, lineHeight: 22 }, send: { width: 44, height: 44, borderRadius: 22, backgroundColor: c.actionPrimary, alignItems: 'center', justifyContent: 'center' }, touch: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start', marginHorizontal: 16 }, link: { fontSize: 15, fontWeight: '600', color: c.actionPrimary }, note: { marginHorizontal: 16, fontSize: 15, lineHeight: 23, color: c.muted },
});
