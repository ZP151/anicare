import { isSingaporePublicCell, toPublicLocationCell } from '@animalhelper/domain';
import Constants from 'expo-constants';
import { useCallback, useEffect, useRef, useState, type ComponentType } from 'react';
import MapView, { PROVIDER_GOOGLE, type MapPressEvent } from 'react-native-maps';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radii } from '../design/theme';
import type { Locale } from '../i18n/catalog';
import { PUBLIC_GOOGLE_MAP_STYLE, PUBLIC_MAP_REGION } from '../maps/public-map-policy';
import { getReportCopy } from './report-copy';

export type ReportAreaSelection = Readonly<{ publicCellId: string }>;

type AreaMapBoundaryProps = Readonly<{ onPress(event: MapPressEvent): void; onReady?(): void }>;
const MAP_READINESS_TIMEOUT_MS = 8_000;
const FALLBACK_AREAS = Object.freeze([
  { label: { en: 'West Singapore', 'zh-CN': '新加坡西部' }, publicCellId: '896520ca163ffff' },
  { label: { en: 'Central Singapore', 'zh-CN': '新加坡中部' }, publicCellId: '89652636d87ffff' },
  { label: { en: 'East Singapore', 'zh-CN': '新加坡东部' }, publicCellId: '896526add03ffff' },
]);

const SINGAPORE_BOUNDS = Object.freeze({
  minLatitude: 1.1,
  maxLatitude: 1.5,
  minLongitude: 103.55,
  maxLongitude: 104.15,
});

function isWithinSingapore(latitude: number, longitude: number): boolean {
  return Number.isFinite(latitude) && Number.isFinite(longitude) &&
    latitude >= SINGAPORE_BOUNDS.minLatitude && latitude <= SINGAPORE_BOUNDS.maxLatitude &&
    longitude >= SINGAPORE_BOUNDS.minLongitude && longitude <= SINGAPORE_BOUNDS.maxLongitude;
}

function NativeAreaMap({ onPress, onReady, locale = 'en' }: AreaMapBoundaryProps & Readonly<{ locale?: Locale }>) {
  const copy = getReportCopy(locale);
  return (
    <View accessibilityLabel={copy.wizardAreaMapLabel} style={styles.frame}>
      <Text style={styles.copy}>{copy.wizardAreaMapInstruction}</Text>
      <View style={styles.mapFrame}>
        <MapView
          accessibilityLabel={copy.wizardAreaMapLabel}
          accessibilityRole="button"
          customMapStyle={PUBLIC_GOOGLE_MAP_STYLE.map((entry) => ({ ...entry, stylers: entry.stylers.map((styler) => ({ ...styler })) }))}
          initialRegion={PUBLIC_MAP_REGION}
          maxZoomLevel={14}
          minZoomLevel={10}
          onPress={onPress}
          onMapLoaded={onReady}
          onMapReady={onReady}
          pitchEnabled={false}
          provider={PROVIDER_GOOGLE}
          rotateEnabled={false}
          showsBuildings={false}
          showsCompass={false}
          showsIndoors={false}
          showsMyLocationButton={false}
          showsPointsOfInterests={false}
          showsTraffic={false}
          showsUserLocation={false}
          style={StyleSheet.absoluteFill}
          toolbarEnabled={false}
        />
      </View>
    </View>
  );
}

export function ReportAreaPicker({
  onSelect,
  MapBoundary = NativeAreaMap,
  locale = 'en',
  googleMapsConfigured = Constants.expoConfig?.extra?.googleMapsConfigured === true,
}: Readonly<{
  onSelect(selection: ReportAreaSelection): void;
  MapBoundary?: ComponentType<AreaMapBoundaryProps & Readonly<{ locale?: Locale }>>;
  locale?: Locale;
  googleMapsConfigured?: boolean;
}>) {
  const [outsideSingapore, setOutsideSingapore] = useState(false);
  const [providerUnavailable, setProviderUnavailable] = useState(false);
  const readyRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const markReady = useCallback(() => {
    readyRef.current = true;
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);
  useEffect(() => {
    if (!googleMapsConfigured) return undefined;
    setProviderUnavailable(false);
    if (readyRef.current) return () => { readyRef.current = false; };
    timerRef.current = setTimeout(() => { timerRef.current = null; setProviderUnavailable(true); }, MAP_READINESS_TIMEOUT_MS);
    return () => { if (timerRef.current !== null) clearTimeout(timerRef.current); timerRef.current = null; readyRef.current = false; };
  }, [googleMapsConfigured]);
  if (!googleMapsConfigured || providerUnavailable) {
    return <View style={styles.frame}>
      <Text accessibilityLiveRegion="polite" style={styles.copy}>{locale === 'zh-CN' ? 'Google 地图暂不可用。请从列表选择新加坡的宽泛区域。' : 'Google Maps is unavailable. Choose a broad Singapore area from the list.'}</Text>
      {FALLBACK_AREAS.map((area) => <Pressable
        accessibilityLabel={area.label[locale]}
        accessibilityRole="button"
        key={area.publicCellId}
        onPress={() => onSelect({ publicCellId: area.publicCellId })}
        style={styles.fallbackAction}
      ><Text style={styles.fallbackText}>{area.label[locale]}</Text></Pressable>)}
    </View>;
  }
  return <>
    <MapBoundary locale={locale} onReady={markReady} onPress={(event) => {
      const { latitude, longitude } = event.nativeEvent.coordinate;
      if (!isWithinSingapore(latitude, longitude)) {
        setOutsideSingapore(true);
        return;
      }
      setOutsideSingapore(false);
      const { cellId } = toPublicLocationCell({ latitude, longitude });
      if (!isSingaporePublicCell(cellId)) {
        setOutsideSingapore(true);
        return;
      }
      onSelect({ publicCellId: cellId });
    }} />
    {outsideSingapore ? (
      <Text accessibilityLiveRegion="polite" style={styles.error}>
        {locale === 'zh-CN' ? '请选择新加坡境内的宽泛区域。' : 'Choose a broad area within Singapore.'}
      </Text>
    ) : null}
  </>;
}

const styles = StyleSheet.create({
  frame: { gap: 10 },
  copy: { color: colors.muted, fontSize: 15, lineHeight: 21 },
  error: { color: colors.danger, fontSize: 13, lineHeight: 18 },
  fallbackAction: { minHeight: 48, paddingVertical: 13, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.line, borderRadius: radii.small },
  fallbackText: { color: colors.actionPrimary, fontSize: 16, fontWeight: '700' },
  mapFrame: { height: 280, overflow: 'hidden', borderRadius: radii.medium, backgroundColor: colors.leafSoft },
});
