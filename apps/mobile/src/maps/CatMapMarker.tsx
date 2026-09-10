import { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { AppIcon } from '../components/AppIcon';

export function CatMapMarker({ portraitUri, count, selected, onSnapshotSettled }: Readonly<{ portraitUri?: string | null; count: number; selected?: boolean; onSnapshotSettled?: () => void }>) {
  const [tracking, setTracking] = useState(Boolean(portraitUri));
  useEffect(() => { setTracking(Boolean(portraitUri)); }, [portraitUri, selected]);
  const settle = () => { setTracking(false); onSnapshotSettled?.(); };
  return <View testID="cat-map-marker" accessibilityLabel={count > 1 ? `${count} cats in delayed neighbourhood activity` : 'Cat in delayed neighbourhood activity'} style={[styles.marker, selected && styles.selected]}>
    {portraitUri ? <Image accessibilityLabel="Public cat portrait" source={{ uri: portraitUri }} onLoad={settle} onError={settle} style={styles.image} /> : <View accessibilityLabel="Cat portrait unavailable" style={styles.image}><AppIcon name="cat" size={22} color="#2465D8" /></View>}
    {count > 1 ? <Text style={styles.count}>{count}</Text> : null}
    <Text testID="marker-tracks-view-changes" style={styles.hidden}>{String(tracking)}</Text>
  </View>;
}

const styles = StyleSheet.create({ marker: { minWidth: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: '#fff', backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', overflow: 'visible' }, selected: { borderColor: '#174899' }, image: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E7F0FF' }, count: { position: 'absolute', right: -9, top: -8, minWidth: 20, height: 20, borderRadius: 10, overflow: 'hidden', textAlign: 'center', color: '#fff', backgroundColor: '#2465D8', fontWeight: '800', fontSize: 12, lineHeight: 20 }, hidden: { width: 0, height: 0, opacity: 0 } });
