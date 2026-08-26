import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { AuthLinkHandler } from '../src/components/AuthLinkHandler';
import { LocaleProvider } from '../src/i18n/LocaleContext';
import { recoverPendingMediaDrafts } from '../src/media/media-recovery';

export default function RootLayout() {
  useEffect(() => {
    void recoverPendingMediaDrafts().catch(() => undefined);
  }, []);

  return (
    <LocaleProvider>
      <AuthLinkHandler />
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="report/redaction-review" options={{ presentation: 'modal' }} />
      </Stack>
    </LocaleProvider>
  );
}
