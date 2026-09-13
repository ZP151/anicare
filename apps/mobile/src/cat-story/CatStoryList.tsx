import { useCallback, useRef, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { listCatStories, type CatStory, type StoryCursor } from '../api/cat-stories';
import { getCommunityAvatars } from '../api/community-avatar';
import { useAccountSession } from '../auth/use-account-session';
import { CommunityAuthorAvatar } from '../community/CommunityAuthorAvatar';
import { CommunityAuthorSheet } from '../community/CommunityAuthorSheet';
import { CommunityPostImage } from '../community/CommunityPostImage';
import { communitySampleAuthor, communitySampleTitle, communitySampleText } from '../community/test-samples';
import { useNativeColors } from '../design/native-colors';
import type { Locale } from '../i18n/catalog';

export function CatStoryList({ catId, locale }: { catId: string; locale: Locale }) {
  const auth = useAccountSession(), router = useRouter(), c = useNativeColors(), zh = locale === 'zh-CN';
  const [items, setItems] = useState<readonly CatStory[]>([]), [avatars, setAvatars] = useState(new Map<string, string>());
  const [loading, setLoading] = useState(true), [error, setError] = useState<string | null>(null), [hasMore, setHasMore] = useState(false);
  const [author, setAuthor] = useState<CatStory | null>(null);
  const generation = useRef(0), busy = useRef<number | null>(null), cursor = useRef<StoryCursor | null>(null);
  const scope = JSON.stringify([catId, auth.owner]), currentScope = useRef(scope); currentScope.current = scope;
  const [loadedScope, setLoadedScope] = useState('');
  const load = useCallback(async (more = false) => {
    if (auth.owner === undefined || busy.current === generation.current) return;
    const token = generation.current, captured = scope, pinned = auth.pin();
    busy.current = token; setLoading(true); setError(null);
    const valid = async () => token === generation.current && captured === currentScope.current && await pinned();
    try {
      const page = await listCatStories(catId, more ? cursor.current : null);
      if (!await valid()) return;
      setItems(old => more ? [...new Map([...old, ...page.items].map(item => [item.postId, item])).values()] : page.items);
      setLoadedScope(captured); cursor.current = page.nextCursor; setHasMore(page.nextCursor !== null);
      if (!more) setAvatars(new Map());
      // One optional avatar request per page; its failure never discards stories.
      const pictures = await getCommunityAvatars('community_post', page.items.map(item => item.postId)).catch(() => new Map<string, string>());
      if (await valid()) setAvatars(old => new Map([...old, ...pictures]));
    } catch (reason) {
      if (await valid()) {
        const unavailable = reason instanceof Error && reason.message === 'cat_unavailable';
        if (unavailable || !more) { setItems([]); setAvatars(new Map()); setAuthor(null); }
        setError(unavailable ? 'unavailable' : 'failed');
      }
    } finally {
      if (busy.current === token) busy.current = null;
      if (token === generation.current && captured === currentScope.current) setLoading(false);
    }
  }, [catId, auth.owner, auth.pin, scope]);
  useFocusEffect(useCallback(() => {
    ++generation.current; busy.current = null; cursor.current = null;
    setItems([]); setAvatars(new Map()); setAuthor(null); setHasMore(false); setError(null); setLoading(true);
    void load();
    return () => { ++generation.current; };
  }, [load]));
  const visible = loadedScope === scope && auth.owner !== undefined ? items : [];
  const name = (item: CatStory) => communitySampleAuthor(item.postId, locale)?.name ?? item.author.name;
  return <View style={{ gap: 14 }}>
    <View style={{ gap: 4 }}><Text accessibilityRole="header" style={{ color: c.ink, fontSize: 20, fontWeight: '700' }}>{zh ? '共同故事' : 'Shared stories'}</Text><Text style={{ color: c.muted, fontSize: 12 }}>{zh ? '来自认识它的邻居' : 'From neighbours who know this cat'}</Text></View>
    {visible.map(item => {
      const sample = communitySampleText(item.postId, item.body, locale), title = communitySampleTitle(item.postId,item.title,locale) || sample.body, photo = item.media[0];
      return <View key={item.postId} style={{ backgroundColor: c.surface, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: c.line }}>
        <Pressable accessibilityRole="button" accessibilityLabel={`${zh ? '查看作者' : 'View author'} ${name(item)}`} onPress={() => setAuthor(item)} style={{ minHeight: 56, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 9 }}>
          <CommunityAuthorAvatar id={item.postId} avatarKey={item.author.avatarKey} photoUri={avatars.get(item.postId)} size={30} linkToProfile={false} />
          <View style={{ flex: 1, gap: 2 }}><Text style={{ fontSize: 13, color: c.ink, fontWeight: '600' }}>{name(item)}</Text><Text style={{ fontSize: 11, color: c.muted }}>{zh ? '发布于 ' : 'Published '}{new Date(item.publishedAt).toLocaleDateString(zh ? 'zh-SG' : 'en-SG', { month: 'short', day: 'numeric' })}</Text></View>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`${zh ? '打开帖子' : 'Open post'}: ${title}`} onPress={() => router.push(`/community/${item.postId}` as never)}>
          {photo ? <View><CommunityPostImage key={photo.mediaId} postId={item.postId} mediaId={photo.mediaId} label={zh ? '故事照片' : 'Story photo'} retryLabel={zh ? '重试照片' : 'Retry photo'} style={{ width: '100%', aspectRatio: Math.max(.9, Math.min(1.8, photo.width / photo.height)) }} />{item.media.length > 1 ? <View style={{ position: 'absolute', top: 8, right: 8, backgroundColor: '#00000099', borderRadius: 10, padding: 5 }}><Text style={{ color: '#fff', fontSize: 11 }}>1/{item.media.length}</Text></View> : null}</View> : null}
          <View style={{ padding: 12, gap: 6 }}><Text numberOfLines={3} style={{ fontSize: 15, lineHeight: 21, fontWeight: '600', color: c.ink }}>{title}</Text>{item.title ? <Text numberOfLines={2} style={{ fontSize: 13, lineHeight: 19, color: c.muted }}>{sample.body}</Text> : null}{sample.label ? <Text style={{ color: c.muted, fontSize: 11 }}>{sample.label}</Text> : null}<Text style={{ color: c.muted, fontSize: 12 }}>{zh ? `${item.replyCount} 条评论 · 查看原帖` : `${item.replyCount} comments · View original post`}</Text></View>
        </Pressable>
      </View>;
    })}
    {loading ? <ActivityIndicator accessibilityLabel={zh ? '正在读取故事' : 'Loading stories'} color={c.actionPrimary} /> : null}
    {error ? <View style={{ gap: 6 }}><Text style={{ color: c.muted }}>{error === 'unavailable' ? (zh ? '这只猫的故事暂不可用。' : 'Stories for this cat are unavailable.') : (zh ? '故事暂未加载成功。' : 'Stories could not be loaded.')}</Text><Pressable accessibilityRole="button" accessibilityLabel={zh ? '重试故事' : 'Retry stories'} onPress={() => void load(visible.length > 0)} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: c.actionPrimary }}>{zh ? '重试' : 'Retry'}</Text></Pressable></View> : !loading && !visible.length ? <Text style={{ fontSize: 14, color: c.muted }}>{zh ? '分享它的第一个故事吧。' : 'Be the first to share a story.'}</Text> : null}
    {hasMore && !loading && !error ? <Pressable accessibilityRole="button" onPress={() => void load(true)} style={{ minHeight: 44, justifyContent: 'center', alignItems: 'center' }}><Text style={{ color: c.actionPrimary }}>{zh ? '更多故事' : 'More stories'}</Text></Pressable> : null}
    {author && loadedScope === scope && auth.owner !== undefined ? <CommunityAuthorSheet id={author.postId} name={name(author)} avatarKey={author.author.avatarKey} photoUri={avatars.get(author.postId)} zh={zh} onClose={() => setAuthor(null)} onMessage={auth.owner && !author.canEditLink ? () => { setAuthor(null); router.push(`/messages/new?type=community_post&contentId=${author.postId}` as never); } : undefined} /> : null}
  </View>;
}
