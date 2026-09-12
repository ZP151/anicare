import {singaporeOverviewCoordinates,SINGAPORE_CAMERA_ZOOM_RANGE} from './singapore-camera';
it('zooms the overview 30% closer without changing the geographic centre or source boundary',()=>{
 const points=[{latitude:1.2,longitude:103.6},{latitude:1.5,longitude:104.1}];
 const result=singaporeOverviewCoordinates(points);
 expect(result[1]!.longitude-result[0]!.longitude).toBeCloseTo(.5/1.3);
 expect(result[1]!.latitude-result[0]!.latitude).toBeCloseTo(.3/1.3);
 expect((result[1]!.longitude+result[0]!.longitude)/2).toBeCloseTo(103.85);
 expect(points[0]).toEqual({latitude:1.2,longitude:103.6});
 expect(SINGAPORE_CAMERA_ZOOM_RANGE.maxCenterCoordinateDistance).toBe(120000);
});
