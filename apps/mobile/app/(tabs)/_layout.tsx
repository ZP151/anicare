import { Tabs } from 'expo-router';
import { CustomTabBar } from '../../src/navigation/CustomTabBar';

// BottomAccessory occupies a separate row. The shared bar uses native GlassView
// on iOS 26 while keeping Create inside the same navigation row.
export default function TabLayout() {
  return <Tabs tabBar={props => <CustomTabBar {...props} />} screenOptions={{ headerShown: false }}>
    <Tabs.Screen name="index" options={{ title: 'Home' }} />
    <Tabs.Screen name="map" options={{ title: 'Map' }} />
    <Tabs.Screen name="discuss" options={{ title: 'Messages' }} />
    <Tabs.Screen name="profile" options={{ title: 'Me' }} />
  </Tabs>;
}
