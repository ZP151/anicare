import { Tabs } from 'expo-router';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Platform, StyleSheet } from 'react-native';

import { GlassSurface } from '../../src/design/GlassSurface';
import { useNativeColors } from '../../src/design/native-colors';
import { getTabDefinitions, TabRoute } from '../../src/i18n/catalog';
import { useLocale } from '../../src/i18n/LocaleContext';
import { getTabIconName } from '../../src/navigation/tab-icons';
import { tabVisualContract } from '../../src/navigation/tab-style';

const nativeIcons = {
  index: { default: 'location', selected: 'location.fill' },
  map: { default: 'map', selected: 'map.fill' },
  report: { default: 'square.and.pencil', selected: 'square.and.pencil' },
  following: { default: 'heart', selected: 'heart.fill' },
  profile: { default: 'person.crop.circle', selected: 'person.crop.circle.fill' },
} as const;

export default function TabLayout() {
  const { locale } = useLocale();
  const colors = useNativeColors();
  const tabs = getTabDefinitions(locale);

  if (Platform.OS === 'ios') {
    return <NativeTabs tintColor={colors.actionPrimary} minimizeBehavior="never">
      {tabs.map(tab => <NativeTabs.Trigger key={tab.route} name={tab.route}
        accessibilityLabel={tab.accessibilityLabel}>
        <NativeTabs.Trigger.Icon sf={nativeIcons[tab.route]} />
        <NativeTabs.Trigger.Label>{tab.label}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>)}
    </NativeTabs>;
  }

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
  tabBarBackground: { backgroundColor: 'transparent' },
  tabLabel: {
    fontSize: Platform.select({ ios: 11, android: 12, default: tabVisualContract.labelFontSize }),
    lineHeight: Platform.select({ ios: 14, android: 15, default: tabVisualContract.labelLineHeight }),
    fontWeight: '500',
  },
});
