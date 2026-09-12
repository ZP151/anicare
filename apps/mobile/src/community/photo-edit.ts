export type PhotoEdit=Readonly<{turns:number;mirror:boolean;ratio:number|null}>;
export const ORIGINAL_EDIT:PhotoEdit={turns:0,mirror:false,ratio:null};
export function photoEditPlan(width:number,height:number,edit:PhotoEdit){
 if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0||!Number.isInteger(edit.turns)||edit.turns<0||edit.turns>3||typeof edit.mirror!=='boolean'||(edit.ratio!==null&&![1,0.75,4/3].includes(edit.ratio)))throw new Error('invalid_photo_edit');
 const w=edit.turns%2?height:width,h=edit.turns%2?width:height;
 const cw=edit.ratio===null?w:Math.min(w,h*edit.ratio),ch=edit.ratio===null?h:Math.min(h,w/edit.ratio);
 return {rotation:edit.turns*90,mirror:edit.mirror,crop:edit.ratio===null?null:{originX:Math.floor((w-cw)/2),originY:Math.floor((h-ch)/2),width:Math.max(1,Math.floor(cw)),height:Math.max(1,Math.floor(ch))}};
}
