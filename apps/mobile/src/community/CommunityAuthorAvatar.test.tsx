import {render,fireEvent} from '@testing-library/react-native';
const mockPush=jest.fn();
jest.mock('expo-router',()=>({useRouter:()=>({push:mockPush})}));
import {CommunityAuthorAvatar} from './CommunityAuthorAvatar';
import {ProfileAvatar} from '../profile/ProfileAvatar';
jest.mock('../i18n/LocaleContext',()=>({useLocale:()=>({locale:'en'})}));
jest.mock('../profile/ProfileAvatar',()=>({ProfileAvatar:jest.fn(()=>null)}));

it('shows a bundled synthetic portrait only for its known fixture',async()=>{
 const view=await render(<CommunityAuthorAvatar id="00000000-0000-4000-8000-00000000c101" avatarKey="person"/>);
 expect(view.getByLabelText('Synthetic test neighbour avatar').props.source).toBeTruthy();
 await fireEvent.press(view.getByRole('button',{name:'View sample profile Mei'}));
 expect(mockPush).toHaveBeenCalledWith('/community/people/mei');
 await view.unmount();
});
it('keeps real author photos and presets separate from fixture display profiles',async()=>{
 const view=await render(<CommunityAuthorAvatar id="00000000-0000-4000-8000-000000004255" avatarKey="human-02" photoUri="https://example.test/real-avatar.jpg"/>);
 expect(view.queryByLabelText('Synthetic test neighbour avatar')).toBeNull();
 expect(view.queryByRole('button')).toBeNull();
 expect(jest.mocked(ProfileAvatar).mock.lastCall?.[0]).toEqual(expect.objectContaining({avatarKey:'human-02',photoUri:'https://example.test/real-avatar.jpg'}));
 await view.unmount();
});
