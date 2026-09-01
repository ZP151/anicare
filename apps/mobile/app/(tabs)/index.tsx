import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import * as Crypto from 'expo-crypto';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { listPublicSightings, type NarrowRpcClient, type PublicSighting } from '../../src/api/feed';
import { getSupabaseClient } from '../../src/api/supabase';
import { readSessionSubjectStrict } from '../../src/auth/session-subject';
import { AnchoredCatSheet, type SelectedCatSummary } from '../../src/components/AnchoredCatSheet';
import { GlassSurface } from '../../src/design/GlassSurface';
import { colors, radii } from '../../src/design/theme';
import { NearbyMap } from '../../src/maps/NearbyMap';
import { toPublicMapPresentation } from '../../src/maps/public-map-policy';
import { tabVisualContract } from '../../src/navigation/tab-style';
import { saveOfflineDraft } from '../../src/offline/draft-store';
import { createOwnerAwareReportDraft } from '../../src/report/report-draft-factory';
import { getReportCopy } from '../../src/report/report-copy';
import { useLocale } from '../../src/i18n/LocaleContext';

type FeedStatus = 'demo' | 'loading' | 'live' | 'unavailable';

const previewCat: SelectedCatSummary = {
  animalId: 'demo-cat',
  displayAlias: 'Mochi · 麻糬',
  primaryAlias: 'Mochi',
  verificationLabel: 'Community confirmed',
  timeLabel: 'Seen this afternoon',
};

const opaqueAnimalId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function pickPublicCat(sightings: readonly PublicSighting[]): SelectedCatSummary | null {
  const selected = sightings.find((item) => item.verification === 'partner_confirmed')
    ?? sightings.find((item) => item.verification === 'community_confirmed')
    ?? sightings[0];
  if (!selected) return null;
  const safe = toPublicMapPresentation(selected);
  return {
    animalId: safe.animalId,
    primaryAlias: safe.alias,
    verificationLabel: safe.verificationLabel,
    timeLabel: safe.timeLabel,
  };
}

export default function NearbyScreen() {
  const { locale, t } = useLocale();
  const router = useRouter();
  const client = getSupabaseClient() as unknown as NarrowRpcClient | null;
  const [status, setStatus] = useState<FeedStatus>(client ? 'loading' : 'demo');
  const [sightings, setSightings] = useState<readonly PublicSighting[]>([]);
  const [privacyExpanded, setPrivacyExpanded] = useState(false);

  useEffect(() => {
    if (!client) {
      setStatus('demo');
      setSightings([]);
      return;
    }
    let active = true;
    setStatus('loading');
    void listPublicSightings({ limit: 20 }, client)
      .then((page) => {
        if (!active) return;
        setSightings(page.items);
        setStatus('live');
      })
      .catch(() => {
        if (!active) return;
        setSightings([]);
        setStatus('unavailable');
      });
    return () => { active = false; };
  }, [client]);

  const selectedCat = useMemo(
    () => status === 'demo' ? previewCat : pickPublicCat(sightings),
    [sightings, status],
  );

  async function startLinkedReport() {
    if (!selectedCat) return;
    try {
      const draftId = await createOwnerAwareReportDraft({
        readAuthSnapshot: async () => ({ ownerSubject: await readSessionSubjectStrict() }),
        saveDraft: saveOfflineDraft,
        createId: Crypto.randomUUID,
        now: () => new Date(),
      });
      const params = opaqueAnimalId.test(selectedCat.animalId) ? { draftId, animalId: selectedCat.animalId } : { draftId };
      router.push({ pathname: '/report/new', params } as never);
    } catch {
      const reportCopy = getReportCopy(locale);
      Alert.alert(reportCopy.storageUnavailableTitle, reportCopy.startFailed);
    }
  }

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <Image
        accessibilityIgnoresInvertColors
        resizeMode="cover"
        source={require('../../assets/plates/paper-ground.png')}
        style={styles.paperGround}
      />
      <View style={styles.mapStage}>
        <View style={styles.mapFrame}>
          <NearbyMap fallbackLabel={t('map.mapUnavailable')} />
        </View>

        <View style={styles.topBar}>
          <Text style={styles.title}>Nearby</Text>
          <Pressable
            accessibilityLabel="How locations are protected"
            accessibilityRole="button"
            accessibilityState={{ expanded: privacyExpanded }}
            hitSlop={8}
            onPress={() => setPrivacyExpanded((expanded) => !expanded)}
            style={({ pressed }) => [styles.privacyButton, pressed && styles.pressed]}
          >
            <View style={styles.privacyButtonVisual}>
              <MaterialCommunityIcons color={colors.mineral} name="shield-check-outline" size={19} />
            </View>
          </Pressable>
        </View>

        <GlassSurface style={styles.privacyNotice}>
          <MaterialCommunityIcons color={colors.aquaDeep} name="shield-outline" size={19} />
          <View style={styles.noticeCopy}>
            <Text style={styles.noticeTitle}>Coarse neighbourhood view.</Text>
            <Text style={styles.noticeText}>
              {privacyExpanded
                ? 'No user location is requested. Cat locations, routes and timestamps remain hidden.'
                : 'Exact locations are protected.'}
            </Text>
          </View>
        </GlassSurface>

        {status === 'loading' ? <StatusBadge text="Loading delayed community activity…" /> : null}
        {status === 'unavailable' ? <StatusBadge danger text="Community feed unavailable · map remains privacy-safe" /> : null}
        {status === 'live' && !selectedCat ? <StatusBadge text="No delayed community sightings yet" /> : null}
      </View>

      {selectedCat ? (
        <AnchoredCatSheet
          cat={selectedCat}
          fixture={status === 'demo'}
          onReportSighting={() => { void startLinkedReport(); }}
          onViewCat={() => router.push(`/cat/${selectedCat.animalId}` as never)}
        />
      ) : (
        <View style={styles.emptySheet}>
          <View style={styles.emptyHandle} />
          <Text style={styles.emptyTitle}>Community cats will appear here</Text>
          <Text style={styles.emptyCopy}>Try again later or add a privacy-safe sighting report.</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

function StatusBadge({ danger = false, text }: Readonly<{ danger?: boolean; text: string }>) {
  return (
    <View style={[styles.statusBadge, danger && styles.statusBadgeDanger]}>
      <Text style={[styles.statusText, danger && styles.statusTextDanger]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingBottom: tabVisualContract.barHeight, backgroundColor: colors.paper },
  paperGround: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, width: '100%', height: '100%', opacity: 0.22 },
  mapStage: { flex: 1, minHeight: 330, overflow: 'hidden', backgroundColor: colors.paper },
  mapFrame: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, overflow: 'hidden' },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 68,
    paddingLeft: 22,
    paddingRight: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(250,248,242,0.92)',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(18,59,70,0.16)',
    pointerEvents: 'box-none',
  },
  title: { color: colors.actionPrimary, fontSize: 18, lineHeight: 22, fontWeight: '700', letterSpacing: -0.3 },
  privacyButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  privacyButtonVisual: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(18,59,70,0.32)',
    backgroundColor: 'rgba(255,255,255,0.62)',
  },
  privacyNotice: {
    position: 'absolute',
    left: 18,
    right: 18,
    bottom: 18,
    minHeight: 64,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: radii.medium,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(56,108,104,0.25)',
    backgroundColor: 'rgba(220,235,230,0.9)',
  },
  noticeCopy: { flex: 1 },
  noticeTitle: { color: colors.actionPrimary, fontSize: 13, fontWeight: '700' },
  noticeText: { color: colors.mineral, fontSize: 13, lineHeight: 18, marginTop: 1 },
  statusBadge: {
    position: 'absolute',
    top: 82,
    left: 18,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.small,
    backgroundColor: 'rgba(241,235,221,0.95)',
  },
  statusBadgeDanger: { backgroundColor: 'rgba(255,244,239,0.96)' },
  statusText: { color: colors.mineral, fontSize: 12, fontWeight: '700' },
  statusTextDanger: { color: colors.danger },
  emptySheet: {
    minHeight: 258,
    padding: 24,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: colors.surface,
    alignItems: 'center',
  },
  emptyHandle: { width: 38, height: 4, borderRadius: 2, backgroundColor: colors.line, marginBottom: 48 },
  emptyTitle: { color: colors.mineral, fontSize: 19, fontWeight: '800', textAlign: 'center' },
  emptyCopy: { color: colors.muted, fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 8 },
  pressed: { opacity: 0.7 },
});
