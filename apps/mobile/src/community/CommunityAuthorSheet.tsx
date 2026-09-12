import { Modal, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CommunityAuthorAvatar } from './CommunityAuthorAvatar';
import { AppIcon } from '../components/AppIcon';
import { useNativeColors } from '../design/native-colors';

export function CommunityAuthorSheet({ id, name, avatarKey, photoUri, zh, onClose, onMessage }: { id: string; name: string; avatarKey: string; photoUri?: string; zh: boolean; onClose(): void; onMessage?: () => void }) {
  const c = useNativeColors();
  return <Modal visible transparent animationType="fade" onRequestClose={onClose}>
    <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: '#00000066' }}>
      <Pressable accessibilityRole="button" accessibilityLabel={zh ? '关闭资料背景' : 'Dismiss profile backdrop'} onPress={onClose} style={{ flex: 1 }} />
      <SafeAreaView edges={['bottom', 'left', 'right']} accessibilityViewIsModal style={{ padding: 20, gap: 16, backgroundColor: c.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24 }}>
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}><CommunityAuthorAvatar id={id} avatarKey={avatarKey} photoUri={photoUri} size={56} linkToProfile={false} /><Text accessibilityRole="header" style={{ flex: 1, fontSize: 18, fontWeight: '600', color: c.ink }}>{name}</Text><Pressable accessibilityRole="button" accessibilityLabel={zh ? '关闭作者资料' : 'Close author profile'} onPress={onClose} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}><AppIcon name="close" color={c.ink} size={22} /></Pressable></View>
        {onMessage ? <Pressable accessibilityRole="button" accessibilityLabel={zh ? '与作者私信' : 'Start a message with author'} onPress={onMessage} style={{ minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 24, backgroundColor: c.actionPrimary }}><Text style={{ fontSize: 15, fontWeight: '600', color: c.onAction }}>{zh ? '发送私信' : 'Message author'}</Text></Pressable> : null}
      </SafeAreaView>
    </View>
  </Modal>;
}
