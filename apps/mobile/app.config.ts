import type { ConfigContext, ExpoConfig } from 'expo/config';

import appJson from './app.json';

export function getGoogleMapsBuildConfig(env: Readonly<{
  GOOGLE_MAPS_IOS_API_KEY?: string;
  GOOGLE_MAPS_ANDROID_API_KEY?: string;
}>): Readonly<{
  configured: boolean;
  plugin: 'react-native-maps' | readonly [
    'react-native-maps',
    Readonly<{ iosGoogleMapsApiKey: string; androidGoogleMapsApiKey: string }>,
  ];
}> {
  const iosGoogleMapsApiKey = env.GOOGLE_MAPS_IOS_API_KEY?.trim();
  const androidGoogleMapsApiKey = env.GOOGLE_MAPS_ANDROID_API_KEY?.trim();
  if (!iosGoogleMapsApiKey || !androidGoogleMapsApiKey) {
    return { configured: false, plugin: 'react-native-maps' };
  }
  return {
    configured: true,
    plugin: ['react-native-maps', { iosGoogleMapsApiKey, androidGoogleMapsApiKey }],
  };
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const base = appJson.expo as ExpoConfig;
  const maps = getGoogleMapsBuildConfig({
    GOOGLE_MAPS_IOS_API_KEY: process.env.GOOGLE_MAPS_IOS_API_KEY,
    GOOGLE_MAPS_ANDROID_API_KEY: process.env.GOOGLE_MAPS_ANDROID_API_KEY,
  });
  const plugins = (base.plugins ?? []).filter((plugin) => {
    const name = Array.isArray(plugin) ? plugin[0] : plugin;
    return name !== 'react-native-maps';
  });

  return {
    ...config,
    ...base,
    plugins: [...plugins, maps.plugin as NonNullable<ExpoConfig['plugins']>[number]],
    extra: {
      ...base.extra,
      googleMapsConfigured: maps.configured,
    },
  };
};
