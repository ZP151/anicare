import {fireEvent,render,within} from '@testing-library/react-native';
import {Platform} from 'react-native';
const mockPush=jest.fn();
jest.mock('expo-router',()=>{
 const Tabs=({tabBar}:any)=>tabBar({state:{index:1,routes:['index','map','discuss','profile'].map(name=>({key:name,name}))},navigation:{navigate:jest.fn()}});
 Tabs.Screen=()=>null;
 return {Tabs,useRouter:()=>({push:mockPush})};
});
jest.mock('expo-router/unstable-native-tabs',()=>{
 const NativeTabs=({children}:any)=><>{children}</>;
 const Trigger=({children}:any)=><>{children}</>;
 Trigger.Icon=()=>null;Trigger.Label=()=>null;
 NativeTabs.Trigger=Trigger;NativeTabs.BottomAccessory=()=>null;
 return {NativeTabs};
});
jest.mock('../i18n/LocaleContext',()=>({useLocale:()=>({locale:'en'})}));
jest.mock('../design/GlassSurface',()=>({GlassSurface:({children}:any)=><>{children}</>}));
jest.mock('react-native-safe-area-context',()=>({useSafeAreaInsets:()=>({bottom:34})}));
it('keeps Create among the four destinations on iOS 26 instead of an accessory row',async()=>{
 const descriptor=Object.getOwnPropertyDescriptor(Platform,'Version');
 Object.defineProperty(Platform,'Version',{configurable:true,value:'26.6.1'});
 try{
  const TabLayout=require('../../app/(tabs)/_layout').default;
  const view=await render(<TabLayout/>);
  const create=view.getByRole('button',{name:'Create'});
  const row=create.parent!;
  expect(within(row).getAllByRole('tab').map(node=>node.props.accessibilityLabel)).toEqual(['Home','Map','Messages','Me']);
  await fireEvent.press(create);expect(mockPush).toHaveBeenCalledWith('/create');
  expect(view.getByRole('tab',{name:'Map'}).props.accessibilityState.selected).toBe(true);
  await view.unmount();
 }finally{if(descriptor)Object.defineProperty(Platform,'Version',descriptor);}
});
