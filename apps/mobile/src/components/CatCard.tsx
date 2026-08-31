import { StyleSheet, Text, View } from 'react-native';

import { GlassSurface } from '../design/GlassSurface';
import { colors, radii } from '../design/theme';

export function CatCard() {
  return (
    <GlassSurface style={styles.card}>
      <View style={styles.photoPlaceholder} accessibilityLabel="Cat photo placeholder">
        <Text style={styles.catEmoji}>🐈</Text>
      </View>
      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text style={styles.name}>Mochi · 麻糬</Text>
          <Text style={styles.badge}>Community confirmed</Text>
        </View>
        <Text style={styles.meta}>Tortoiseshell · ear-tipped · seen this afternoon</Text>
        <Text style={styles.location}>Approx. community cell · exact location protected</Text>
      </View>
    </GlassSurface>
  );
}

const styles = StyleSheet.create({
  card: {
    overflow: 'hidden',
    borderRadius: radii.large,
    borderWidth: 1,
    borderColor: colors.line,
  },
  photoPlaceholder: {
    height: 210,
    backgroundColor: colors.leafSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  catEmoji: { fontSize: 82 },
  body: { padding: 18, gap: 10 },
  titleRow: { gap: 8 },
  name: { color: colors.ink, fontSize: 22, fontWeight: '800' },
  badge: { color: colors.leaf, fontSize: 12, fontWeight: '700' },
  meta: { color: colors.ink, fontSize: 15 },
  location: { color: colors.muted, fontSize: 13, lineHeight: 19 },
});

