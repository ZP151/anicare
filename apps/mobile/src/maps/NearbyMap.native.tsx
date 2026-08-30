import Constants from 'expo-constants';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import MapView, { PROVIDER_GOOGLE } from 'react-native-maps';

import { NearbyMap as AtlasFallback } from './NearbyMap.web';
import type { NearbyMapProps } from './NearbyMap.types';
import { PUBLIC_GOOGLE_MAP_STYLE, PUBLIC_MAP_PADDING, PUBLIC_MAP_REGION } from './public-map-policy';

const MAP_READINESS_TIMEOUT_MS = 8_000;

export function NearbyMap({
  googleMapsConfigured = Constants.expoConfig?.extra?.googleMapsConfigured === true,
}: NearbyMapProps) {
  const [providerUnavailable, setProviderUnavailable] = useState(false);
  const mapReady = useRef(false);
  const readinessTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearReadinessTimer = useCallback(() => {
    if (readinessTimer.current === null) return;
    clearTimeout(readinessTimer.current);
    readinessTimer.current = null;
  }, []);

  const markMapReady = useCallback(() => {
    mapReady.current = true;
    clearReadinessTimer();
  }, [clearReadinessTimer]);

  useEffect(() => {
    if (!googleMapsConfigured) {
      mapReady.current = false;
      return undefined;
    }

    setProviderUnavailable(false);
    if (mapReady.current) {
      return () => { mapReady.current = false; };
    }
    readinessTimer.current = setTimeout(() => {
      readinessTimer.current = null;
      setProviderUnavailable(true);
    }, MAP_READINESS_TIMEOUT_MS);

    return () => {
      clearReadinessTimer();
      mapReady.current = false;
    };
  }, [clearReadinessTimer, googleMapsConfigured]);

  if (!googleMapsConfigured || providerUnavailable) return <AtlasFallback />;

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
        onMapLoaded={markMapReady}
        onMapReady={markMapReady}
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
