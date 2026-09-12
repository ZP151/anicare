import { Image, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { AppIcon } from '../components/AppIcon';
import { useNativeColors } from '../design/native-colors';
import { SG_COMMUNITIES, communityLabel } from '../maps/singapore-communities';
import { useLocale } from '../i18n/LocaleContext';

/** Public links attached to a story, never a precise sighting location. */
export function PostContext({ catId, catName, portrait, communitySlug }: { catId?: string | null; catName?: string; portrait?: string; communitySlug?: string | null }) {
  const c = useNativeColors(), router = useRouter(), { locale } = useLocale(), zh = locale === 'zh-CN';
  const area = SG_COMMUNITIES.find(item => item.id === communitySlug);
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
    {catId ? <Pressable accessibilityRole="button" accessibilityLabel={zh ? '查看猫咪档案' : 'View cat profile'} onPress={() => router.push(`/cat/${catId}` as never)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingHorizontal: 10, borderRadius: 22, backgroundColor: c.surface }}>
      {portrait ? <Image source={{ uri: portrait }} style={{ width: 28, height: 28, borderRadius: 14 }} /> : <AppIcon name="cat" size={22} color={c.muted} />}
      <Text style={{ fontSize: 13, fontWeight: '600', color: c.ink }}>{catName ?? (zh ? '猫咪档案' : 'Cat profile')}</Text><AppIcon name="chevron" size={12} color={c.muted} />
    </Pressable> : null}
    {area ? <View style={{ flexDirection: 'row', gap: 5, alignItems: 'center', flexShrink: 1 }}><AppIcon name="location" size={14} color={c.muted} /><Text style={{ color: c.muted, fontSize: 12, flexShrink: 1 }}>{communityLabel(area, locale)}</Text></View> : null}
  </View>;
}
