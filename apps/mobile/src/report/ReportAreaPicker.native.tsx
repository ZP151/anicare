import { toPublicLocationCell } from '@animalhelper/domain';
import { useState, type ComponentType } from 'react';
import MapView, { PROVIDER_GOOGLE, type MapPressEvent } from 'react-native-maps';
import { StyleSheet, Text, View } from 'react-native';

import { colors, radii } from '../design/theme';
import type { Locale } from '../i18n/catalog';
import { PUBLIC_GOOGLE_MAP_STYLE, PUBLIC_MAP_REGION } from '../maps/public-map-policy';
import { getReportCopy } from './report-copy';

export type ReportAreaSelection = Readonly<{ publicCellId: string }>;

type AreaMapBoundaryProps = Readonly<{ onPress(event: MapPressEvent): void }>;

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

function NativeAreaMap({ onPress, locale = 'en' }: AreaMapBoundaryProps & Readonly<{ locale?: Locale }>) {
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
}: Readonly<{
  onSelect(selection: ReportAreaSelection): void;
  MapBoundary?: ComponentType<AreaMapBoundaryProps & Readonly<{ locale?: Locale }>>;
  locale?: Locale;
}>) {
  const [outsideSingapore, setOutsideSingapore] = useState(false);
  return <>
    <MapBoundary locale={locale} onPress={(event) => {
      const { latitude, longitude } = event.nativeEvent.coordinate;
      if (!isWithinSingapore(latitude, longitude)) {
        setOutsideSingapore(true);
        return;
      }
      setOutsideSingapore(false);
      const { cellId } = toPublicLocationCell({ latitude, longitude });
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
  mapFrame: { height: 280, overflow: 'hidden', borderRadius: radii.medium, backgroundColor: colors.leafSoft },
});
