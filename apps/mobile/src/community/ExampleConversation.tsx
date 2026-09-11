import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAccountSession } from '../auth/use-account-session';
import { ScreenScaffold } from '../components/ScreenScaffold';
import { AppIcon } from '../components/AppIcon';
import { GlassSurface } from '../design/GlassSurface';
import { useNativeColors } from '../design/native-colors';
import { useLocale } from '../i18n/LocaleContext';
import { ProfileAvatar } from '../profile/ProfileAvatar';
import { EXAMPLE_CONVERSATIONS, exampleText } from './example-conversations';

export function ExampleConversation() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const auth = useAccountSession();
  // Remount local writing state on account or route changes, including before effects run.
  return <ExampleThread key={`${auth.owner ?? ''}|${id}`} id={id} />;
}

function ExampleThread({ id }: { id: string }) {
  const c = useNativeColors(), { locale } = useLocale(), zh = locale === 'zh-CN', router = useRouter();
  const example = EXAMPLE_CONVERSATIONS.find(item => item.id === id);
  const [body, setBody] = useState(''), [written, setWritten] = useState<readonly string[]>([]);
  const addReply = () => { if (body.trim()) { setWritten(old => [...old, body.trim()]); setBody(''); } };
  return <ScreenScaffold compact title={example ? exampleText(example.name, zh) : (zh ? '示例会话' : 'Sample conversation')}
    trailing={<Pressable accessibilityRole="button" accessibilityLabel={zh ? '返回' : 'Back'} style={s.touch} onPress={() => router.canGoBack() ? router.back() : router.replace('/discuss' as never)}><AppIcon name="back" color={c.ink} /></Pressable>}
    footer={example ? <GlassSurface style={s.composer}><TextInput accessibilityLabel={zh ? '试写回复' : 'Try a reply'} placeholder={zh ? '试写一条回复…' : 'Try a reply…'} placeholderTextColor={c.muted} value={body} onChangeText={setBody} multiline maxLength={2000} style={[s.input, { color: c.ink }]} /><Pressable accessibilityRole="button" accessibilityLabel={zh ? '添加试写回复' : 'Add practice reply'} disabled={!body.trim()} onPress={addReply} style={[s.send, { backgroundColor: c.actionPrimary, opacity: body.trim() ? 1 : 0.45 }]}><AppIcon name="send" size={19} color={c.onAction} /></Pressable></GlassSurface> : undefined}>
    <Text style={[s.note, { color: c.muted }]}>{zh ? '示例会话 · 仅供试用' : 'Sample conversation · practice only'}</Text>
    <Text style={[s.note, { color: c.muted }]}>{zh ? '试写内容仅在本页展示，离开后清除，不会发送给任何人。' : 'Practice replies stay on this page, clear when you leave, and are not sent to anyone.'}</Text>
    {example ? <>
      <View style={s.person}><ProfileAvatar avatarKey={example.avatarKey} size={40} /><Text style={[s.note, { color: c.muted }]}>{exampleText(example.area, zh)}</Text></View>
      {example.messages.map((message, index) => <View key={index} style={[s.bubble, { alignSelf: message.mine ? 'flex-end' : 'flex-start', backgroundColor: message.mine ? c.actionPrimary : c.surface }]}><Text style={[s.body, { color: message.mine ? c.onAction : c.ink }]}>{exampleText(message.text, zh)}</Text></View>)}
      {written.map((text, index) => <View key={`practice-${index}`} style={[s.bubble, { alignSelf: 'flex-end', backgroundColor: c.actionPrimary }]}><Text style={[s.body, { color: c.onAction }]}>{text}</Text></View>)}
      {written.length ? <Text accessibilityLiveRegion="polite" style={[s.note, { textAlign: 'right', color: c.muted }]}>{zh ? '试写已添加 · 未发送' : 'Practice reply added · not sent'}</Text> : null}
    </> : <Text style={{ color: c.muted }}>{zh ? '找不到这段示例会话。' : 'This sample conversation is unavailable.'}</Text>}
  </ScreenScaffold>;
}

const s = StyleSheet.create({
  touch: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' },
  person: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 8 },
  bubble: { maxWidth: '84%', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  body: { fontSize: 15, lineHeight: 22 }, note: { fontSize: 12, lineHeight: 18 },
  composer: { borderRadius: 24, padding: 8, flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  input: { flex: 1, minHeight: 44, maxHeight: 120, paddingHorizontal: 10, paddingVertical: 10, fontSize: 15, lineHeight: 22 },
  send: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
