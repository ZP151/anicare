import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radii } from '../design/theme';

export type SelectedCatSummary = Readonly<{
  animalId: string;
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

export function AnchoredCatSheet({ cat, fixture, onReportSighting, onViewCat }: AnchoredCatSheetProps) {
  return (
    <View accessibilityLabel={`Selected cat: ${cat.primaryAlias}`} style={styles.sheet}>
      <View style={styles.handle} />
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
            <Text numberOfLines={1} style={styles.name}>{cat.primaryAlias}</Text>
            {fixture ? <Text style={styles.fixtureLabel}>Preview data</Text> : null}
          </View>
          <View style={styles.metaRow}>
            <MaterialCommunityIcons color={colors.community} name="check-decagram-outline" size={17} />
            <Text numberOfLines={2} style={styles.verification}>{cat.verificationLabel}</Text>
          </View>
          <View style={styles.metaRow}>
            <MaterialCommunityIcons color={colors.muted} name="clock-outline" size={16} />
            <Text numberOfLines={2} style={styles.time}>{cat.timeLabel}</Text>
          </View>

          <Pressable
            accessibilityLabel={`View ${cat.primaryAlias}`}
            accessibilityRole="button"
            onPress={onViewCat}
            style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
          >
            <Text style={styles.primaryButtonText}>View cat</Text>
            <MaterialCommunityIcons color={colors.surface} name="arrow-right" size={19} />
          </Pressable>
          <Pressable
            accessibilityLabel={`Report a sighting of ${cat.primaryAlias}`}
            accessibilityRole="button"
            onPress={onReportSighting}
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
          >
            <MaterialCommunityIcons color={colors.vermilion} name="camera-plus-outline" size={18} />
            <Text style={styles.secondaryButtonText}>Report sighting</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    minHeight: 258,
    paddingTop: 10,
    paddingHorizontal: 20,
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
  summary: { flex: 1, minWidth: 0, gap: 8 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { flex: 1, color: colors.mineral, fontSize: 25, lineHeight: 30, fontWeight: '800' },
  fixtureLabel: { color: colors.muted, fontSize: 9, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  verification: { flex: 1, color: '#145C54', fontSize: 13, lineHeight: 17, fontWeight: '700' },
  time: { flex: 1, color: '#465A52', fontSize: 13, lineHeight: 17 },
  primaryButton: {
    minHeight: 44,
    marginTop: 'auto',
    paddingHorizontal: 14,
    borderRadius: radii.small,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.community,
  },
  primaryButtonText: { color: colors.surface, fontSize: 14, fontWeight: '800' },
  secondaryButton: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: radii.small,
    borderWidth: 1.5,
    borderColor: colors.vermilion,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  secondaryButtonText: { color: colors.vermilion, fontSize: 14, fontWeight: '800' },
  pressed: { opacity: 0.74 },
});
