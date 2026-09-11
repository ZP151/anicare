import {usesNativeLiquidTabs} from './native-tabs-policy';
it('retains the native glass bar on dotted iOS releases including the test device',()=>{
 for(const version of ['26.6.1','26.0',26,'27.1.2'])expect(usesNativeLiquidTabs('ios',version)).toBe(true);
 for(const version of ['18.6.1',18,'unknown'])expect(usesNativeLiquidTabs('ios',version)).toBe(false);
 expect(usesNativeLiquidTabs('android',36)).toBe(false);
 expect(usesNativeLiquidTabs('web','26.6.1')).toBe(false);
});
