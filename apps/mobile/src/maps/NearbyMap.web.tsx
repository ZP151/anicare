import { ImageBackground, StyleSheet, Text, View } from 'react-native';

import { colors, radii } from '../design/theme';
import type { NearbyMapProps } from './NearbyMap.types';

export function NearbyMap(_props: NearbyMapProps) {
  return (
    <ImageBackground
      accessibilityLabel="Privacy-safe neighbourhood atlas"
      imageStyle={styles.image}
      resizeMode="contain"
      source={require('../../assets/plates/coarse-atlas.png')}
      style={styles.frame}
    >
      <Text style={[styles.atlasLabel, styles.northLabel]}>North cluster</Text>
      <Text style={[styles.atlasLabel, styles.westLabel]}>West court</Text>
      <Text style={[styles.atlasLabel, styles.eastLabel]}>East court</Text>
      <Text style={[styles.atlasLabel, styles.greenLabel]}>Community green</Text>
      <Text style={[styles.atlasLabel, styles.edgeLabel]}>Public edge</Text>
      <View style={styles.fallbackBadge}>
        <Text style={styles.fallbackTitle}>Google Maps unavailable</Text>
        <Text style={styles.fallbackCopy}>Privacy-safe atlas fallback</Text>
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  frame: { flex: 1, backgroundColor: colors.paper },
  image: { opacity: 0.78 },
  atlasLabel: {
    position: 'absolute',
    color: '#465451',
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '700',
  },
  northLabel: { left: '48%', top: '28%' },
  westLabel: { left: '10%', top: '54%' },
  eastLabel: { left: '70%', top: '49%' },
  greenLabel: { left: '36%', top: '58%' },
  edgeLabel: { left: '7%', top: '75%' },
  fallbackBadge: {
    position: 'absolute',
    right: 18,
    top: 86,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: radii.small,
    backgroundColor: 'rgba(241,235,221,0.94)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.mineral,
  },
  fallbackTitle: { color: colors.mineral, fontSize: 12, fontWeight: '800' },
  fallbackCopy: { color: colors.muted, fontSize: 11, marginTop: 2 },
});
