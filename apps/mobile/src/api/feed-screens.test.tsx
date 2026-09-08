import { act,fireEvent,render,waitFor } from '@testing-library/react-native';
const mockClient={rpc:jest.fn()};const mockFeed=jest.fn();const mockPlaces=jest.fn();const mockPush=jest.fn();const mockSubject=jest.fn();const mockSubscribe=jest.fn();const mockLocale={value:'en'};
jest.mock('./supabase',()=>({getSupabaseClient:()=>mockClient}));
jest.mock('./feed',()=>({listPublicSightings:(...args:unknown[])=>mockFeed(...args)}));
jest.mock('./sighting-places',()=>({getSightingPlaces:(...args:unknown[])=>mockPlaces(...args)}));
jest.mock('../auth/session-subject',()=>({readSessionSubjectStrict:()=>mockSubject(),subscribeSessionSubject:(fn:unknown)=>{mockSubscribe(fn);return ()=>{};}}));
jest.mock('expo-router',()=>({useRouter:()=>({push:mockPush}),useLocalSearchParams:()=>({})}));
jest.mock('../maps/NearbyMap',()=>{const {Text}=require('react-native');return{NearbyMap:()=> <Text>Apple map boundary</Text>};});
jest.mock('../i18n/LocaleContext',()=>({useLocale:()=>({locale:mockLocale.value})}));
import MapScreen from '../../app/(tabs)/map';
const row={sightingId:'00000000-0000-4000-8000-000000000101',animalId:'00000000-0000-4000-8000-000000000102',primaryAlias:'Pepper',verification:'reported',publicCellId:'896526add03ffff',timeBucket:'today',coverMediaId:null,cursor:'00000000-0000-4000-8000-000000000101'};
beforeEach(()=>{jest.clearAllMocks();mockLocale.value='en';mockSubject.mockResolvedValue(null);mockFeed.mockResolvedValue({items:[row],nextCursor:row.cursor});mockPlaces.mockResolvedValue(new Map([[row.sightingId,{residenceType:'hdb',residenceName:'Block 123 Test Street'}]]));});
it('connects a Singapore community, building and cat to real routes',async()=>{
 const view=await render(<MapScreen/>);
 await waitFor(()=>expect(view.getByText('1 cats · 55 planning areas')).toBeTruthy());
 await fireEvent.press(view.getByRole('button',{name:'Tampines, 1 cats'}));
 expect(view.getByText('HDB · Block 123 Test Street')).toBeTruthy();
 await fireEvent.press(view.getByText('Pepper'));expect(mockPush).toHaveBeenCalledWith(`/cat/${row.animalId}`);
 await fireEvent.press(view.getByText('Discuss'));expect(mockPush).toHaveBeenCalledWith('/community?communitySlug=tampines');
 expect(JSON.stringify(view.toJSON())).not.toContain(row.publicCellId);
 await view.unmount();
});
it('filters by region and building and can switch to the list without requesting device location',async()=>{
 const view=await render(<MapScreen/>);await waitFor(()=>expect(view.getByText('1 cats · 55 planning areas')).toBeTruthy());
 await fireEvent.changeText(view.getByLabelText('Search community, cat or building'),'Block 123');expect(view.getByText('1 cats · 1 planning areas')).toBeTruthy();
 await fireEvent.press(view.getByText('North'));expect(view.getByText('No matching community, cat or building.')).toBeTruthy();
 await fireEvent.press(view.getByRole('button',{name:'Show all Singapore'}));expect(view.getByText('1 cats · 55 planning areas')).toBeTruthy();
 await fireEvent.press(view.getByRole('button',{name:'Toggle map and list'}));expect(view.queryByText('Apple map boundary')).toBeNull();
 await view.unmount();
});
it('retains geography during a failed feed and retries without inventing sample cats',async()=>{
 mockFeed.mockRejectedValueOnce(new Error('offline'));const view=await render(<MapScreen/>);
 await waitFor(()=>expect(view.getByText('Activity could not load. Tap to retry.')).toBeTruthy());
 expect(view.getByText('0 cats · 55 planning areas')).toBeTruthy();expect(view.queryByText('Pepper')).toBeNull();
 await fireEvent.press(view.getByText('Activity could not load. Tap to retry.'));
 await waitFor(()=>expect(view.getByText('1 cats · 55 planning areas')).toBeTruthy());await view.unmount();
});
it('discards an old feed after an account change',async()=>{
 let resolveOld:(value:unknown)=>void=()=>{};
 mockFeed.mockImplementationOnce(()=>new Promise(resolve=>{resolveOld=resolve;}));
 const view=await render(<MapScreen/>);await waitFor(()=>expect(mockFeed).toHaveBeenCalledTimes(1));
 mockFeed.mockResolvedValue({items:[],nextCursor:null});
 await act(async()=>{mockSubscribe.mock.calls[0]![0]('new-owner');});
 await waitFor(()=>expect(view.getByText('0 cats · 55 planning areas')).toBeTruthy());
 await act(async()=>resolveOld({items:[row],nextCursor:row.cursor}));
 expect(view.getByText('0 cats · 55 planning areas')).toBeTruthy();await view.unmount();
});
it('renders Chinese community discovery and report action',async()=>{
 mockLocale.value='zh-CN';const view=await render(<MapScreen/>);
 await waitFor(()=>expect(view.getByText('1 只猫 · 55 个规划区')).toBeTruthy());
 await fireEvent.press(view.getByRole('button',{name:'Tampines, 1 只猫'}));
 expect(view.getByText('最近延迟时段内有目击记录')).toBeTruthy();
 await fireEvent.press(view.getByText('报告目击'));expect(mockPush).toHaveBeenCalledWith('/report');await view.unmount();
});
