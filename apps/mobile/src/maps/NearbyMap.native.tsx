import Constants from 'expo-constants';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Platform, StyleSheet, View } from 'react-native';
import MapView, { Marker, Polygon, PROVIDER_GOOGLE, type Region } from 'react-native-maps';

import { NearbyMap as UnavailableMap } from './NearbyMap.web';
import type { NearbyMapProps } from './NearbyMap.types';
import { PUBLIC_GOOGLE_MAP_STYLE, PUBLIC_MAP_PADDING, PUBLIC_MAP_REGION } from './public-map-policy';
import { CatMapMarker } from './CatMapMarker';
import { clusterCatActivity } from './map-marker-clusters';
import { SG_COMMUNITIES } from './singapore-communities';

const MAP_READINESS_TIMEOUT_MS = 8_000;
const OFFICIAL_SINGAPORE_BOUNDARY=SG_COMMUNITIES.filter(area=>!area.parentId).flatMap(area=>area.polygons.flatMap(polygon=>polygon[0]?.map(point=>({latitude:point[1]!,longitude:point[0]!}))??[]));

export function NearbyMap({
  fallbackLabel, focusPoint,
  androidGoogleMapsConfigured = Constants.expoConfig?.extra?.androidGoogleMapsConfigured === true,
  areas = [], selectedAreaId, onSelectArea, onSelectAreas, publicPortraits, fitSingaporeRequest = 0, fitEdgePadding = PUBLIC_MAP_PADDING, fitLayoutReady = true,
}: NearbyMapProps) {
  const mapRef=useRef<MapView>(null);
  const selected=areas.find(area=>area.id===selectedAreaId);
  const [viewport, setViewport] = useState<Region>(PUBLIC_MAP_REGION);
  const catMarkers = clusterCatActivity(areas, { selectedAreaId, viewport });
  const mapEnabled = Platform.OS === 'ios' || androidGoogleMapsConfigured;
  const [providerUnavailable, setProviderUnavailable] = useState(false);
  const [settledPortraits, setSettledPortraits] = useState<Record<string, string>>({});
  const [reduceMotion, setReduceMotion] = useState(false);
  const mapReady = useRef(false),fittedRequest=useRef<number|null>(null);
  const readinessTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearReadinessTimer = useCallback(() => {if (readinessTimer.current === null) return;clearTimeout(readinessTimer.current);readinessTimer.current = null;}, []);
  const fitOfficialSingapore=useCallback((request:number)=>{if(!mapReady.current||!fitLayoutReady||fittedRequest.current===request||(request===0&&(selected||focusPoint)))return;fittedRequest.current=request;mapRef.current?.fitToCoordinates(OFFICIAL_SINGAPORE_BOUNDARY,{edgePadding:fitEdgePadding,animated:!reduceMotion});},[fitEdgePadding,fitLayoutReady,focusPoint,reduceMotion,selected]);
  const markMapReady = useCallback(() => {mapReady.current = true;clearReadinessTimer();fitOfficialSingapore(fitSingaporeRequest);}, [clearReadinessTimer,fitOfficialSingapore,fitSingaporeRequest]);

  useEffect(() => {
    // Apple emits onMapReady when native rendering starts, which can be delayed
    // while a tab is offscreen. A timeout must never remove its map permanently.
    if (!mapEnabled || Platform.OS === 'ios') return undefined;
    setProviderUnavailable(false);
    if (!mapReady.current) readinessTimer.current = setTimeout(() => {
      readinessTimer.current = null;
      setProviderUnavailable(true);
    }, MAP_READINESS_TIMEOUT_MS);
    return clearReadinessTimer;
  }, [clearReadinessTimer, mapEnabled]);
  useEffect(()=>{fitOfficialSingapore(fitSingaporeRequest);},[fitOfficialSingapore,fitSingaporeRequest]);
  useEffect(()=>{if(selected) mapRef.current?.animateToRegion({latitude:selected.center[1]!,longitude:selected.center[0]!,latitudeDelta:selected.parentId?0.018:0.055,longitudeDelta:selected.parentId?0.018:0.055},reduceMotion?0:350);},[selected?.id,reduceMotion]);
  useEffect(()=>{if (focusPoint) mapRef.current?.animateToRegion({ ...focusPoint, latitudeDelta: 0.008, longitudeDelta: 0.008 }, reduceMotion?0:350);}, [focusPoint,reduceMotion]);
  useEffect(()=>{void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);const subscription=AccessibilityInfo.addEventListener('reduceMotionChanged',setReduceMotion);return()=>subscription.remove();},[]);
  useEffect(()=>{setSettledPortraits({});},[publicPortraits]);
  if (!mapEnabled || providerUnavailable) return <UnavailableMap fallbackLabel={fallbackLabel} />;
  return <View accessibilityLabel="Privacy-safe neighbourhood map" style={styles.frame}><MapView ref={mapRef} customMapStyle={Platform.OS === 'android' ? PUBLIC_GOOGLE_MAP_STYLE.map((entry) => ({...entry,stylers: entry.stylers.map((styler) => ({ ...styler }))})) : undefined} initialRegion={PUBLIC_MAP_REGION} mapPadding={fitEdgePadding} maxZoomLevel={19} minZoomLevel={8} onMapLoaded={Platform.OS === 'android' ? markMapReady : undefined} onMapReady={markMapReady} onRegionChangeComplete={setViewport} pitchEnabled={false} provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined} rotateEnabled={false} showsBuildings showsCompass={false} showsIndoors={false} showsMyLocationButton={false} showsPointsOfInterests showsTraffic={false} showsUserLocation={false} style={StyleSheet.absoluteFill} toolbarEnabled={false}>
    {focusPoint ? <Marker coordinate={focusPoint} title={focusPoint.title} pinColor={focusPoint.isUser ? '#3478F6' : '#E36A45'} /> : null}
    {selected?.polygons.map((polygon,index)=><Polygon key={`${selected.id}-${index}`} coordinates={polygon[0]!.map(point=>({latitude:point[1]!,longitude:point[0]!}))} holes={polygon.slice(1).map(ring=>ring.map(point=>({latitude:point[1]!,longitude:point[0]!})))} strokeColor="#2465D8" fillColor="rgba(36,101,216,0.10)" strokeWidth={2}/>) }
    {catMarkers.map(marker=>{const portraitUri=publicPortraits?.get(marker.representativeCatId)?.portraitUri ?? null;return <Marker key={`${marker.id}|${portraitUri ?? ''}`} coordinate={marker.coordinate} onPress={()=>marker.areaIds.length===1?onSelectArea?.(marker.areaIds[0]!):onSelectAreas?.(marker.areaIds)} tracksViewChanges={Boolean(portraitUri) && settledPortraits[marker.id]!==portraitUri}><CatMapMarker portraitUri={portraitUri} count={marker.catIds.length} selected={marker.areaIds.includes(selectedAreaId ?? '')} onSnapshotSettled={()=>{if(portraitUri)setSettledPortraits(old=>old[marker.id]===portraitUri?old:{...old,[marker.id]:portraitUri});}}/></Marker>;})}
  </MapView></View>;
}
const styles = StyleSheet.create({ frame: { flex: 1 } });
