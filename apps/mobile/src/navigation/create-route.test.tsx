import {fireEvent,render} from '@testing-library/react-native';

const mockPush=jest.fn(),mockBack=jest.fn();
jest.mock('expo-router',()=>({useRouter:()=>({push:mockPush,back:mockBack})}));
jest.mock('../i18n/LocaleContext',()=>({useLocale:()=>({locale:'en'})}));
jest.mock('../design/native-colors',()=>({useNativeColors:()=>({actionPrimary:'#146',surface:'#fff',ink:'#111',muted:'#789'})}));
jest.mock('../components/ScreenScaffold',()=>({ScreenScaffold:({children,trailing}:{children:React.ReactNode;trailing:React.ReactNode})=><>{trailing}{children}</>}));
jest.mock('../components/AppIcon',()=>({AppIcon:()=>null}));
import CreateScreen from '../../app/create';

it('offers post, report, and post-draft destinations from the create sheet',async()=>{
 const view=await render(<CreateScreen/>);
 await fireEvent.press(view.getByRole('button',{name:'Share a post'}));
 expect(mockPush).toHaveBeenLastCalledWith('/community/new');
 await fireEvent.press(view.getByRole('button',{name:'Report a sighting'}));
 expect(mockPush).toHaveBeenLastCalledWith('/report');
 await fireEvent.press(view.getByRole('button',{name:'Post drafts'}));
 expect(mockPush).toHaveBeenLastCalledWith('/community/drafts');
 await view.unmount();
});
