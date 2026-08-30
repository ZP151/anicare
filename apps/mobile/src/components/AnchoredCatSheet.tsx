import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radii } from '../design/theme';

export type SelectedCatSummary = Readonly<{
  animalId: string;
  displayAlias?: string;
  primaryAlias: string;
  verificationLabel: string;
  timeLabel: string;
}>;

type AnchoredCatSheetProps = Readonly<{
  cat: SelectedCatSummary;
  fixture: boolean;
  onViewCat: () => void;
  onReportSighting: () => void;
}>;

const primaryHitSlop = Platform.OS === 'android' ? 2 : 0;
const secondaryHitSlop = Platform.OS === 'android' ? 3 : 1;

export function AnchoredCatSheet({ cat, fixture, onReportSighting, onViewCat }: AnchoredCatSheetProps) {
  return (
    <View accessibilityLabel={`Selected cat: ${cat.primaryAlias}`} style={styles.sheet}>
      <View style={styles.handle} />
      {fixture ? <Text style={styles.fixtureLabel}>Preview data</Text> : null}
      <View style={styles.content}>
        <View style={styles.portraitFrame}>
          {fixture ? (
            <Image
              accessibilityLabel="Preview portrait of an orange community cat"
              resizeMode="cover"
              source={require('../../assets/plates/cat-portrait.png')}
              style={styles.portrait}
            />
          ) : (
            <View accessibilityLabel="Public portrait unavailable" style={styles.portraitPlaceholder}>
              <MaterialCommunityIcons color={colors.aquaDeep} name="cat" size={42} />
              <Text style={styles.portraitPlaceholderText}>Portrait protected</Text>
            </View>
          )}
        </View>

        <View style={styles.summary}>
          <View style={styles.titleRow}>
            <Text numberOfLines={1} style={styles.name}>{cat.displayAlias ?? cat.primaryAlias}</Text>
          </View>
          <View style={[styles.metaRow, styles.confirmationRow]}>
            <MaterialCommunityIcons color={colors.actionPrimary} name="shield-check-outline" size={19} />
            <Text numberOfLines={2} style={styles.verification}>{cat.verificationLabel}</Text>
          </View>
          <View style={[styles.metaRow, styles.timeRow]}>
            <MaterialCommunityIcons color={colors.mineral} name="clock-outline" size={18} />
            <Text numberOfLines={2} style={styles.time}>{cat.timeLabel}</Text>
          </View>

          <Pressable
            accessibilityLabel={`View ${cat.primaryAlias}`}
            accessibilityRole="button"
            hitSlop={primaryHitSlop}
            onPress={onViewCat}
            style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
          >
            <Text style={styles.primaryButtonText}>View cat</Text>
            <MaterialCommunityIcons color={colors.surface} name="chevron-right" size={27} />
          </Pressable>
          <Pressable
            accessibilityLabel={`Report a sighting of ${cat.primaryAlias}`}
            accessibilityRole="button"
            hitSlop={secondaryHitSlop}
            onPress={onReportSighting}
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
          >
            <MaterialCommunityIcons color={colors.actionSecondary} name="camera-outline" size={20} />
            <Text style={styles.secondaryButtonText}>Report sighting</Text>
            <MaterialCommunityIcons color={colors.actionSecondary} name="chevron-right" size={25} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'relative',
    minHeight: 258,
    paddingTop: 10,
    paddingHorizontal: 23,
    paddingBottom: 14,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: colors.surface,
    boxShadow: '0px -8px 24px rgba(18,59,70,0.10)',
    elevation: 16,
  },
  handle: { width: 38, height: 4, borderRadius: 2, backgroundColor: colors.line, alignSelf: 'center' },
  content: { flex: 1, flexDirection: 'row', gap: 18, paddingTop: 14 },
  portraitFrame: { width: 135, height: 199, alignSelf: 'flex-start', overflow: 'hidden', borderRadius: radii.medium, backgroundColor: colors.aquaSoft },
  portrait: { position: 'absolute', left: '-9%', top: '-12%', width: '118%', height: '118%' },
  portraitPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 12 },
  portraitPlaceholderText: { color: colors.aquaDeep, textAlign: 'center', fontSize: 12, fontWeight: '700' },
  summary: { flex: 1, minWidth: 0 },
  titleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  name: { flex: 1, color: colors.mineral, fontSize: 24, lineHeight: 29, fontWeight: '700', letterSpacing: -0.4 },
  fixtureLabel: { position: 'absolute', top: 12, right: 20, color: colors.muted, fontSize: 9, lineHeight: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  confirmationRow: { marginBottom: 8 },
  timeRow: { marginBottom: 18 },
  verification: { flex: 1, color: colors.actionPrimary, fontSize: 14, lineHeight: 19, fontWeight: '700' },
  time: { flex: 1, color: colors.mineral, fontSize: 14, lineHeight: 18 },
  primaryButton: {
    minHeight: 44,
    marginBottom: 13,
    paddingHorizontal: 16,
    borderRadius: radii.small,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.actionPrimary,
  },
  primaryButtonText: { color: colors.surface, fontSize: 17, lineHeight: 21, fontWeight: '800' },
  secondaryButton: {
    minHeight: 42,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 0.75,
    borderColor: 'rgba(226,79,17,0.72)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 4,
    backgroundColor: 'rgba(241,235,221,0.2)',
  },
  secondaryButtonText: { flex: 1, color: colors.actionSecondary, fontSize: 14, lineHeight: 18, fontWeight: '500' },
  pressed: { opacity: 0.82 },
});
