jest.mock('react-native-safe-area-context',()=>require('react-native-safe-area-context/jest/mock').default);
import {act,fireEvent,render,waitFor} from '@testing-library/react-native';
const mockGet=jest.fn(),mockChange=jest.fn();let mockValid=true;
jest.mock('../api/story-cat-link',()=>({getMyStoryCatLink:(...a:unknown[])=>mockGet(...a),changeMyStoryCatLink:(...a:unknown[])=>mockChange(...a)}));
jest.mock('../api/cats',()=>({getPublicCatSummary:async(id:string)=>({animalId:id,primaryAlias:'Pepper'})}));
jest.mock('expo-crypto',()=>({randomUUID:()=> '00000000-0000-4000-8000-000000004630'}));
jest.mock('./CatPicker',()=>({CatPicker:({onConfirm}:any)=>{const React=require('react'),{Pressable,Text}=require('react-native');return React.createElement(Pressable,{accessibilityRole:'button',onPress:()=>onConfirm('00000000-0000-4000-8000-000000004611')},React.createElement(Text,null,'Select Pepper'));}}));
import {StoryCatLinkEditor} from './StoryCatLinkEditor';
const postId='00000000-0000-4000-8000-000000004601';const link={postId,catId:null,communitySlug:'bishan',revision:0};
const pin=()=>async()=>mockValid;
beforeEach(()=>{jest.clearAllMocks();mockValid=true;mockGet.mockResolvedValue(link);mockChange.mockResolvedValue({...link,catId:'00000000-0000-4000-8000-000000004611',revision:1});});
const props=()=>({postId,owner:'owner',pin,locale:'en' as const,onClose:jest.fn(),onChanged:jest.fn()});
it('selects without writing, then saves explicitly with original revision',async()=>{
 const p=props(),v=await render(<StoryCatLinkEditor {...p}/>);await fireEvent.press(await v.findByText('Choose cat'));await fireEvent.press(v.getByText('Select Pepper'));
 expect(mockChange).not.toHaveBeenCalled();await fireEvent.press(v.getByText('Save link'));await waitFor(()=>expect(p.onChanged).toHaveBeenCalled());
 expect(mockChange.mock.calls[0][0]).toMatchObject({postId,revision:0,catId:'00000000-0000-4000-8000-000000004611'});await v.unmount();
});
it('retries uncertain writes with exactly the same payload and key',async()=>{
 mockChange.mockRejectedValueOnce(new Error('story_link_write_uncertain'));
 const p=props(),v=await render(<StoryCatLinkEditor {...p}/>);await fireEvent.press(await v.findByText('Choose cat'));await fireEvent.press(v.getByText('Select Pepper'));await fireEvent.press(v.getByText('Save link'));
 await fireEvent.press(await v.findByText('Retry save'));await waitFor(()=>expect(p.onChanged).toHaveBeenCalled());
 expect(mockChange.mock.calls[1][0]).toEqual(mockChange.mock.calls[0][0]);await v.unmount();
});
it('reloads a conflicting revision and requires a new choice before saving again',async()=>{
 mockChange.mockRejectedValueOnce(new Error('story_link_conflict'));
 const p=props(),v=await render(<StoryCatLinkEditor {...p}/>);await fireEvent.press(await v.findByText('Choose cat'));await fireEvent.press(v.getByText('Select Pepper'));mockGet.mockResolvedValue({...link,revision:2});await fireEvent.press(v.getByText('Save link'));
 await v.findByText('This link changed on another device. Review it and choose again.');expect(v.getByRole('button',{name:'Save link'})).toBeDisabled();expect(p.onChanged).not.toHaveBeenCalled();await v.unmount();
});
it('drops a late successful write after the account pin changes',async()=>{
 let finish!:(v:unknown)=>void;mockChange.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
 const p=props(),v=await render(<StoryCatLinkEditor {...p}/>);await fireEvent.press(await v.findByText('Choose cat'));await fireEvent.press(v.getByText('Select Pepper'));await fireEvent.press(v.getByText('Save link'));mockValid=false;await act(async()=>finish(link));expect(p.onChanged).not.toHaveBeenCalled();expect(p.onClose).not.toHaveBeenCalled();await v.unmount();
});
it('cancelling performs no write',async()=>{const p=props(),v=await render(<StoryCatLinkEditor {...p}/>);await fireEvent.press(await v.findByText('Cancel'));expect(p.onClose).toHaveBeenCalled();expect(mockChange).not.toHaveBeenCalled();await v.unmount();});
