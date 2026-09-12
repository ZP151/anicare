import {singaporeOverviewRegion,SINGAPORE_CAMERA_ZOOM_RANGE} from './singapore-camera';
import {SG_COMMUNITIES} from './singapore-communities';
const points=SG_COMMUNITIES.filter(a=>!a.parentId).flatMap(a=>a.polygons.flatMap(p=>p[0]!.map(([longitude,latitude])=>({latitude:latitude!,longitude:longitude!}))));
it.each([[390,844],[440,956],[320,568]])('frames all Singapore land with modest breathing room on %s × %s', (width,height)=>{
 const padding={top:140,right:20,bottom:160,left:20};
 const region=singaporeOverviewRegion(points,{width,height},padding)!;
 expect(region.longitudeDelta).toBeGreaterThan(0.53);
 expect(region.longitudeDelta).toBeLessThan(0.64);
 const west=region.longitude-region.longitudeDelta/2,east=region.longitude+region.longitudeDelta/2;
 expect(west).toBeLessThan(103.6057); expect(east).toBeGreaterThan(104.08851);
 for(const p of points){const x=(p.longitude-west)/region.longitudeDelta*width;const y=(region.latitude+region.latitudeDelta/2-p.latitude)/region.latitudeDelta*height;
  expect(x).toBeGreaterThanOrEqual(padding.left);expect(x).toBeLessThanOrEqual(width-padding.right);
  expect(y).toBeGreaterThanOrEqual(padding.top);expect(y).toBeLessThanOrEqual(height-padding.bottom);
 }
 expect(SINGAPORE_CAMERA_ZOOM_RANGE).not.toHaveProperty('maxCenterCoordinateDistance');
});
it('waits for a usable map viewport',()=>{
 expect(singaporeOverviewRegion(points,{width:0,height:0},{top:100,right:20,bottom:100,left:20})).toBeNull();
});
