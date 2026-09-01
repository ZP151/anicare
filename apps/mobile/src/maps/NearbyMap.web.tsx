import { StyleSheet, Text, View } from 'react-native';

import { colors } from '../design/theme';
import type { NearbyMapProps } from './NearbyMap.types';

const defaultFallbackLabel = 'Google Maps is unavailable. Switch to the area list to browse delayed community activity.';

export function NearbyMap({ fallbackLabel = defaultFallbackLabel }: NearbyMapProps) {
  return (
    <View accessibilityLabel={fallbackLabel} accessibilityRole="image" style={styles.frame}>
      <Text style={styles.copy}>{fallbackLabel}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20, backgroundColor: colors.paper },
  copy: { color: colors.mineral, fontSize: 15, lineHeight: 22, fontWeight: '700', textAlign: 'center' },
});
