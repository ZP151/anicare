import { Tabs, useRouter } from 'expo-router';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { Platform } from 'react-native';
import { CustomTabBar } from '../../src/navigation/CustomTabBar';
import { usesNativeLiquidTabs } from '../../src/navigation/native-tabs-policy';
import { useLocale } from '../../src/i18n/LocaleContext';

export default function TabLayout() {
  const router = useRouter(), {locale} = useLocale(), cn = locale === 'zh-CN';
  if (usesNativeLiquidTabs(Platform.OS, Platform.Version)) return <NativeTabs tintColor="#2465D8" disableTransparentOnScrollEdge>
    <NativeTabs.Trigger name="index"><NativeTabs.Trigger.Icon sf={{default:'house',selected:'house.fill'}}/><NativeTabs.Trigger.Label>{cn?'首页':'Home'}</NativeTabs.Trigger.Label></NativeTabs.Trigger>
    <NativeTabs.Trigger name="map"><NativeTabs.Trigger.Icon sf={{default:'map',selected:'map.fill'}}/><NativeTabs.Trigger.Label>{cn?'地图':'Map'}</NativeTabs.Trigger.Label></NativeTabs.Trigger>
    <NativeTabs.Trigger name="discuss"><NativeTabs.Trigger.Icon sf={{default:'bubble.left.and.bubble.right',selected:'bubble.left.and.bubble.right.fill'}}/><NativeTabs.Trigger.Label>{cn?'消息':'Messages'}</NativeTabs.Trigger.Label></NativeTabs.Trigger>
    <NativeTabs.Trigger name="profile"><NativeTabs.Trigger.Icon sf={{default:'person.crop.circle',selected:'person.crop.circle.fill'}}/><NativeTabs.Trigger.Label>{cn?'我的':'Me'}</NativeTabs.Trigger.Label></NativeTabs.Trigger>
    {/* The search role gives iOS 26 its same-row detached circle. A custom plus
        overrides the system glyph; prevented selection still emits tabPress. */}
    <NativeTabs.Trigger name="compose" role="search" disabled accessibilityLabel={cn?'创建':'Create'} listeners={{tabPress:()=>router.push('/create' as never)}}>
      <NativeTabs.Trigger.Icon sf="plus"/><NativeTabs.Trigger.Label hidden>{cn?'创建':'Create'}</NativeTabs.Trigger.Label>
    </NativeTabs.Trigger>
  </NativeTabs>;
  return <Tabs tabBar={props => <CustomTabBar {...props} />} screenOptions={{ headerShown: false }}>
    <Tabs.Screen name="index" options={{ title: 'Home' }} />
    <Tabs.Screen name="map" options={{ title: 'Map' }} />
    <Tabs.Screen name="discuss" options={{ title: 'Messages' }} />
    <Tabs.Screen name="profile" options={{ title: 'Me' }} />
    <Tabs.Screen name="compose" options={{ href: null }} />
  </Tabs>;
}
