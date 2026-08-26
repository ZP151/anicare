import { StyleSheet, Text, View } from 'react-native';

import { ScreenScaffold } from '../../src/components/ScreenScaffold';
import { colors, radii } from '../../src/design/theme';
import { useLocale } from '../../src/i18n/LocaleContext';

export default function MapScreen() {
  const { t } = useLocale();
  return (
    <ScreenScaffold title={t('map.title')} subtitle={t('map.subtitle')}>
      <View style={styles.map} accessibilityLabel="Approximate community map preview">
        <View style={[styles.cell, styles.cellOne]}><Text style={styles.pin}>🐈</Text></View>
        <View style={[styles.cell, styles.cellTwo]}><Text style={styles.pin}>🐈</Text></View>
        <Text style={styles.legend}>H3 r9 · public cells only</Text>
      </View>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  map: { height: 480, borderRadius: radii.large, backgroundColor: '#DEE8DB', overflow: 'hidden' },
  cell: { position: 'absolute', width: 116, height: 104, borderWidth: 2, borderColor: colors.leaf, transform: [{ rotate: '30deg' }], alignItems: 'center', justifyContent: 'center' },
  cellOne: { top: 95, left: 42 },
  cellTwo: { top: 190, right: 35 },
  pin: { fontSize: 30, transform: [{ rotate: '-30deg' }] },
  legend: { position: 'absolute', left: 16, bottom: 16, color: colors.muted, fontWeight: '700' },
});

