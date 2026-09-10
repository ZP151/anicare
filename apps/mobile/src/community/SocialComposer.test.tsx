import {act,fireEvent,render,waitFor} from '@testing-library/react-native';
const mockOwnerId='00000000-0000-4000-8000-000000004211',mockDraftId='00000000-0000-4000-8000-000000004212';
let mockOwner:string|null=mockOwnerId;
let mockSaved:any;
const mockSave=jest.fn(async(_owner:string,value:any)=>{mockSaved={...value,revision:value.revision+1};return mockSaved;});
const mockBack=jest.fn(),mockReplace=jest.fn(),mockDispose=jest.fn(),mockPublish=jest.fn();
jest.mock('expo-crypto',()=>({randomUUID:()=> '00000000-0000-4000-8000-000000004213'}));
jest.mock('../auth/use-account-session',()=>({useAccountSession:()=>({owner:mockOwner,failed:false,reload:jest.fn(),pin:()=>async()=>true})}));
jest.mock('../i18n/LocaleContext',()=>({useLocale:()=>({locale:'en'})}));
jest.mock('expo-router',()=>({useLocalSearchParams:()=>({draftId:mockDraftId}),useRouter:()=>({canGoBack:()=>true,back:mockBack,replace:mockReplace,push:jest.fn()})}));
jest.mock('./post-draft-store',()=>({socialDraftStore:{read:async()=>mockSaved,save:(...args:any[])=>mockSave(...args as [string,any]),readImage:async()=>({thumb:new Uint8Array([1])})}}));
jest.mock('./post-images',()=>({createSocialPreviewScope:()=>({preview:()=> 'file:///preview.jpg',dispose:mockDispose}),selectSocialImages:async()=>[]}));
jest.mock('./post-transport',()=>({createSocialTransport:()=>({})}));
jest.mock('./post-publisher',()=>({publishSocialDraft:(...args:any[])=>mockPublish(...args)}));
import {SocialComposer} from './SocialComposer';
beforeEach(()=>{jest.clearAllMocks();mockOwner=mockOwnerId;mockSaved={schemaVersion:1,id:mockDraftId,ownerId:mockOwnerId,requestId:mockDraftId,title:'Saved caption',body:'Mochi beside the garden',communitySlug:'sg-clsz05',catId:null,images:[],phase:'editing',revision:1,updatedAt:'2026-09-11T00:00:00.000Z'};});
it('restores the draft and saves the latest text before closing',async()=>{
 const view=await render(<SocialComposer/>);await view.findByDisplayValue('Saved caption');
 await fireEvent.changeText(view.getByLabelText('Caption'),'Updated before leaving');await fireEvent.press(view.getByLabelText('Save and close'));
 await waitFor(()=>expect(mockBack).toHaveBeenCalled());expect(mockSaved.body).toBe('Updated before leaving');await view.unmount();
});
it('clears private text and preview scopes when signed out',async()=>{
 const view=await render(<SocialComposer/>);await view.findByDisplayValue('Saved caption');const disposals=mockDispose.mock.calls.length;
 mockOwner=null;await view.rerender(<SocialComposer/>);expect(view.queryByDisplayValue('Saved caption')).toBeNull();expect(mockDispose.mock.calls.length).toBeGreaterThan(disposals);await view.unmount();
});
it('keeps an uncertain publication recoverable and prevents double submission',async()=>{
 let reject:(reason:Error)=>void=()=>{};mockPublish.mockImplementation(()=>new Promise((_resolve,no)=>{reject=no;}));
 const view=await render(<SocialComposer/>);await view.findByDisplayValue('Saved caption');
 await fireEvent.press(view.getByLabelText('Post'));await fireEvent.press(view.getByLabelText('Post'));
 await waitFor(()=>expect(mockPublish).toHaveBeenCalledTimes(1));
 await act(async()=>{mockSaved={...mockSaved,phase:'publishing'};reject(new Error('network_lost'));});
 expect(await view.findByText('Confirming the previous attempt. Retry continues the same post.')).toBeTruthy();expect(mockReplace).not.toHaveBeenCalled();await view.unmount();
});
