import {fireEvent,render} from '@testing-library/react-native';
const mockPush=jest.fn(),mockNavigate=jest.fn();
jest.mock('expo-router',()=>({useRouter:()=>({push:mockPush})}));
jest.mock('../i18n/LocaleContext',()=>({useLocale:()=>({locale:'en'})}));
jest.mock('../design/native-colors',()=>({useNativeColors:()=>({actionPrimary:'#146',muted:'#789'})}));
jest.mock('expo-glass-effect',()=>({
 isLiquidGlassAvailable:()=>true,isGlassEffectAPIAvailable:()=>true,
 GlassView:(props:Record<string,unknown>)=>require('react').createElement(require('react-native').View,props),
}));
jest.mock('../components/AppIcon',()=>({AppIcon:()=>null}));
jest.mock('react-native-safe-area-context',()=>({useSafeAreaInsets:()=>({bottom:18})}));
import {CustomTabBar} from './CustomTabBar';

it('renders four destinations and opens the central create sheet',async()=>{
 const state={index:0,routes:[{key:'home',name:'index' as const},{key:'map',name:'map' as const},{key:'messages',name:'discuss' as const},{key:'me',name:'profile' as const}]};
 const view=await render(<CustomTabBar state={state} navigation={{navigate:mockNavigate}}/>);
 expect(view.getByLabelText('Main navigation').props.glassEffectStyle).toBe('regular');
 expect(view.getByRole('tab',{name:'Home'})).toBeTruthy();
 expect(view.getByRole('tab',{name:'Map'})).toBeTruthy();
 expect(view.getByRole('tab',{name:'Messages'})).toBeTruthy();
 expect(view.getByRole('tab',{name:'Me'})).toBeTruthy();
 await fireEvent.press(view.getByRole('button',{name:'Create'}));
 expect(mockPush).toHaveBeenCalledWith('/create');
 await fireEvent.press(view.getByRole('tab',{name:'Messages'}));
 expect(mockNavigate).toHaveBeenCalledWith('discuss');
 await view.unmount();
});
