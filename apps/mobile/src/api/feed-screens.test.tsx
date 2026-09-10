import { act,fireEvent,render,waitFor } from '@testing-library/react-native';
const mockClient={rpc:jest.fn()};const mockFeed=jest.fn();const mockPlaces=jest.fn();const mockPresentations=jest.fn();const mockPush=jest.fn();const mockSubject=jest.fn();const mockSubscribe=jest.fn();const mockLocale={value:'en'};
jest.mock('./supabase',()=>({getSupabaseClient:()=>mockClient}));
jest.mock('./feed',()=>({listPublicSightings:(...args:unknown[])=>mockFeed(...args)}));
jest.mock('./sighting-places',()=>({getSightingPlaces:(...args:unknown[])=>mockPlaces(...args)}));
jest.mock('./cat-presentation',()=>({getCatPresentations:(...args:unknown[])=>mockPresentations(...args)}));
jest.mock('../auth/session-subject',()=>({readSessionSubjectStrict:()=>mockSubject(),subscribeSessionSubject:(fn:unknown)=>{mockSubscribe(fn);return ()=>{};}}));
jest.mock('expo-router',()=>({useRouter:()=>({push:mockPush}),useLocalSearchParams:()=>({})}));
jest.mock('../maps/NearbyMap',()=>{const {Text}=require('react-native');return{NearbyMap:()=> <Text>Apple map boundary</Text>};});
jest.mock('../i18n/LocaleContext',()=>({useLocale:()=>({locale:mockLocale.value})}));
import MapScreen from '../../app/(tabs)/map';
const row={sightingId:'00000000-0000-4000-8000-000000000101',animalId:'00000000-0000-4000-8000-000000000102',primaryAlias:'Pepper',verification:'reported',publicCellId:'896526add03ffff',timeBucket:'today',coverMediaId:null,cursor:'00000000-0000-4000-8000-000000000101'};
beforeEach(()=>{jest.clearAllMocks();mockLocale.value='en';mockSubject.mockResolvedValue(null);mockFeed.mockResolvedValue({items:[row],nextCursor:row.cursor});mockPlaces.mockResolvedValue(new Map([[row.sightingId,{residenceType:'hdb',residenceName:'Block 123 Test Street'}]]));mockPresentations.mockResolvedValue(new Map());});
it('switches the actual stored sample name in an already open map sheet',async()=>{
 mockFeed.mockResolvedValue({items:[{...row,animalId:'00000000-0000-4000-8000-00000000a107',primaryAlias:'Mochi 麻糬 测试样本 S07'}],nextCursor:null});
 const view=await render(<MapScreen/>);
 await fireEvent.press(view.getByLabelText('Expand neighbourhood activity'));
 await fireEvent.press(await view.findByRole('button',{name:'Tampines, 1 cats'}));
 expect(view.getByText('Mochi')).toBeTruthy();expect(view.getByText('Test sample S07')).toBeTruthy();
 mockLocale.value='zh-CN';await view.rerender(<MapScreen/>);
 expect(view.getByText('麻糬')).toBeTruthy();expect(view.getByText('测试样本 S07')).toBeTruthy();
 expect(view.queryByText('Mochi 麻糬 测试样本 S07')).toBeNull();await view.unmount();
});
it('connects a Singapore community, building and cat to real routes',async()=>{
 const view=await render(<MapScreen/>);
 await fireEvent.press(view.getByLabelText('Expand neighbourhood activity'));
 await waitFor(()=>expect(view.getByText('1 cats · 55 planning areas')).toBeTruthy());
 await fireEvent.press(view.getByRole('button',{name:'Tampines, 1 cats'}));
 expect(view.getByText('HDB · Block 123 Test Street')).toBeTruthy();
 await fireEvent.press(view.getByText('Pepper'));expect(mockPush).toHaveBeenCalledWith(`/cat/${row.animalId}`);
 await fireEvent.press(view.getByText('Discuss'));expect(mockPush).toHaveBeenCalledWith('/community?communitySlug=tampines');
 expect(view.queryByText(row.publicCellId)).toBeNull();
 await view.unmount();
});
it('keeps filters hidden until the map filters action is opened and preserves map rendering',async()=>{
 const view=await render(<MapScreen/>);await waitFor(()=>expect(view.getByText('Neighbourhood cat activity')).toBeTruthy());
 expect(view.queryByText('North')).toBeNull();
 await fireEvent.press(view.getByLabelText('Map filters'));
 expect(view.getByText('North',{exact:true})).toBeTruthy();
 await fireEvent.press(view.getByRole('button',{name:'Show all Singapore'}));
 expect(view.getByText('Apple map boundary')).toBeTruthy();
 await view.unmount();
});
it('retains geography during a failed feed and retries without inventing sample cats',async()=>{
 mockFeed.mockRejectedValueOnce(new Error('offline'));const view=await render(<MapScreen/>);await fireEvent.press(view.getByLabelText('Expand neighbourhood activity'));
 await waitFor(()=>expect(view.getByText('Activity could not load. Tap to retry.')).toBeTruthy());
 expect(view.getByText('Activity not loaded')).toBeTruthy();expect(view.queryByText('Pepper')).toBeNull();
 await fireEvent.press(view.getByText('Activity could not load. Tap to retry.'));
 await waitFor(()=>expect(view.getByText('1 cats · 55 planning areas')).toBeTruthy());await view.unmount();
});
it('replaces map activity after pull refresh and retains it when the refresh fails',async()=>{
 const refreshed={...row,sightingId:'00000000-0000-4000-8000-000000000111',animalId:'00000000-0000-4000-8000-000000000112',primaryAlias:'New cat'};
 mockFeed.mockResolvedValueOnce({items:[row],nextCursor:null}).mockResolvedValueOnce({items:[refreshed],nextCursor:null}).mockRejectedValueOnce(new Error('offline'));
 const view=await render(<MapScreen/>);await fireEvent.press(view.getByLabelText('Expand neighbourhood activity'));await view.findByText('1 cats · 55 planning areas');
 await act(async()=>view.getByTestId('map-list').props.refreshControl.props.onRefresh());await view.findByText('1 cats · 55 planning areas');
 await fireEvent.press(view.getByRole('button',{name:'Tampines, 1 cats'}));expect(view.getByText('New cat')).toBeTruthy();
 await act(async()=>view.getByTestId('map-list').props.refreshControl.props.onRefresh());expect(view.getByText('New cat')).toBeTruthy();await view.unmount();
});
it('batches public portrait reads in groups of fifty',async()=>{
 const items=Array.from({length:51},(_,index)=>({...row,sightingId:`00000000-0000-4000-8000-${String(index+1000).padStart(12,'0')}`,animalId:`00000000-0000-4000-8000-${String(index+2000).padStart(12,'0')}`}));
 mockFeed.mockResolvedValue({items,nextCursor:null});mockPlaces.mockResolvedValue(new Map());
 const view=await render(<MapScreen/>);await fireEvent.press(view.getByLabelText('Expand neighbourhood activity'));
 await waitFor(()=>expect(mockPresentations).toHaveBeenCalledTimes(2));expect(mockPresentations.mock.calls.map(call=>call[0].length)).toEqual([50,1]);await view.unmount();
});
it('discards an old feed after an account change',async()=>{
 let resolveOld:(value:unknown)=>void=()=>{};
 mockFeed.mockImplementationOnce(()=>new Promise(resolve=>{resolveOld=resolve;}));
 const view=await render(<MapScreen/>);await fireEvent.press(view.getByLabelText('Expand neighbourhood activity'));await waitFor(()=>expect(mockFeed).toHaveBeenCalledTimes(1));
 mockFeed.mockResolvedValue({items:[],nextCursor:null});
 await act(async()=>{mockSubscribe.mock.calls[0]![0]('new-owner');});
 await waitFor(()=>expect(view.getByText('0 cats · 55 planning areas')).toBeTruthy());
 await act(async()=>resolveOld({items:[row],nextCursor:row.cursor}));
 expect(view.getByText('0 cats · 55 planning areas')).toBeTruthy();await view.unmount();
});
it('renders Chinese community discovery and report action',async()=>{
 mockLocale.value='zh-CN';const view=await render(<MapScreen/>);await fireEvent.press(view.getByLabelText('展开附近活动'));
 await waitFor(()=>expect(view.getByText('1 只猫 · 55 个规划区')).toBeTruthy());
 await fireEvent.press(view.getByRole('button',{name:'Tampines, 1 只猫'}));
 expect(view.getByText('最近延迟时段内有目击记录')).toBeTruthy();
 await fireEvent.press(view.getByText('报告目击'));expect(mockPush).toHaveBeenCalledWith('/report');await view.unmount();
});
