type Coordinate = Readonly<{latitude:number;longitude:number}>;
// Limit close-up only. Users may zoom out beyond the initial Singapore overview.
export const SINGAPORE_CAMERA_ZOOM_RANGE = Object.freeze({minCenterCoordinateDistance:150});
export function singaporeOverviewCoordinates(boundary: readonly Coordinate[]): Coordinate[] {
 // Fit the full official land geometry. Screen edge padding supplies the margin;
 // contracting geographic coordinates crops Tuas, Changi and the eastern islands.
 return boundary.map(point=>({...point}));
}
