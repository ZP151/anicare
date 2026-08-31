import { ImageBackground, Platform, StyleSheet, Text } from 'react-native';

import { colors } from '../design/theme';
import type { NearbyMapProps } from './NearbyMap.types';

export function NearbyMap(_props: NearbyMapProps) {
  return (
    <ImageBackground
      accessibilityLabel="Privacy-safe neighbourhood atlas. Google Maps unavailable; showing privacy-safe atlas fallback."
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
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  frame: { flex: 1, backgroundColor: colors.paper },
  image: { opacity: 0.78, resizeMode: 'contain' },
  atlasLabel: {
    position: 'absolute',
    color: '#555858',
    fontSize: Platform.select({ ios: 11, android: 12, default: 10 }),
    lineHeight: Platform.select({ ios: 14, android: 15, default: 13 }),
    fontWeight: '500',
  },
  northLabel: { left: '48%', top: '12.8%', fontSize: Platform.select({ ios: 13, android: 14, default: 13 }), lineHeight: Platform.select({ ios: 16, android: 17, default: 16 }) },
  westLabel: { left: '10%', top: '49.7%', fontSize: Platform.select({ ios: 17, android: 18, default: 17 }), lineHeight: Platform.select({ ios: 21, android: 22, default: 21 }) },
  eastLabel: { left: '70%', top: '43.9%', fontSize: Platform.select({ ios: 13, android: 14, default: 13 }), lineHeight: Platform.select({ ios: 16, android: 17, default: 16 }) },
  greenLabel: {
    left: '36%',
    top: '54.1%',
    width: 75,
    color: '#56724D',
    fontSize: Platform.select({ ios: 10, android: 11, default: 10 }),
    lineHeight: Platform.select({ ios: 13, android: 14, default: 13 }),
    textAlign: 'center',
  },
  edgeLabel: {
    left: '7%',
    top: '72.3%',
    color: colors.aquaDeep,
    fontSize: Platform.select({ ios: 11, android: 12, default: 11 }),
    lineHeight: Platform.select({ ios: 14, android: 15, default: 14 }),
  },
});
