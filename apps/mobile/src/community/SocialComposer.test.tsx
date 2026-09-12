import 'react-native-gesture-handler/jestSetup';
jest.mock('react-native-reanimated',()=>require('react-native-reanimated/mock'));
jest.mock('react-native-worklets',()=>({...require('react-native-worklets/src/mock'),scheduleOnRN:(fn:Function,...args:unknown[])=>fn(...args)}));
import {act,fireEvent,render,waitFor} from '@testing-library/react-native';
const mockOwnerId='00000000-0000-4000-8000-000000004211',mockDraftId='00000000-0000-4000-8000-000000004212';
let mockOwner:string|null=mockOwnerId;
let mockSaved:any;
let mockParams:any={draftId:mockDraftId};
const mockLocation=jest.fn(),mockReadImage=jest.fn(async()=>({thumb:new Uint8Array([1])}));
jest.mock('../maps/device-location',()=>({requestDeviceLocation:()=>mockLocation()}));
const mockSave=jest.fn(async(_owner:string,value:any)=>{mockSaved={...value,revision:value.revision+1};return mockSaved;});
const mockBack=jest.fn(),mockReplace=jest.fn(),mockDispose=jest.fn(),mockPublish=jest.fn();
jest.mock('expo-crypto',()=>({randomUUID:()=> '00000000-0000-4000-8000-000000004213'}));
jest.mock('../auth/use-account-session',()=>({useAccountSession:()=>({owner:mockOwner,failed:false,reload:jest.fn(),pin:()=>async()=>true})}));
jest.mock('../i18n/LocaleContext',()=>({useLocale:()=>({locale:'en'})}));
jest.mock('expo-router',()=>({useLocalSearchParams:()=>mockParams,useRouter:()=>({canGoBack:()=>true,back:mockBack,replace:mockReplace,push:jest.fn()})}));
jest.mock('./post-draft-store',()=>({socialDraftStore:{read:async()=>mockSaved,save:(...args:any[])=>mockSave(...args as [string,any]),readImage:(...args:any[])=>mockReadImage(...args as [])}}));
jest.mock('./post-images',()=>({createSocialPreviewScope:()=>({preview:()=> 'file:///preview.jpg',dispose:mockDispose}),selectSocialImages:async()=>[]}));
jest.mock('./post-transport',()=>({createSocialTransport:()=>({})}));
jest.mock('./post-publisher',()=>({publishSocialDraft:(...args:any[])=>mockPublish(...args)}));
import {State} from 'react-native-gesture-handler';
import {fireGestureHandler,getByGestureTestId} from 'react-native-gesture-handler/jest-utils';
import {SocialComposer} from './SocialComposer';
beforeEach(()=>{jest.clearAllMocks();mockParams={draftId:mockDraftId};mockLocation.mockResolvedValue({kind:'denied'});mockReadImage.mockResolvedValue({thumb:new Uint8Array([1])});mockOwner=mockOwnerId;mockSaved={schemaVersion:1,id:mockDraftId,ownerId:mockOwnerId,requestId:mockDraftId,title:'Saved caption',body:'Mochi beside the garden',communitySlug:'sg-clsz05',catId:null,images:[],phase:'editing',revision:1,updatedAt:'2026-09-11T00:00:00.000Z'};});
it('restores the draft and saves the latest text before closing',async()=>{
 const view=await render(<SocialComposer/>);await view.findByDisplayValue('Saved caption');
 await fireEvent.changeText(view.getByLabelText('Caption'),'Updated before leaving');await fireEvent.press(view.getByLabelText('Save and close'));
 await waitFor(()=>expect(mockBack).toHaveBeenCalled());expect(mockSaved.body).toBe('Updated before leaving');await view.unmount();
});
it('restores six photos, changes the cover and persists removal in that order',async()=>{
 const images=Array.from({length:6},(_,n)=>({id:`00000000-0000-4000-8000-00000000430${n}`,requestId:`00000000-0000-4000-8000-00000000440${n}`,thumb:{width:320,height:240,byteLength:100,sha256:'a'.repeat(64)},display:{width:1280,height:960,byteLength:400,sha256:'b'.repeat(64)}}));
 mockSaved={...mockSaved,images};const view=await render(<SocialComposer/>);await view.findByDisplayValue('Saved caption');
 expect(view.getAllByRole('button',{name:'Remove photo'})).toHaveLength(6);
 expect(view.getByTestId('composer-photos').props.style).toMatchObject({flexDirection:'row',flexWrap:'wrap'});
 expect(view.getAllByTestId('composer-photo-cell')).toHaveLength(6);
 await fireEvent.press(view.getAllByRole('button',{name:'Make cover'})[5]!);
 await fireEvent.press(view.getAllByRole('button',{name:'Remove photo'})[1]!);
 await fireEvent.press(view.getByLabelText('Save and close'));
 await waitFor(()=>expect(mockBack).toHaveBeenCalled());expect(mockSaved.images.map((image:any)=>image.id)).toEqual([5,1,2,3,4].map(n=>images[n]!.id));await view.unmount();
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

it('automatically resolves a new post neighbourhood without storing device coordinates',async()=>{
 mockParams={};mockLocation.mockResolvedValue({kind:'granted',latitude:1.315,longitude:103.764});
 const view=await render(<SocialComposer/>);
 await waitFor(()=>expect(mockLocation).toHaveBeenCalledTimes(1));
 await view.findByText('Clementi Central');
 await fireEvent.press(view.getByLabelText('Save and close'));
 await waitFor(()=>expect(mockBack).toHaveBeenCalled());
 expect(mockSaved.communitySlug).toBe('sg-clsz06');
 expect(JSON.stringify(mockSaved)).not.toMatch(/latitude|longitude/);
 await view.unmount();
});
it('does not replace an existing draft neighbourhood with a device fix',async()=>{
 const view=await render(<SocialComposer/>);await view.findByDisplayValue('Saved caption');
 expect(mockLocation).not.toHaveBeenCalled();await view.unmount();
});
it('keeps the other five thumbnails when one encrypted preview cannot be read',async()=>{
 mockSaved.images=Array.from({length:6},(_,i)=>({id:String(i)}));
 mockReadImage.mockRejectedValueOnce(new Error('read_failed'));
 const view=await render(<SocialComposer/>);
 await view.findByLabelText('Photo 6');
 expect(view.getAllByLabelText(/^Photo [2-6]$/)).toHaveLength(5);
 expect(view.getByRole('button',{name:'Retry photo 1'})).toBeTruthy();
 await fireEvent.press(view.getByRole('button',{name:'Retry photo 1'}));
 await view.findByLabelText('Photo 1');
 await view.unmount();
});

it('preserves a manual neighbourhood selected before a delayed GPS result',async()=>{
 mockParams={};let finish!:(v:unknown)=>void;mockLocation.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
 const view=await render(<SocialComposer/>);
 await fireEvent.press(await view.findByText('Finding your neighbourhood…'));
 await fireEvent.press(view.getByText('Hougang'));
 await act(async()=>{finish({kind:'granted',latitude:1.315,longitude:103.764});});
 await fireEvent.press(view.getByLabelText('Save and close'));
 await waitFor(()=>expect(mockBack).toHaveBeenCalled());expect(mockSaved.communitySlug).toBe('hougang');await view.unmount();
});
it('stops reading old-owner media if an in-flight preview fails after sign-out',async()=>{
 mockSaved.images=Array.from({length:6},(_,i)=>({id:String(i)}));
 let fail!:(e:Error)=>void;mockReadImage.mockImplementationOnce(()=>new Promise((_yes,no)=>{fail=no;}));
 const view=await render(<SocialComposer/>);await waitFor(()=>expect(mockReadImage).toHaveBeenCalledTimes(1));
 mockOwner=null;await view.rerender(<SocialComposer/>);
 await act(async()=>{fail(new Error('owner_changed'));});
 expect(mockReadImage).toHaveBeenCalledTimes(1);await view.unmount();
});


it('keeps six separate add-photo slots visible before any photo is selected',async()=>{
 const view=await render(<SocialComposer/>);await view.findByDisplayValue('Saved caption');
 expect(view.getAllByRole('button',{name:/Add photo to slot/})).toHaveLength(6);
 await view.unmount();
});

it('persists accessible photo reordering as the cover and upload order',async()=>{
 const images=Array.from({length:3},(_,n)=>({id:`00000000-0000-4000-8000-00000000430${n}`,requestId:`00000000-0000-4000-8000-00000000440${n}`,thumb:{width:320,height:240,byteLength:100,sha256:'a'.repeat(64)},display:{width:1280,height:960,byteLength:400,sha256:'b'.repeat(64)}}));
 mockSaved={...mockSaved,images};const view=await render(<SocialComposer/>);
 await fireEvent(await view.findByLabelText('Photo 1'),'accessibilityAction',{nativeEvent:{actionName:'increment'}});
 await fireEvent.press(view.getByLabelText('Save and close'));
 await waitFor(()=>expect(mockBack).toHaveBeenCalled());
 expect(mockSaved.images.map((image:any)=>image.id)).toEqual([images[1]!.id,images[0]!.id,images[2]!.id]);
 await view.unmount();
});


it.each([['drop',State.END,[5,0,1,2,3,4]],['cancel',State.CANCELLED,[0,1,2,3,4,5]]] as const)('handles a cross-row drag %s without losing photos',async(_name,end,want)=>{
 const images=Array.from({length:6},(_,n)=>({id:`00000000-0000-4000-8000-00000000430${n}`,requestId:`00000000-0000-4000-8000-00000000440${n}`,thumb:{width:320,height:240,byteLength:100,sha256:'a'.repeat(64)},display:{width:1280,height:960,byteLength:400,sha256:'b'.repeat(64)}}));
 mockSaved={...mockSaved,images};const view=await render(<SocialComposer/>);await view.findByLabelText('Photo 6');
 await fireEvent(view.getByTestId('composer-photos'),'layout',{nativeEvent:{layout:{width:324,height:300}}});
 const gesture=getByGestureTestId(`photo-drag-${images[5]!.id}`);
 expect(gesture.config).toMatchObject({activateAfterLongPress:280});
 expect(gesture.config.blocksHandlers).toContain(getByGestureTestId('composer-scroll').handlerTag);
 await act(async()=>fireGestureHandler(gesture,[
  {state:State.BEGAN,translationX:0,translationY:0},
  {state:State.ACTIVE,translationX:0,translationY:0},
  {state:State.ACTIVE,translationX:-224,translationY:-156},
  {state:end,translationX:-224,translationY:-156},
 ]));
 expect(view.getByTestId('screen-scroll').props.scrollEnabled).toBe(true);
 await fireEvent.press(view.getByLabelText('Save and close'));await waitFor(()=>expect(mockBack).toHaveBeenCalled());
 expect(mockSaved.images.map((image:any)=>image.id)).toEqual(want.map(n=>images[n]!.id));await view.unmount();
});
it('ignores an old photo move callback after sign-out',async()=>{
 mockSaved.images=[0,1].map(n=>({id:`00000000-0000-4000-8000-00000000430${n}`,requestId:`00000000-0000-4000-8000-00000000440${n}`,thumb:{width:320,height:240,byteLength:100,sha256:'a'.repeat(64)},display:{width:1280,height:960,byteLength:400,sha256:'b'.repeat(64)}}));
 const view=await render(<SocialComposer/>);const image=await view.findByLabelText('Photo 1');const lateMove=image.props.onAccessibilityAction;
 mockOwner=null;await view.rerender(<SocialComposer/>);const previous=JSON.stringify(mockSaved.images);
 await act(async()=>lateMove({nativeEvent:{actionName:'increment'}}));expect(JSON.stringify(mockSaved.images)).toBe(previous);expect(view.queryByTestId('composer-photos')).toBeNull();await view.unmount();
});
