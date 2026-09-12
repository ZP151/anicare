type Coordinate=Readonly<{latitude:number;longitude:number}>;
type Viewport=Readonly<{width:number;height:number}>;
type Padding=Readonly<{top:number;right:number;bottom:number;left:number}>;
export const SINGAPORE_CAMERA_ZOOM_RANGE={minCenterCoordinateDistance:150};
const mercatorY=(latitude:number)=>Math.log(Math.tan(Math.PI/4+latitude*Math.PI/360))*180/Math.PI;
const latitudeAt=(y:number)=>(2*Math.atan(Math.exp(y*Math.PI/180))-Math.PI/2)*180/Math.PI;
/** Fit geographic bounds once in the measured viewport. Native map margins must be zero:
 * passing the same overlay insets to both MapKit layoutMargins and its fit command
 * lets MapKit expand the camera twice. Preserve free manual zoom after this command.
 */
export function singaporeOverviewRegion(boundary:readonly Coordinate[],viewport:Viewport,padding:Padding){
 const {width,height}=viewport,availableWidth=width-padding.left-padding.right,availableHeight=height-padding.top-padding.bottom;
 if(!boundary.length||availableWidth<=0||availableHeight<=0)return null;
 const west=Math.min(...boundary.map(p=>p.longitude)),east=Math.max(...boundary.map(p=>p.longitude));
 const south=Math.min(...boundary.map(p=>mercatorY(p.latitude))),north=Math.max(...boundary.map(p=>mercatorY(p.latitude)));
 // Ten percent breathing room around the complete Tuas–Changi/Tekong land extent.
 const perPoint=Math.max((east-west)*1.1/availableWidth,(north-south)*1.1/availableHeight);
 const centerY=(north+south)/2+(padding.top-padding.bottom)*perPoint/2;
 const top=latitudeAt(centerY+height*perPoint/2),bottom=latitudeAt(centerY-height*perPoint/2);
 return {latitude:(top+bottom)/2,longitude:(west+east)/2+(padding.right-padding.left)*perPoint/2,latitudeDelta:top-bottom,longitudeDelta:width*perPoint};
}
