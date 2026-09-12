type Coordinate = Readonly<{latitude:number;longitude:number}>;
// Camera distance, in metres, is supported by Apple Maps (legacy zoom levels
// are deprecated there). Keep overview gestures within Singapore's vicinity.
export const SINGAPORE_CAMERA_ZOOM_RANGE = Object.freeze({
  minCenterCoordinateDistance: 150,
  maxCenterCoordinateDistance: 120_000,
});

export function singaporeOverviewCoordinates(boundary: readonly Coordinate[]): Coordinate[] {
  if (!boundary.length) return [];
  const latitudes=boundary.map(point=>point.latitude),longitudes=boundary.map(point=>point.longitude);
  const latitude=(Math.min(...latitudes)+Math.max(...latitudes))/2;
  const longitude=(Math.min(...longitudes)+Math.max(...longitudes))/2;
  // Tighten the fitted overview only; official polygons and public cat positions
  // remain unchanged. 1 / 1.3 gives the requested 30% increase in visual scale.
  return boundary.map(point=>({latitude:latitude+(point.latitude-latitude)/1.3,longitude:longitude+(point.longitude-longitude)/1.3}));
}
