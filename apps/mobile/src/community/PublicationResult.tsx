import { useCallback, useRef, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { getCommunityPost, type CommunityPost } from '../api/community';
import { useAccountSession } from '../auth/use-account-session';
import { ScreenScaffold } from '../components/ScreenScaffold';
import { AppIcon } from '../components/AppIcon';
import { useNativeColors } from '../design/native-colors';
import type { Locale } from '../i18n/catalog';

/** Re-read the public post; route parameters never carry draft content or cat identity. */
export function PublicationResult({ postId, locale }: { postId: string; locale: Locale }) {
 const auth = useAccountSession(), c = useNativeColors(), router = useRouter(), zh = locale === 'zh-CN';
 const [post, setPost] = useState<CommunityPost | null>(null), [error, setError] = useState<string | null>(null), [loading, setLoading] = useState(true), [retry, setRetry] = useState(0);
 const scope = JSON.stringify([auth.owner, postId]), current = useRef(scope); current.current = scope;
 const [loadedScope, setLoadedScope] = useState('');
 useFocusEffect(useCallback(() => {
  let active = true; setPost(null); setError(null); setLoading(true);
  if (auth.owner === undefined) return;
  const pinned = auth.pin();
  void getCommunityPost(postId).then(async value => { if (active && current.current === scope && await pinned()) { setPost(value); setLoadedScope(scope); } })
   .catch(async reason => { if (active && current.current === scope && await pinned()) setError(reason instanceof Error && reason.message === 'community_post_hidden' ? 'hidden' : 'failed'); })
   .finally(() => { if (active && current.current === scope) setLoading(false); });
  return () => { active = false; };
 }, [auth.owner, auth.pin, postId, scope, retry]));
 const visible = loadedScope === scope && auth.owner !== undefined ? post : null;
 const button = (label: string, path: string, primary = false) => <Pressable accessibilityRole="button" onPress={() => router.replace(path as never)} style={{ minHeight: 48, borderRadius: 24, paddingHorizontal: 16, justifyContent: 'center', alignItems: 'center', backgroundColor: primary ? c.actionPrimary : c.surface, borderWidth: primary ? 0 : 1, borderColor: c.line }}><Text style={{ color: primary ? c.onAction : c.ink, fontSize: 15, fontWeight: '600' }}>{label}</Text></Pressable>;
 return <ScreenScaffold compact title={zh ? '分享结果' : 'Your story'}><View style={{ gap: 16, paddingVertical: 20 }}>
  {loading ? <ActivityIndicator /> : visible ? <>
   <AppIcon name="check" size={36} color={c.actionPrimary} /><Text accessibilityRole="header" style={{ fontSize: 24, fontWeight: '700', color: c.ink }}>{zh ? '故事已发布' : 'Story published'}</Text>
   <Text numberOfLines={3} style={{ color: c.muted, fontSize: 15, lineHeight: 22 }}>{visible.body}</Text>
   {visible.catId ? button(zh ? '前往猫主页' : 'Go to cat home', `/cat/${visible.catId}`, true) : null}
   {button(zh ? '查看原帖' : 'View original post', `/community/${visible.postId}`, !visible.catId)}
   {!visible.catId && visible.canDelete ? button(zh ? '稍后关联猫咪' : 'Link a cat later', `/community/${visible.postId}?editCat=1`) : null}
  </> : error ? <><Text style={{ color: c.muted, fontSize: 15 }}>{error === 'hidden' ? (zh ? '这篇帖子目前不可用。' : 'This post is currently unavailable.') : (zh ? '暂时无法读取帖子，请重试。' : 'Could not read this post. Retry.')}</Text><Pressable accessibilityRole="button" onPress={() => setRetry(n => n + 1)} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: c.actionPrimary }}>{zh ? '重试' : 'Retry'}</Text></Pressable></> : null}
  {button(zh ? '返回发现' : 'Back to Explore', '/')}
 </View></ScreenScaffold>;
}
