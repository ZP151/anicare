import {photoEditPlan} from './photo-edit';
it('rotates dimensions before centered crop',()=>{
 expect(photoEditPlan(1200,800,{turns:1,mirror:true,ratio:1})).toEqual({rotation:90,mirror:true,crop:{originX:0,originY:200,width:800,height:800}});
});
it('keeps full frame for reset and bounds portrait crop',()=>{
 expect(photoEditPlan(1200,800,{turns:0,mirror:false,ratio:null}).crop).toBeNull();
 expect(photoEditPlan(1200,800,{turns:0,mirror:false,ratio:0.75}).crop).toEqual({originX:300,originY:0,width:600,height:800});
});
it.each([0,-1,NaN,Infinity])('rejects invalid dimensions %s',width=>{
 expect(()=>photoEditPlan(width,800,{turns:0,mirror:false,ratio:1})).toThrow();
});
