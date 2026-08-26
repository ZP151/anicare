import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { AuthLinkHandler } from '../src/components/AuthLinkHandler';
import { LocaleProvider } from '../src/i18n/LocaleContext';

export default function RootLayout() {
  return (
    <LocaleProvider>
      <AuthLinkHandler />
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }} />
    </LocaleProvider>
  );
}
