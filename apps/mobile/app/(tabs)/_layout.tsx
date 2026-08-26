import { Tabs } from 'expo-router';
import { StyleSheet, Text } from 'react-native';

import { GlassSurface } from '../../src/design/GlassSurface';
import { colors } from '../../src/design/theme';
import { getTabDefinitions, TabRoute } from '../../src/i18n/catalog';
import { useLocale } from '../../src/i18n/LocaleContext';

const icons: Record<TabRoute, string> = {
  index: '⌂',
  map: '⌖',
  report: '＋',
  following: '♡',
  profile: '●',
};

export default function TabLayout() {
  const { locale } = useLocale();
  const tabs = getTabDefinitions(locale);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.leaf,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: styles.tabBar,
        tabBarBackground: () => <GlassSurface style={StyleSheet.absoluteFill} />,
      }}
    >
      {tabs.map((tab) => (
        <Tabs.Screen
          key={tab.route}
          name={tab.route}
          options={{
            title: tab.label,
            tabBarAccessibilityLabel: tab.accessibilityLabel,
            tabBarIcon: ({ color }) => <Text style={[styles.icon, { color }]}>{icons[tab.route]}</Text>,
          }}
        />
      ))}
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    position: 'absolute',
    borderTopWidth: 0,
    elevation: 0,
    backgroundColor: 'transparent',
    height: 78,
    paddingTop: 8,
    paddingBottom: 12,
  },
  icon: { fontSize: 21, fontWeight: '700' },
});

