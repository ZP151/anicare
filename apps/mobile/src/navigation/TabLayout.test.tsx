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
 const {View}=require('react-native');
 const Trigger=({children,...props}:any)=><View testID={`native-${props.name}`} {...props} onTabPress={()=>props.listeners?.tabPress?.({data:{isPrevented:true}})}>{children}</View>;
 Trigger.Icon=()=>null;Trigger.Label=()=>null;
 NativeTabs.Trigger=Trigger;NativeTabs.BottomAccessory=()=>{throw new Error('Create must not use a second row');};
 return {NativeTabs};
});
jest.mock('../i18n/LocaleContext',()=>({useLocale:()=>({locale:'en'})}));
jest.mock('../design/GlassSurface',()=>({GlassSurface:({children}:any)=><>{children}</>}));
jest.mock('react-native-safe-area-context',()=>({useSafeAreaInsets:()=>({bottom:34})}));
it('keeps native sliding selection and opens Create without selecting its action tab',async()=>{
 const descriptor=Object.getOwnPropertyDescriptor(Platform,'Version');
 Object.defineProperty(Platform,'Version',{configurable:true,value:'26.6.1'});
 try{
  const TabLayout=require('../../app/(tabs)/_layout').default;
  const view=await render(<TabLayout/>);
  const create=view.getByTestId('native-compose');
  expect(create.props.disabled).toBe(true);
  expect(create.props.role).toBe('search');
  await fireEvent(create,'tabPress');
  expect(mockPush).toHaveBeenCalledWith('/create');
  expect(view.getByTestId('native-map')).toBeTruthy();
  await view.unmount();
 }finally{if(descriptor)Object.defineProperty(Platform,'Version',descriptor);}
});
