import { NativeModules, Platform } from 'react-native';
export type MapPlace = Readonly<{ id: string; name: string; address: string; postalCode: string; latitude: number; longitude: number }>;
export async function searchApplePlaces(query: string): Promise<readonly MapPlace[]> {
  if (query.trim().length < 2) return [];
  if (Platform.OS !== 'ios' || !NativeModules.WhiskerPlaceSearch?.search) throw new Error('apple_search_unavailable');
  const result: unknown = await NativeModules.WhiskerPlaceSearch.search(query.trim());
  if (!Array.isArray(result)) throw new Error('invalid_place_results');
  return result.filter((p): p is MapPlace => p && typeof p.id === 'string' && typeof p.name === 'string' && typeof p.address === 'string' && typeof p.postalCode === 'string' && Number.isFinite(p.latitude) && Number.isFinite(p.longitude) && p.latitude >= 1.15 && p.latitude <= 1.5 && p.longitude >= 103.55 && p.longitude <= 104.15).slice(0, 20);
}
