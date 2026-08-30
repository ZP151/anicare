import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import type { PublicAreaSummary } from '../maps/public-map-policy';
import { colors, radii } from '../design/theme';
import { getCommunityMapCopy, type Locale } from '../i18n/catalog';

type CoarseAreaDetailSheetProps = Readonly<{
  area: PublicAreaSummary;
  locale: Locale;
  onViewCat: (animalId: string) => void;
  onReportFromArea: () => void;
}>;

export function getAreaActionMinHeight(platform: string): number {
  return platform === 'android' ? 48 : 44;
}

export function CoarseAreaDetailSheet({ area, locale, onReportFromArea, onViewCat }: CoarseAreaDetailSheetProps) {
  const copy = getCommunityMapCopy(locale);
  const visibleCats = area.cats.slice(0, 3);
  const catsCopy = copy.visibleCatsLabel(area.catCount);
  const confirmedCopy = copy.confirmedCatsLabel(area.confirmedCount);
  const reportLabel = copy.reportFromAreaLabel(area.label);

  return (
    <View accessibilityLabel={copy.areaDetailLabel(area.label)} style={styles.sheet}>
      <View style={styles.handle} />
      <View style={styles.header}>
        <View style={styles.titleBlock}>
          <Text style={styles.title}>{area.label}</Text>
          <Text style={styles.activity}>{area.activityLabel}</Text>
        </View>
        <MaterialCommunityIcons color={colors.community} name="map-marker-radius-outline" size={26} />
      </View>

      <View accessibilityLabel={copy.aggregateAccessibilityLabel(area.catCount, area.confirmedCount)} style={styles.aggregateRow}>
        <View style={styles.aggregateItem}>
          <MaterialCommunityIcons color={colors.actionPrimary} name="cat" size={20} />
          <Text style={styles.aggregateText}>{catsCopy}</Text>
        </View>
        <View style={styles.aggregateItem}>
          <MaterialCommunityIcons color={colors.community} name="account-check-outline" size={20} />
          <Text style={styles.aggregateText}>{confirmedCopy}</Text>
        </View>
      </View>

      <View style={styles.catList}>
        {visibleCats.map((cat) => (
          <View key={cat.animalId} style={styles.catRow}>
            <View style={styles.catIdentity}>
              <Text numberOfLines={1} style={styles.alias}>{cat.alias}</Text>
              <Text numberOfLines={1} style={styles.catMeta}>{cat.verificationLabel}</Text>
              <Text numberOfLines={1} style={styles.catTime}>{cat.timeLabel}</Text>
            </View>
            <Pressable
              accessibilityLabel={copy.viewCatLabel(cat.alias)}
              accessibilityRole="button"
              onPress={() => onViewCat(cat.animalId)}
              style={({ pressed }) => [styles.viewButton, pressed && styles.pressed]}
            >
              <Text style={styles.viewButtonText}>{copy.viewAction}</Text>
              <MaterialCommunityIcons color={colors.actionPrimary} name="chevron-right" size={22} />
            </Pressable>
          </View>
        ))}
      </View>

      <View style={styles.actions}>
        <Pressable
          accessibilityLabel={reportLabel}
          accessibilityRole="button"
          onPress={() => onReportFromArea()}
          style={({ pressed }) => [styles.reportButton, pressed && styles.pressed]}
        >
          <MaterialCommunityIcons color={colors.actionSecondary} name="camera-outline" size={20} />
          <Text style={styles.reportButtonText}>{reportLabel}</Text>
        </Pressable>
        <View style={styles.followRow}>
          <Pressable
            accessibilityLabel={copy.followAction}
            accessibilityRole="button"
            accessibilityState={{ disabled: true }}
            disabled
            style={styles.followButton}
          >
            <MaterialCommunityIcons color={colors.muted} name="bell-outline" size={20} />
            <Text style={styles.followButtonText}>{copy.followAction}</Text>
          </Pressable>
          <Text style={styles.followReason}>{copy.followDisabledReason}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    paddingTop: 10,
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderTopLeftRadius: radii.large,
    borderTopRightRadius: radii.large,
    backgroundColor: colors.surface,
    boxShadow: '0px -8px 24px rgba(18,59,70,0.10)',
    elevation: 16,
  },
  handle: { width: 38, height: 4, borderRadius: 2, backgroundColor: colors.line, alignSelf: 'center', marginBottom: 14 },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  titleBlock: { flex: 1 },
  title: { color: colors.mineral, fontSize: 22, lineHeight: 27, fontWeight: '800' },
  activity: { marginTop: 4, color: colors.muted, fontSize: 14, lineHeight: 19 },
  aggregateRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 16, paddingVertical: 12, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.line },
  aggregateItem: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  aggregateText: { color: colors.ink, fontSize: 14, lineHeight: 18, fontWeight: '700' },
  catList: { marginTop: 2 },
  catRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: colors.line },
  catIdentity: { flex: 1, minWidth: 0 },
  alias: { color: colors.ink, fontSize: 16, lineHeight: 20, fontWeight: '700' },
  catMeta: { marginTop: 2, color: colors.muted, fontSize: 12, lineHeight: 16 },
  catTime: { marginTop: 1, color: colors.muted, fontSize: 11, lineHeight: 15 },
  viewButton: { minHeight: getAreaActionMinHeight(Platform.OS), minWidth: 74, paddingHorizontal: 10, borderRadius: radii.small, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2, backgroundColor: colors.leafSoft },
  viewButtonText: { color: colors.actionPrimary, fontSize: 14, lineHeight: 18, fontWeight: '800' },
  actions: { marginTop: 14, gap: 10 },
  reportButton: { minHeight: getAreaActionMinHeight(Platform.OS), paddingHorizontal: 14, borderRadius: radii.small, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.paper },
  reportButtonText: { flex: 1, color: colors.actionSecondary, fontSize: 15, lineHeight: 20, fontWeight: '800' },
  followRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  followButton: { minHeight: getAreaActionMinHeight(Platform.OS), minWidth: 126, paddingHorizontal: 12, borderRadius: radii.small, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: colors.line },
  followButtonText: { color: colors.muted, fontSize: 14, lineHeight: 18, fontWeight: '700' },
  followReason: { flex: 1, color: colors.muted, fontSize: 11, lineHeight: 15 },
  pressed: { opacity: 0.82 },
});
