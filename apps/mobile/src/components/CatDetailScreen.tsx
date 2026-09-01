import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radii } from '../design/theme';
import type { Locale } from '../i18n/catalog';
import { getReportCopy } from '../report/report-copy';
import { ScreenScaffold } from './ScreenScaffold';
import type { SelectedCatSummary } from './AnchoredCatSheet';

type CatDetailScreenProps = Readonly<{
  cat: SelectedCatSummary;
  fixture: boolean;
  locale?: Locale;
  onReportSighting: (animalId: string) => void | Promise<void>;
}>;

export function CatDetailScreen({ cat, fixture, locale = 'en', onReportSighting }: CatDetailScreenProps) {
  const reportCopy = getReportCopy(locale);
  const [startingReport, setStartingReport] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

  async function startReport() {
    setStartingReport(true);
    setReportError(null);
    try {
      await onReportSighting(cat.animalId);
    } catch {
      setReportError(reportCopy.startFailed);
    } finally {
      setStartingReport(false);
    }
  }

  return (
    <ScreenScaffold
      eyebrow={fixture ? 'Preview data' : undefined}
      subtitle="A public identity summary with delayed, coarse community activity."
      title={cat.primaryAlias}
    >
      <View style={styles.portraitFrame}>
        {fixture ? (
          <Image
            accessibilityLabel="Preview portrait of an orange community cat"
            resizeMode="cover"
            source={require('../../assets/plates/cat-portrait.png')}
            style={styles.portrait}
          />
        ) : (
          <View accessibilityLabel="Public portrait unavailable" style={styles.placeholder}>
            <MaterialCommunityIcons color={colors.aquaDeep} name="cat" size={58} />
            <Text style={styles.placeholderText}>Portrait protected</Text>
          </View>
        )}
      </View>

      <View style={styles.identityPanel}>
        <View style={styles.row}>
          <MaterialCommunityIcons color={colors.community} name="check-decagram-outline" size={21} />
          <View style={styles.copy}>
            <Text style={styles.label}>Identity status</Text>
            <Text style={styles.value}>{cat.verificationLabel}</Text>
          </View>
        </View>
        <View style={styles.divider} />
        <View style={styles.row}>
          <MaterialCommunityIcons color={colors.aquaDeep} name="map-marker-radius-outline" size={21} />
          <View style={styles.copy}>
            <Text style={styles.label}>Coarse neighbourhood activity</Text>
            <Text style={styles.value}>{cat.timeLabel}</Text>
            <Text style={styles.support}>Exact locations, routes and timestamps are never shown here.</Text>
          </View>
        </View>
      </View>

      <Pressable
        accessibilityLabel={`Report a sighting of ${cat.primaryAlias}`}
        accessibilityRole="button"
        disabled={startingReport}
        onPress={() => { void startReport(); }}
        style={({ pressed }) => [styles.reportButton, (pressed || startingReport) && styles.pressed]}
      >
        <MaterialCommunityIcons color={colors.surface} name="camera-plus-outline" size={20} />
        <Text style={styles.reportButtonText}>Report a sighting</Text>
      </Pressable>
      {reportError ? <Text accessibilityLiveRegion="polite" style={styles.error}>{reportError}</Text> : null}
      <Text style={styles.governanceNote}>Community review is required before identity information changes.</Text>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  portraitFrame: { height: 310, overflow: 'hidden', borderRadius: radii.large, backgroundColor: colors.aquaSoft },
  portrait: { width: '100%', height: '100%' },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  placeholderText: { color: colors.aquaDeep, fontSize: 14, fontWeight: '700' },
  identityPanel: { padding: 18, borderRadius: radii.medium, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, gap: 16 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  copy: { flex: 1, gap: 4 },
  label: { color: colors.muted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  value: { color: colors.mineral, fontSize: 17, lineHeight: 23, fontWeight: '800' },
  support: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 2 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.line },
  reportButton: { minHeight: 52, borderRadius: 26, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, backgroundColor: colors.community },
  reportButtonText: { color: colors.surface, fontSize: 16, fontWeight: '800' },
  governanceNote: { color: colors.muted, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  error: { color: colors.danger, fontSize: 13, lineHeight: 19, textAlign: 'center' },
  pressed: { opacity: 0.74 },
});
