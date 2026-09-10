import { clusterCatActivity } from './map-marker-clusters';

const cat = (animalId: string) => ({ animalId, alias: animalId, timeLabel: 'today' });
const area = (id: string, cats: ReturnType<typeof cat>[], longitude: number) => ({ id, center: [longitude, 1.3] as const, cats });

it('bounds visible cat groups, deduplicates cats, and keeps a selected area addressable', () => {
  const areas = Array.from({ length: 30 }, (_, index) => area(`area-${index}`, [cat(`cat-${index % 20}`)], 103.6 + index / 1000));
  const markers = clusterCatActivity(areas, { selectedAreaId: 'area-29', maximumGroups: 24 });

  expect(markers.length).toBeLessThanOrEqual(24);
  expect(markers.some(marker => marker.areaIds.includes('area-29'))).toBe(true);
  expect(new Set(markers.flatMap(marker => marker.catIds)).size).toBe(20);
  expect(markers.every(marker => areas.some(area => area.center[0] === marker.coordinate.longitude && area.center[1] === marker.coordinate.latitude))).toBe(true);
});

it('keeps distant areas separate at a detailed zoom and regroups dense activity when zoomed out', () => {
  const areas = [area('west', [cat('west-cat')], 103.71), area('east', [cat('east-cat')], 103.79), ...Array.from({ length: 28 }, (_, index) => area(`dense-${index}`, [cat(`dense-cat-${index}`)], 103.75 + index / 10000))];
  const detailed = clusterCatActivity(areas, { maximumGroups: 24, viewport: { latitude: 1.3, longitude: 103.75, latitudeDelta: 0.05, longitudeDelta: 0.1 } });
  const overview = clusterCatActivity(areas, { maximumGroups: 24, viewport: { latitude: 1.3, longitude: 103.75, latitudeDelta: 0.5, longitudeDelta: 0.5 } });

  expect(detailed.some(marker => marker.areaIds.includes('west') && marker.areaIds.includes('east'))).toBe(false);
  expect(overview.length).toBeLessThan(detailed.length);
  expect(new Set(overview.flatMap(marker => marker.catIds)).size).toBe(30);
});
