import { StyleSheet, Text, View } from 'react-native';

import { ScreenScaffold } from '../../src/components/ScreenScaffold';
import { colors, radii } from '../../src/design/theme';
import { useLocale } from '../../src/i18n/LocaleContext';

export default function FollowingScreen() {
  const { t } = useLocale();
  return (
    <ScreenScaffold title={t('following.title')} subtitle={t('following.subtitle')}>
      <View style={styles.empty}><Text style={styles.emoji}>♡</Text><Text style={styles.copy}>Follow a confirmed cat or community cell to receive privacy-safe updates.</Text></View>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  empty: { padding: 28, borderRadius: radii.large, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, alignItems: 'center', gap: 12 },
  emoji: { fontSize: 42, color: colors.leaf },
  copy: { color: colors.muted, textAlign: 'center', lineHeight: 21 },
});

