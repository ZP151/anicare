import { Link } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { colors, radii } from '../../src/design/theme';

export default function AuthCallbackScreen() {
  return (
    <View style={styles.screen}>
      <View style={styles.card}>
        <Text accessibilityRole="header" style={styles.title}>Sign-in link received</Text>
        <Text style={styles.copy}>AnimalHelper is completing the secure session. You can return to your profile.</Text>
        <Link href="/profile" style={styles.link}>Return to profile</Link>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.canvas },
  card: { width: '100%', maxWidth: 460, padding: 24, gap: 14, borderRadius: radii.large, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  title: { color: colors.ink, fontSize: 24, fontWeight: '800' },
  copy: { color: colors.muted, lineHeight: 21 },
  link: { color: colors.leaf, fontWeight: '800' },
});

