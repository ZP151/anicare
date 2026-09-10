import { Tabs } from 'expo-router';
import { StyleSheet } from 'react-native';

import { GlassSurface } from '../../src/design/GlassSurface';
import { useNativeColors } from '../../src/design/native-colors';
import { CustomTabBar } from '../../src/navigation/CustomTabBar';
import { tabVisualContract } from '../../src/navigation/tab-style';

export default function TabLayout() {
  const colors = useNativeColors();
  return (
    <Tabs
      tabBar={props=><CustomTabBar {...props}/>}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.actionPrimary,
        tabBarInactiveTintColor: colors.mineral,
        tabBarLabelStyle: styles.tabLabel,
        tabBarStyle: styles.tabBar,
        tabBarBackground: () => <GlassSurface style={[StyleSheet.absoluteFill, styles.tabBarBackground]} />,
      }}
    >
      <Tabs.Screen name="index" options={{title:'Home'}}/><Tabs.Screen name="map" options={{title:'Map'}}/><Tabs.Screen name="discuss" options={{title:'Messages'}}/><Tabs.Screen name="profile" options={{title:'Me'}}/>
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
    fontSize: tabVisualContract.labelFontSize,
    lineHeight: tabVisualContract.labelLineHeight,
    fontWeight: '500',
  },
});
