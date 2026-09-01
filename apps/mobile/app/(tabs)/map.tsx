import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import * as Crypto from 'expo-crypto';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { listPublicSightings, type NarrowRpcClient } from '../../src/api/feed';
import { getSupabaseClient } from '../../src/api/supabase';
import { CoarseAreaDetailSheet } from '../../src/components/CoarseAreaDetailSheet';
import { saveOfflineDraft } from '../../src/offline/draft-store';
import { createReportDraftPayload } from '../../src/report/report-draft';
import { colors, radii } from '../../src/design/theme';
import { useLocale } from '../../src/i18n/LocaleContext';
import { getCommunityMapCopy } from '../../src/i18n/catalog';
import { NearbyMap } from '../../src/maps/NearbyMap';
import {
  buildPublicAreaSummaries,
  createDemoPublicAreaSummaries,
  type PublicAreaSummary,
} from '../../src/maps/public-map-policy';
import { tabVisualContract } from '../../src/navigation/tab-style';

type FeedStatus = 'demo' | 'loading' | 'live' | 'unavailable';
type JourneyLayer = 'map' | 'list';

function getActionMinHeight(): number {
  return Platform.OS === 'android' ? 48 : 44;
}

export default function MapScreen() {
  const { locale, t } = useLocale();
  const router = useRouter();
  const client = getSupabaseClient() as unknown as NarrowRpcClient | null;
  const mapCopy = getCommunityMapCopy(locale);
  const [status, setStatus] = useState<FeedStatus>(client ? 'loading' : 'demo');
  const [areas, setAreas] = useState<readonly PublicAreaSummary[]>(() => (
    client ? [] : createDemoPublicAreaSummaries(locale)
  ));
  const [layer, setLayer] = useState<JourneyLayer>('map');
  const [mapResetKey, setMapResetKey] = useState(0);
  const [selectedArea, setSelectedArea] = useState<PublicAreaSummary | null>(null);

  useEffect(() => {
    if (!client) {
      setStatus('demo');
      setAreas(createDemoPublicAreaSummaries(locale));
      setSelectedArea(null);
      return;
    }
    let active = true;
    setStatus('loading');
    setAreas([]);
    setSelectedArea(null);
    void listPublicSightings({ limit: 20 }, client)
      .then((page) => {
        if (!active) return;
        setAreas(buildPublicAreaSummaries(page.items, locale));
        setStatus('live');
      })
      .catch(() => {
        if (!active) return;
        setAreas([]);
        setStatus('unavailable');
      });
    return () => { active = false; };
  }, [client, locale]);

  const statusCopy = getStatusCopy(status, areas.length, t);

  function showAreaList() {
    setLayer('list');
  }

  function showMap() {
    setLayer('map');
  }

  function resetBroadMapView() {
    setMapResetKey((key) => key + 1);
  }

  function openArea(area: PublicAreaSummary) {
    setSelectedArea(area);
  }

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <Text style={styles.title}>{t('map.title')}</Text>
        </View>

        <View accessibilityLabel={t('map.title')} style={styles.segmentedControl}>
          <SegmentButton active={layer === 'map'} label={t('map.mapTab')} onPress={showMap} />
          <SegmentButton active={layer === 'list'} label={t('map.listTab')} onPress={showAreaList} />
        </View>

        <View style={styles.contextBar}>
          <View style={styles.contextCopy}>
            <Text style={styles.contextTitle}>{t('map.delayedActivity')}</Text>
            <Text style={styles.legend}>{t('map.legend')}</Text>
          </View>
          <MaterialCommunityIcons color={colors.community} name="shield-check-outline" size={24} />
        </View>

        {layer === 'map' ? (
          <View style={styles.mapStage}>
            <NearbyMap fallbackLabel={t('map.mapUnavailable')} key={mapResetKey} />
            {statusCopy ? (
              <StatusBadge announce={status !== 'demo'} text={statusCopy} unavailable={status === 'unavailable'} />
            ) : null}
            <View style={styles.mapActions}>
              <ActionButton icon="refresh" label={t('map.resetBroadView')} onPress={resetBroadMapView} />
              <ActionButton icon="format-list-bulleted" label={t('map.showAreaList')} onPress={showAreaList} />
            </View>
          </View>
        ) : (
          <View style={styles.listStage}>
            {statusCopy ? (
              <StatusBadge announce={status !== 'demo'} text={statusCopy} unavailable={status === 'unavailable'} />
            ) : null}
            <View style={styles.listHeader}>
              <Text style={styles.listTitle}>{t('map.delayedActivity')}</Text>
              <ActionButton icon="map-outline" label={t('map.showMap')} onPress={showMap} compact />
            </View>
            {areas.map((area) => (
              <Pressable
                key={area.areaKey}
                accessibilityLabel={mapCopy.openAreaLabel(area.label)}
                accessibilityRole="button"
                onPress={() => openArea(area)}
                style={({ pressed }) => [styles.areaRow, pressed && styles.pressed]}
              >
                <View style={styles.areaText}>
                  <Text style={styles.areaLabel}>{area.label}</Text>
                  <Text style={styles.areaMeta}>{area.activityLabel}</Text>
                </View>
                <MaterialCommunityIcons color={colors.actionPrimary} name="chevron-right" size={24} />
              </Pressable>
            ))}
          </View>
        )}

        <View style={styles.manualAreaNotice}>
          <MaterialCommunityIcons color={colors.aquaDeep} name="map-marker-radius-outline" size={21} />
          <Text style={styles.manualAreaCopy}>{t('map.manualAreaExplanation')}</Text>
        </View>
        <ActionButton icon="map-search-outline" label={t('map.chooseAreaManually')} onPress={showAreaList} secondary />

        {selectedArea ? (
          <CoarseAreaDetailSheet
            area={selectedArea}
            locale={locale}
            onReportFromArea={async ({ startAt }) => {
              const draftId = Crypto.randomUUID();
              await saveOfflineDraft({ id: draftId, notes: '', risk: 'normal', report: createReportDraftPayload(new Date()) });
              router.push({ pathname: '/report/new', params: { draftId, step: startAt, manualArea: 'required' } } as never);
            }}
            onViewCat={(animalId) => router.push(`/cat/${animalId}` as never)}
          />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function getStatusCopy(
  status: FeedStatus,
  areaCount: number,
  t: (key: 'map.demoStatus' | 'map.loadingStatus' | 'map.emptyStatus' | 'map.unavailableStatus') => string,
): string | null {
  if (status === 'demo') return t('map.demoStatus');
  if (status === 'loading') return t('map.loadingStatus');
  if (status === 'unavailable') return t('map.unavailableStatus');
  return areaCount === 0 ? t('map.emptyStatus') : null;
}

function SegmentButton({ active, label, onPress }: Readonly<{ active: boolean; label: string; onPress: () => void }>) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [styles.segmentButton, active && styles.segmentButtonActive, pressed && styles.pressed]}
    >
      <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{label}</Text>
    </Pressable>
  );
}

function ActionButton({
  compact = false,
  icon,
  label,
  onPress,
  secondary = false,
}: Readonly<{
  compact?: boolean;
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  label: string;
  onPress: () => void;
  secondary?: boolean;
}>) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionButton,
        compact && styles.actionButtonCompact,
        secondary && styles.actionButtonSecondary,
        pressed && styles.pressed,
      ]}
    >
      <MaterialCommunityIcons color={secondary ? colors.actionSecondary : colors.actionPrimary} name={icon} size={20} />
      <Text numberOfLines={1} style={[styles.actionText, secondary && styles.actionTextSecondary]}>{label}</Text>
    </Pressable>
  );
}

function StatusBadge({ announce, text, unavailable }: Readonly<{ announce: boolean; text: string; unavailable?: boolean }>) {
  return (
    <View
      accessibilityLiveRegion={announce ? 'polite' : undefined}
      style={[styles.statusBadge, unavailable && styles.statusBadgeUnavailable]}
    >
      <Text style={[styles.statusText, unavailable && styles.statusTextUnavailable]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: { paddingBottom: tabVisualContract.barHeight + 24 },
  topBar: {
    minHeight: 64,
    paddingHorizontal: 20,
    justifyContent: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
    backgroundColor: colors.surface,
  },
  title: { color: colors.actionPrimary, fontSize: 19, lineHeight: 24, fontWeight: '800', letterSpacing: -0.25 },
  segmentedControl: {
    minHeight: getActionMinHeight(),
    marginHorizontal: 20,
    marginTop: 14,
    padding: 3,
    flexDirection: 'row',
    borderRadius: radii.small,
    backgroundColor: colors.leafSoft,
  },
  segmentButton: { minHeight: getActionMinHeight(), flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 9 },
  segmentButtonActive: { backgroundColor: colors.surface, boxShadow: '0px 1px 3px rgba(18,59,70,0.15)', elevation: 2 },
  segmentText: { color: colors.muted, fontSize: 14, lineHeight: 18, fontWeight: '700' },
  segmentTextActive: { color: colors.actionPrimary },
  contextBar: {
    minHeight: 66,
    marginHorizontal: 20,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  contextCopy: { flex: 1 },
  contextTitle: { color: colors.mineral, fontSize: 15, lineHeight: 19, fontWeight: '800' },
  legend: { marginTop: 2, color: colors.muted, fontSize: 13, lineHeight: 18 },
  mapStage: { height: 330, overflow: 'hidden', backgroundColor: colors.leafSoft },
  mapActions: {
    position: 'absolute',
    right: 14,
    bottom: 14,
    left: 14,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
    gap: 8,
  },
  listStage: { minHeight: 220, paddingHorizontal: 20, paddingBottom: 10, gap: 9 },
  listHeader: { minHeight: getActionMinHeight(), flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  listTitle: { flex: 1, color: colors.mineral, fontSize: 16, lineHeight: 21, fontWeight: '800' },
  statusBadge: { alignSelf: 'flex-start', marginHorizontal: 20, marginTop: 14, paddingHorizontal: 10, paddingVertical: 7, borderRadius: radii.small, backgroundColor: colors.paper },
  statusBadgeUnavailable: { backgroundColor: '#FFF4EF' },
  statusText: { color: colors.mineral, fontSize: 12, lineHeight: 16, fontWeight: '700' },
  statusTextUnavailable: { color: colors.danger },
  areaRow: {
    minHeight: 68,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.medium,
    backgroundColor: colors.surface,
  },
  areaText: { flex: 1 },
  areaLabel: { color: colors.ink, fontSize: 16, lineHeight: 20, fontWeight: '800' },
  areaMeta: { marginTop: 2, color: colors.muted, fontSize: 13, lineHeight: 18 },
  manualAreaNotice: {
    minHeight: 60,
    marginHorizontal: 20,
    marginTop: 16,
    paddingHorizontal: 14,
    paddingVertical: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.line,
  },
  manualAreaCopy: { flex: 1, color: colors.mineral, fontSize: 13, lineHeight: 18 },
  actionButton: {
    minHeight: getActionMinHeight(),
    paddingHorizontal: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderRadius: radii.small,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(18,59,70,0.2)',
  },
  actionButtonCompact: { paddingHorizontal: 10 },
  actionButtonSecondary: { marginHorizontal: 20, marginTop: 10, backgroundColor: colors.paper, borderColor: 'rgba(226,79,17,0.28)' },
  actionText: { color: colors.actionPrimary, fontSize: 14, lineHeight: 18, fontWeight: '800' },
  actionTextSecondary: { color: colors.actionSecondary },
  pressed: { opacity: 0.78 },
});
