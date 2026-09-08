import Constants from 'expo-constants';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import MapView, { PROVIDER_GOOGLE } from 'react-native-maps';

import { NearbyMap as UnavailableMap } from './NearbyMap.web';
import type { NearbyMapProps } from './NearbyMap.types';
import { PUBLIC_GOOGLE_MAP_STYLE, PUBLIC_MAP_PADDING, PUBLIC_MAP_REGION } from './public-map-policy';

const MAP_READINESS_TIMEOUT_MS = 8_000;

export function NearbyMap({
  fallbackLabel,
  androidGoogleMapsConfigured = Constants.expoConfig?.extra?.androidGoogleMapsConfigured === true,
}: NearbyMapProps) {
  const mapEnabled = Platform.OS === 'ios' || androidGoogleMapsConfigured;
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
    if (!mapEnabled) {
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
  }, [clearReadinessTimer, mapEnabled]);

  if (!mapEnabled || providerUnavailable) return <UnavailableMap fallbackLabel={fallbackLabel} />;

  return (
    <View accessibilityLabel="Privacy-safe neighbourhood map" style={styles.frame}>
      <MapView
        customMapStyle={Platform.OS === 'android' ? PUBLIC_GOOGLE_MAP_STYLE.map((entry) => ({
          ...entry,
          stylers: entry.stylers.map((styler) => ({ ...styler })),
        })) : undefined}
        initialRegion={PUBLIC_MAP_REGION}
        mapPadding={PUBLIC_MAP_PADDING}
        maxZoomLevel={14}
        minZoomLevel={10}
        onMapLoaded={markMapReady}
        onMapReady={markMapReady}
        pitchEnabled={false}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
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
