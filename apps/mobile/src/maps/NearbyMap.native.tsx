import Constants from 'expo-constants';
import { StyleSheet, View } from 'react-native';
import MapView, { PROVIDER_GOOGLE } from 'react-native-maps';

import { NearbyMap as AtlasFallback } from './NearbyMap.web';
import type { NearbyMapProps } from './NearbyMap.types';
import { PUBLIC_GOOGLE_MAP_STYLE, PUBLIC_MAP_PADDING, PUBLIC_MAP_REGION } from './public-map-policy';

export function NearbyMap({
  googleMapsConfigured = Constants.expoConfig?.extra?.googleMapsConfigured === true,
}: NearbyMapProps) {
  if (!googleMapsConfigured) return <AtlasFallback />;

  return (
    <View accessibilityLabel="Privacy-safe Google neighbourhood map" style={styles.frame}>
      <MapView
        customMapStyle={PUBLIC_GOOGLE_MAP_STYLE.map((entry) => ({
          ...entry,
          stylers: entry.stylers.map((styler) => ({ ...styler })),
        }))}
        initialRegion={PUBLIC_MAP_REGION}
        mapPadding={PUBLIC_MAP_PADDING}
        maxZoomLevel={14}
        minZoomLevel={10}
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
  );
}

const styles = StyleSheet.create({ frame: { flex: 1 } });
