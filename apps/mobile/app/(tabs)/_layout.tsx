import { Tabs } from 'expo-router';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Platform, StyleSheet } from 'react-native';

import { GlassSurface } from '../../src/design/GlassSurface';
import { colors } from '../../src/design/theme';
import { getTabDefinitions, TabRoute } from '../../src/i18n/catalog';
import { useLocale } from '../../src/i18n/LocaleContext';
import { getTabIconName } from '../../src/navigation/tab-icons';
import { tabVisualContract } from '../../src/navigation/tab-style';

export default function TabLayout() {
  const { locale } = useLocale();
  const tabs = getTabDefinitions(locale);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.actionPrimary,
        tabBarInactiveTintColor: colors.mineral,
        tabBarLabelStyle: styles.tabLabel,
        tabBarStyle: styles.tabBar,
        tabBarBackground: () => <GlassSurface style={[StyleSheet.absoluteFill, styles.tabBarBackground]} />,
      }}
    >
      {tabs.map((tab) => (
        <Tabs.Screen
          key={tab.route}
          name={tab.route}
          options={{
            title: tab.label,
            tabBarAccessibilityLabel: tab.accessibilityLabel,
            tabBarIcon: ({ color, focused, size }) => (
              <MaterialCommunityIcons
                color={color}
                name={getTabIconName(tab.route, focused)}
                size={Math.max(size, tabVisualContract.iconSize)}
              />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    position: 'absolute',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(18,59,70,0.16)',
    elevation: 0,
    backgroundColor: 'transparent',
    height: tabVisualContract.barHeight,
    paddingTop: tabVisualContract.topPadding,
    paddingBottom: tabVisualContract.bottomPadding,
  },
  tabBarBackground: { backgroundColor: 'rgba(237,237,228,0.94)' },
  tabLabel: {
    fontSize: Platform.select({ ios: 11, android: 12, default: tabVisualContract.labelFontSize }),
    lineHeight: Platform.select({ ios: 14, android: 15, default: tabVisualContract.labelLineHeight }),
    fontWeight: '500',
  },
});
