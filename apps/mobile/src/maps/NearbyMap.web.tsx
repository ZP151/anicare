import { StyleSheet, Text, View } from 'react-native';

import { useNativeColors } from '../design/native-colors';
import type { NearbyMapProps } from './NearbyMap.types';

const defaultFallbackLabel = 'The map is unavailable. Switch to the area list to browse delayed community activity.';

export function NearbyMap({ fallbackLabel = defaultFallbackLabel }: NearbyMapProps) {
  const colors=useNativeColors();
  return (
    <View accessibilityLabel={fallbackLabel} accessibilityRole="image" style={[styles.frame,{backgroundColor:colors.canvas}]}>
      <Text style={[styles.copy,{color:colors.muted}]}>{fallbackLabel}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  copy: { fontSize: 15, lineHeight: 22, fontWeight: '700', textAlign: 'center' },
});
