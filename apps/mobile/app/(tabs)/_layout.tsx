import { Tabs } from 'expo-router';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { StyleSheet } from 'react-native';

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
        tabBarActiveTintColor: colors.leaf,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: styles.tabLabel,
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
    borderTopWidth: 0,
    elevation: 0,
    backgroundColor: 'transparent',
    height: tabVisualContract.barHeight,
    paddingTop: tabVisualContract.topPadding,
    paddingBottom: tabVisualContract.bottomPadding,
  },
  tabLabel: {
    fontSize: tabVisualContract.labelFontSize,
    lineHeight: tabVisualContract.labelLineHeight,
    fontWeight: '600',
  },
});
