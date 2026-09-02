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

function getCatDetailCopy(locale: Locale, alias: string) {
  if (locale === 'zh-CN') {
    return {
      preview: '预览数据',
      subtitle: '公开身份摘要仅显示经过延迟和模糊化处理的社区活动。',
      previewPortrait: '社区猫预览照片',
      portraitUnavailable: '公开照片不可用',
      portraitProtected: '照片受到保护',
      identityStatus: '身份状态',
      coarseActivity: '粗略社区活动',
      locationProtection: '这里绝不会显示精确位置、路线或时间戳。',
      reportLabel: `报告 ${alias} 的目击记录`,
      reportAction: '报告目击记录',
      governance: '身份信息变更前必须经过社区审核。',
    } as const;
  }
  return {
    preview: 'Preview data',
    subtitle: 'A public identity summary with delayed, coarse community activity.',
    previewPortrait: 'Preview portrait of an orange community cat',
    portraitUnavailable: 'Public portrait unavailable',
    portraitProtected: 'Portrait protected',
    identityStatus: 'Identity status',
    coarseActivity: 'Coarse neighbourhood activity',
    locationProtection: 'Exact locations, routes and timestamps are never shown here.',
    reportLabel: `Report a sighting of ${alias}`,
    reportAction: 'Report a sighting',
    governance: 'Community review is required before identity information changes.',
  } as const;
}

export function CatDetailScreen({ cat, fixture, locale = 'en', onReportSighting }: CatDetailScreenProps) {
  const reportCopy = getReportCopy(locale);
  const copy = getCatDetailCopy(locale, cat.primaryAlias);
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
      eyebrow={fixture ? copy.preview : undefined}
      subtitle={copy.subtitle}
      title={cat.primaryAlias}
    >
      <View style={styles.portraitFrame}>
        {fixture ? (
          <Image
            accessibilityLabel={copy.previewPortrait}
            resizeMode="cover"
            source={require('../../assets/plates/cat-portrait.png')}
            style={styles.portrait}
          />
        ) : (
          <View accessibilityLabel={copy.portraitUnavailable} style={styles.placeholder}>
            <MaterialCommunityIcons color={colors.aquaDeep} name="cat" size={58} />
            <Text style={styles.placeholderText}>{copy.portraitProtected}</Text>
          </View>
        )}
      </View>

      <View style={styles.identityPanel}>
        <View style={styles.row}>
          <MaterialCommunityIcons color={colors.community} name="check-decagram-outline" size={21} />
          <View style={styles.copy}>
            <Text style={styles.label}>{copy.identityStatus}</Text>
            <Text style={styles.value}>{cat.verificationLabel}</Text>
          </View>
        </View>
        <View style={styles.divider} />
        <View style={styles.row}>
          <MaterialCommunityIcons color={colors.aquaDeep} name="map-marker-radius-outline" size={21} />
          <View style={styles.copy}>
            <Text style={styles.label}>{copy.coarseActivity}</Text>
            <Text style={styles.value}>{cat.timeLabel}</Text>
            <Text style={styles.support}>{copy.locationProtection}</Text>
          </View>
        </View>
      </View>

      <Pressable
        accessibilityLabel={copy.reportLabel}
        accessibilityRole="button"
        disabled={startingReport}
        onPress={() => { void startReport(); }}
        style={({ pressed }) => [styles.reportButton, (pressed || startingReport) && styles.pressed]}
      >
        <MaterialCommunityIcons color={colors.surface} name="camera-plus-outline" size={20} />
        <Text style={styles.reportButtonText}>{copy.reportAction}</Text>
      </Pressable>
      {reportError ? <Text accessibilityLiveRegion="polite" style={styles.error}>{reportError}</Text> : null}
      <Text style={styles.governanceNote}>{copy.governance}</Text>
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
