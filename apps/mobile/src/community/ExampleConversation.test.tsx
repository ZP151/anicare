import {fireEvent,render,within} from '@testing-library/react-native';
const mockSend=jest.fn();let mockOwner='account-a',mockId='west-coast';
jest.mock('../api/direct-messages',()=>({sendDirectMessage:(...args:unknown[])=>mockSend(...args)}));
jest.mock('../auth/use-account-session',()=>({useAccountSession:()=>({owner:mockOwner})}));
jest.mock('../i18n/LocaleContext',()=>({useLocale:()=>({locale:'en'})}));
jest.mock('expo-router',()=>({useRouter:()=>({back:jest.fn(),canGoBack:()=>true}),useLocalSearchParams:()=>({id:mockId})}));
import {ExampleConversation} from './ExampleConversation';
beforeEach(()=>{jest.clearAllMocks();mockOwner='account-a';mockId='west-coast';});
it('offers a clearly labelled local writing example with a pinned input, without delivering a private message',async()=>{
 const view=await render(<ExampleConversation/>);
 expect(view.getByText('Sample conversation · practice only')).toBeTruthy();
 expect(within(view.getByTestId('screen-scroll')).queryByLabelText('Try a reply')).toBeNull();
 await fireEvent.changeText(view.getByLabelText('Try a reply'),'I found the water bowl.');
 await fireEvent.press(view.getByRole('button',{name:'Add practice reply'}));
 expect(view.getByText('I found the water bowl.')).toBeTruthy();
 expect(mockSend).not.toHaveBeenCalled();
 mockOwner='account-b';await view.rerender(<ExampleConversation/>);
 expect(view.queryByText('I found the water bowl.')).toBeNull();
 await view.unmount();
});
it('does not show the previous example draft after navigating to a different conversation',async()=>{
 const view=await render(<ExampleConversation/>);
 await fireEvent.changeText(view.getByLabelText('Try a reply'),'Old draft');
 mockId='clementi';await view.rerender(<ExampleConversation/>);
 expect(view.getByLabelText('Try a reply').props.value).toBe('');
 mockId='invalid';await view.rerender(<ExampleConversation/>);
 expect(view.queryByLabelText('Try a reply')).toBeNull();
 await view.unmount();
});
