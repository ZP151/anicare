import { toPublicLocationCell } from '@animalhelper/domain';
import type { ComponentType } from 'react';
import MapView, { PROVIDER_GOOGLE, type MapPressEvent } from 'react-native-maps';
import { StyleSheet, Text, View } from 'react-native';

import { colors, radii } from '../design/theme';
import type { Locale } from '../i18n/catalog';
import { PUBLIC_GOOGLE_MAP_STYLE, PUBLIC_MAP_REGION } from '../maps/public-map-policy';
import { getReportCopy } from './report-copy';

export type ReportAreaSelection = Readonly<{ publicCellId: string }>;

type AreaMapBoundaryProps = Readonly<{ onPress(event: MapPressEvent): void }>;

function NativeAreaMap({ onPress, locale = 'en' }: AreaMapBoundaryProps & Readonly<{ locale?: Locale }>) {
  const copy = getReportCopy(locale);
  return (
    <View accessibilityLabel={copy.wizardAreaMapLabel} style={styles.frame}>
      <Text style={styles.copy}>{copy.wizardAreaMapInstruction}</Text>
      <View style={styles.mapFrame}>
        <MapView
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
  return <MapBoundary locale={locale} onPress={(event) => {
    const { latitude, longitude } = event.nativeEvent.coordinate;
    const { cellId } = toPublicLocationCell({ latitude, longitude });
    onSelect({ publicCellId: cellId });
  }} />;
}

const styles = StyleSheet.create({
  frame: { gap: 10 },
  copy: { color: colors.muted, fontSize: 15, lineHeight: 21 },
  mapFrame: { height: 280, overflow: 'hidden', borderRadius: radii.medium, backgroundColor: colors.leafSoft },
});
