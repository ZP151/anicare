import {singaporeOverviewCoordinates,SINGAPORE_CAMERA_ZOOM_RANGE} from './singapore-camera';
import {SG_COMMUNITIES} from './singapore-communities';
it('fits every official land boundary including western Singapore and Changi / Tekong',()=>{
 const points=SG_COMMUNITIES.filter(a=>!a.parentId).flatMap(a=>a.polygons.flatMap(p=>p[0]!.map(([longitude,latitude])=>({latitude:latitude!,longitude:longitude!}))));
 const result=singaporeOverviewCoordinates(points);
 for(const axis of ['latitude','longitude'] as const){
  expect(Math.min(...result.map(p=>p[axis]))).toBeLessThanOrEqual(Math.min(...points.map(p=>p[axis])));
  expect(Math.max(...result.map(p=>p[axis]))).toBeGreaterThanOrEqual(Math.max(...points.map(p=>p[axis])));
 }
 expect(Math.min(...result.map(p=>p.longitude))).toBeLessThan(103.62);
 expect(Math.max(...result.map(p=>p.longitude))).toBeGreaterThan(104.08);
 expect(SINGAPORE_CAMERA_ZOOM_RANGE).not.toHaveProperty('maxCenterCoordinateDistance');
});
