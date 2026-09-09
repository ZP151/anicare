import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Linking, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useNativeColors } from '../design/native-colors';
import { AppIcon } from '../components/AppIcon';
import { searchApplePlaces, type MapPlace } from './apple-place-search';
import { requestDeviceLocation } from './device-location';
import type { NearbyMapProps } from './NearbyMap.types';

export function PlaceSearch({ cn, onSelect }: { cn: boolean; onSelect(place: MapPlace): void }) {
  const c = useNativeColors();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<readonly MapPlace[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setResults([]);
    if (query.trim().length < 2) { setStatus('idle'); return; }
    setStatus('loading');
    const timer = setTimeout(() => {
      void searchApplePlaces(query).then(items => { if (active) { setResults(items); setStatus('ready'); } }).catch(() => { if (active) setStatus('error'); });
    }, 400);
    return () => { active = false; clearTimeout(timer); };
  }, [query, retry]);
  return <View style={{ gap: 8 }}>
    <TextInput accessibilityLabel={cn ? '搜索邮编、建筑物或街道' : 'Search postcode, building or street'} placeholder={cn ? '邮编、建筑物、街道' : 'Postcode, building, street'} placeholderTextColor={c.muted} value={query} onChangeText={setQuery} returnKeyType="search" autoCorrect={false} style={{ minHeight: 44, color: c.ink, backgroundColor: c.surface, borderRadius: 14, paddingHorizontal: 14, fontSize: 16 }} />
    {status === 'loading' ? <ActivityIndicator accessibilityLabel={cn ? '搜索地点' : 'Searching places'} /> : null}
    {status === 'error' ? <Pressable accessibilityRole="button" onPress={() => setRetry(n => n + 1)} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: c.actionPrimary }}>{cn ? '地点搜索暂不可用，点此重试' : 'Place search unavailable. Tap to retry.'}</Text></Pressable> : null}
    {status === 'ready' && !results.length ? <Text style={{ color: c.muted }}>{cn ? '没有找到地点，试试完整邮编或建筑名称。' : 'No places found. Try a full postcode or building name.'}</Text> : null}
    <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 220 }}>{results.map(place => <Pressable key={place.id} accessibilityRole="button" onPress={() => { onSelect(place); setQuery(''); }} style={{ paddingVertical: 12, borderBottomWidth: .5, borderBottomColor: c.line }}><Text style={{ color: c.ink, fontWeight: '600', fontSize: 16 }}>{place.name}</Text><Text style={{ color: c.muted, fontSize: 12, marginTop: 4 }}>{place.address}</Text></Pressable>)}</ScrollView>
  </View>;
}

export function MyLocationButton({ cn, onLocation }: { cn: boolean; onLocation(point: NearbyMapProps['focusPoint']): void }) {
  const c = useNativeColors(); const [busy, setBusy] = useState(false); const [failed, setFailed] = useState(false); const attempt = useRef(0); const pending = useRef(false);
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => { if (state === 'background') { attempt.current++; pending.current = false; setBusy(false); onLocation(null); } });
    return () => { attempt.current++; sub.remove(); };
  }, [onLocation]);
  const locate = async () => {
    if (pending.current) return;
    pending.current = true; const ticket = ++attempt.current; setBusy(true); setFailed(false);
    try {
      const result = await requestDeviceLocation();
      if (ticket !== attempt.current) return;
      if (result.kind !== 'granted') { setFailed(true); return; }
      onLocation({ latitude: result.latitude, longitude: result.longitude, title: cn ? '我的位置' : 'My location', isUser: true });
    } catch { if (ticket === attempt.current) setFailed(true); }
    finally { if (ticket === attempt.current) { pending.current = false; setBusy(false); } }
  };
  return <View><Pressable accessibilityRole="button" accessibilityLabel={cn ? '我的位置' : 'My location'} disabled={busy} onPress={() => { void locate(); }} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>{busy ? <ActivityIndicator /> : <AppIcon name="location" color={c.actionPrimary} />}</Pressable>{failed ? <View style={{ padding: 12, maxWidth: 240, backgroundColor: c.surface, borderRadius: 16, gap: 6 }}><Text style={{ color: c.ink }}>{cn ? '暂时无法定位，请检查定位权限和系统定位服务。' : 'Location unavailable. Check permissions and Location Services.'}</Text><Pressable accessibilityRole="button" onPress={() => { void Linking.openSettings(); }} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: c.actionPrimary }}>{cn ? '打开设置' : 'Open settings'}</Text></Pressable></View> : null}</View>;
}
