import { StyleSheet, Text } from 'react-native';

import { CatCard } from '../../src/components/CatCard';
import { ScreenScaffold } from '../../src/components/ScreenScaffold';
import { GlassSurface } from '../../src/design/GlassSurface';
import { colors, radii } from '../../src/design/theme';
import { useLocale } from '../../src/i18n/LocaleContext';

export default function NearbyScreen() {
  const { t } = useLocale();
  return (
    <ScreenScaffold eyebrow={t('common.beta')} title={t('nearby.title')} subtitle={t('nearby.subtitle')}>
      <GlassSurface style={styles.notice}>
        <Text style={styles.noticeText}>◷ {t('nearby.privacyNote')}</Text>
      </GlassSurface>
      <CatCard />
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  notice: { padding: 14, borderRadius: radii.medium, backgroundColor: colors.leafSoft },
  noticeText: { color: colors.leaf, fontWeight: '600', lineHeight: 20 },
});

