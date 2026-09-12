export function movePhoto<T>(items:readonly T[],from:number,to:number):readonly T[]{
 'worklet';
 if(!Number.isInteger(from)||!Number.isInteger(to)||from<0||from>=items.length||to<0||to>=items.length||from===to)return items;
 const next=[...items];const [item]=next.splice(from,1);next.splice(to,0,item!);return next;
}

export function photoDropIndex(from:number,dx:number,dy:number,width:number,height:number,count:number):number{
 'worklet';
 if(count<1||width<=0||height<=0||!Number.isFinite(dx)||!Number.isFinite(dy))return from;
 const x=(from%3)*width+dx,y=Math.floor(from/3)*height+dy;
 if(x < -width/2||x > width*2.5||y < -height/2||y > height*1.5)return from;
 return Math.min(count-1,Math.max(0,Math.min(1,Math.max(0,Math.round(y/height)))*3+Math.min(2,Math.max(0,Math.round(x/width)))));
}
