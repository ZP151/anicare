import Constants from 'expo-constants';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polygon, PROVIDER_GOOGLE } from 'react-native-maps';

import { NearbyMap as UnavailableMap } from './NearbyMap.web';
import type { NearbyMapProps } from './NearbyMap.types';
import { PUBLIC_GOOGLE_MAP_STYLE, PUBLIC_MAP_PADDING, PUBLIC_MAP_REGION } from './public-map-policy';

const MAP_READINESS_TIMEOUT_MS = 8_000;

export function NearbyMap({
  fallbackLabel,
  androidGoogleMapsConfigured = Constants.expoConfig?.extra?.androidGoogleMapsConfigured === true,
  areas = [], selectedAreaId, onSelectArea,
}: NearbyMapProps) {
  const mapRef=useRef<MapView>(null);
  const selected=areas.find(area=>area.id===selectedAreaId);
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

  useEffect(()=>{
    if(selected) mapRef.current?.animateToRegion({latitude:selected.center[1]!,longitude:selected.center[0]!,latitudeDelta:0.055,longitudeDelta:0.055},350);
  },[selected?.id]);

  if (!mapEnabled || providerUnavailable) return <UnavailableMap fallbackLabel={fallbackLabel} />;

  return (
    <View accessibilityLabel="Privacy-safe neighbourhood map" style={styles.frame}>
      <MapView
        ref={mapRef}
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
        showsBuildings
        showsCompass={false}
        showsIndoors={false}
        showsMyLocationButton={false}
        showsPointsOfInterests={false}
        showsTraffic={false}
        showsUserLocation={false}
        style={StyleSheet.absoluteFill}
        toolbarEnabled={false}
      >
        {selected?.polygons.map((polygon,index)=><Polygon key={`${selected.id}-${index}`} coordinates={polygon[0]!.map(point=>({latitude:point[1]!,longitude:point[0]!}))} holes={polygon.slice(1).map(ring=>ring.map(point=>({latitude:point[1]!,longitude:point[0]!})))} strokeColor="#247366" fillColor="rgba(36,115,102,0.10)" strokeWidth={2}/>)}
        {areas.filter(area=>area.cats.length>0).map(area=><Marker key={area.id} coordinate={{latitude:area.center[1]!,longitude:area.center[0]!}} title={area.name} description={`${area.cats.length} cats · delayed community activity`} onPress={()=>onSelectArea?.(area.id)} tracksViewChanges>
          <View style={[styles.marker,selectedAreaId===area.id&&styles.selected]}><Text style={styles.count}>{area.cats.length}</Text><Text style={styles.name}>{area.name}</Text></View>
        </Marker>)}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({ frame: { flex: 1 },marker:{backgroundColor:'#276D60',borderWidth:2,borderColor:'#fff',borderRadius:22,paddingHorizontal:12,paddingVertical:7,alignItems:'center'},selected:{backgroundColor:'#174639'},count:{color:'#fff',fontWeight:'800',fontSize:18},name:{color:'#fff',fontWeight:'600',fontSize:10} });
