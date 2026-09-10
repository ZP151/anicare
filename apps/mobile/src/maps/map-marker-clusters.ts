type Cat = Readonly<{ animalId: string }>;
type Area = Readonly<{ id: string; center: readonly number[]; cats: readonly Cat[] }>;

export type CatActivityMarker = Readonly<{
  id: string;
  coordinate: Readonly<{ latitude: number; longitude: number }>;
  areaIds: readonly string[];
  catIds: readonly string[];
  representativeCatId: string;
}>;

export type MapViewport = Readonly<{ latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number }>;

/** Groups only existing public area anchors; it never creates a new coordinate. */
export function clusterCatActivity(areas: readonly Area[], { selectedAreaId, maximumGroups = 24, viewport }: Readonly<{ selectedAreaId?: string | null; maximumGroups?: number; viewport?: MapViewport | null }> = {}): readonly CatActivityMarker[] {
  const ordered = [...areas].sort((left, right) => Number(right.id === selectedAreaId) - Number(left.id === selectedAreaId) || left.id.localeCompare(right.id));
  const unique = new Set<string>();
  const source = ordered.flatMap(area => {
    const latitude = area.center[1]; const longitude = area.center[0];
    const visible = !viewport || (latitude !== undefined && longitude !== undefined && Math.abs(latitude - viewport.latitude) <= viewport.latitudeDelta / 2 && Math.abs(longitude - viewport.longitude) <= viewport.longitudeDelta / 2);
    if (!visible && area.id !== selectedAreaId) return [];
    const cats = area.cats.filter(cat => !unique.has(cat.animalId) && (unique.add(cat.animalId), true));
    return cats.length ? [{ area, cats }] : [];
  });
  if (!source.length) return [];
  const initialCell = viewport ? Math.max(Math.max(viewport.latitudeDelta, viewport.longitudeDelta) / 12, 0.001) : 0.01;
  let cellSize = initialCell;
  let groups: readonly (readonly typeof source[number][])[] = [];
  do {
    const grouped = new Map<string, typeof source>();
    for (const item of source) {
      const key = item.area.id === selectedAreaId ? `selected:${item.area.id}` : `${Math.floor(item.area.center[1]! / cellSize)}:${Math.floor(item.area.center[0]! / cellSize)}`;
      const current = grouped.get(key) ?? []; current.push(item); grouped.set(key, current);
    }
    groups = [...grouped.values()]; cellSize *= 2;
  } while (groups.length > maximumGroups && cellSize < 20);
  return groups.map(group => {
    const anchor = group[0]!.area;
    const catIds = group.flatMap(item => item.cats.map(cat => cat.animalId));
    return { id: group.map(item => item.area.id).join('|'), coordinate: { latitude: anchor.center[1]!, longitude: anchor.center[0]! }, areaIds: group.map(item => item.area.id), catIds, representativeCatId: catIds[0]! };
  });
}
