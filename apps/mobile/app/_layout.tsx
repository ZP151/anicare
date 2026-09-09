import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { AuthLinkHandler } from '../src/components/AuthLinkHandler';
import { LocaleProvider } from '../src/i18n/LocaleContext';
import { useLocale } from '../src/i18n/LocaleContext';
import { MediaUploadRecovery } from '../src/media/MediaUploadRecovery';

export default function RootLayout() {
  return (
    <LocaleProvider>
      <AuthLinkHandler />
      <MediaUploadRecovery />
      <StatusBar style="auto" />
      <LocalizedStack />
    </LocaleProvider>
  );
}

function LocalizedStack() {
  const { locale } = useLocale();
  const cn = locale === 'zh-CN';
  return <Stack screenOptions={{ headerShown: true, headerBackTitle: cn ? '返回' : 'Back' }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="cat/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="report/drafts" options={{ headerShown: false }} />
        <Stack.Screen name="following" options={{ title: cn ? '关注' : 'Following' }} />
        <Stack.Screen name="report/new" options={{ headerShown: false }} />
        <Stack.Screen name="report/receipt" options={{ title: cn ? '报告回执' : 'Report receipt' }} />
        <Stack.Screen name="report/my-reports" options={{ title: cn ? '我的报告' : 'My reports' }} />
        <Stack.Screen name="report/redaction-review" options={{ headerShown: false, presentation: 'modal' }} />
        <Stack.Screen name="care/[id]" options={{ title: cn ? '照护记录' : 'Care records' }} />
        <Stack.Screen name="care/my-care" options={{ title: cn ? '我的照护' : 'My care' }} />
        <Stack.Screen name="privacy" options={{ title: cn ? '隐私与请求' : 'Privacy and requests' }} />
        <Stack.Screen name="safety/[id]" options={{ title: cn ? '内容安全' : 'Content safety' }} />
        <Stack.Screen name="community/geography" options={{ headerShown: false }} />
        <Stack.Screen name="community/new" options={{ headerShown: false }} />
        <Stack.Screen name="community/index" options={{ headerShown: false }} />
        <Stack.Screen name="community/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="auth/callback" options={{ title: cn ? '登录' : 'Sign in' }} />
      </Stack>;
}
