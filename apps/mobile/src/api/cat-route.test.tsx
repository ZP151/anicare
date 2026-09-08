import { act, render, waitFor } from '@testing-library/react-native';
const mockId = '00000000-0000-4000-8000-000000002599';
let mockParams = { id: mockId };
const mockRpc = jest.fn();
const mockPresentations = jest.fn();
jest.mock('./cat-presentation', () => ({getCatPresentations: (...args: unknown[]) => mockPresentations(...args)}));
const mockAuthListeners = new Set<() => void>();
const mockAuthListener = () => mockAuthListeners.forEach(listener => listener());
jest.mock('expo-router', () => ({ useLocalSearchParams: () => mockParams, useRouter: () => ({ push: jest.fn() }) }));
jest.mock('./supabase', () => ({ getSupabaseClient: () => ({ rpc: mockRpc }) }));
jest.mock('../auth/session-subject', () => ({ readSessionSubjectStrict: async () => null, subscribeSessionSubject: (listener: () => void) => { mockAuthListeners.add(listener); return () => {mockAuthListeners.delete(listener);}; } }));
jest.mock('../i18n/LocaleContext', () => ({ useLocale: () => ({ locale: 'en' }) }));
jest.mock('../offline/draft-store', () => ({ saveOfflineDraft: jest.fn() }));
jest.mock('../components/ScreenScaffold', () => {
 const React = require('react'); const { Text, View } = require('react-native');
 return { ScreenScaffold: ({title,children}: {title:string;children:React.ReactNode}) => React.createElement(View,null,React.createElement(Text,null,title),children) };
});
import CatRoute from '../../app/cat/[id]';
beforeEach(() => { mockAuthListeners.clear(); mockParams = { id: mockId }; mockRpc.mockReset(); mockPresentations.mockReset().mockResolvedValue(new Map()); });
it('renders the actual profile from by-ID data even without a feed window or activity', async () => {
 mockRpc.mockResolvedValue({ data: [{ animalId: mockId, primaryAlias: 'Older cat', verification: 'reported', timeBucket: null }], error: null });
 const view = await render(<CatRoute />);
 expect(await view.findByText('Older cat')).toBeTruthy();
 expect(view.getAllByText('No public activity yet').length).toBeGreaterThan(0);
 expect(mockRpc).toHaveBeenCalledTimes(1);
 expect(mockRpc).toHaveBeenCalledWith('get_public_cat_summary',{p_animal_id:mockId});
 expect(view.getByRole('button',{ name: 'Report a sighting of Older cat' })).toBeTruthy();
});
it('clears the old public profile on an account change and discards a stale response', async () => {
 let finish!: (value: unknown) => void;
 mockRpc.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })).mockResolvedValue({data:[],error:null});
 const view = await render(<CatRoute />);
 await act(async () => { mockAuthListener(); });
 await waitFor(() => expect(mockRpc).toHaveBeenCalledTimes(2));
 await act(async () => { finish({data:[{animalId:mockId,primaryAlias:'Stale cat',verification:'reported',timeBucket:null}],error:null}); });
 expect(await view.findByText('Cat profile unavailable')).toBeTruthy();
 expect(view.queryByText('Stale cat')).toBeNull();
});
it('clears the previous profile when navigating to an unavailable ID', async () => {
 mockRpc.mockResolvedValueOnce({data:[{animalId:mockId,primaryAlias:'Older cat',verification:'reported',timeBucket:null}],error:null}).mockResolvedValue({data:[],error:null});
 const view = await render(<CatRoute />);
 await view.findByText('Older cat');
 mockParams = {id:'00000000-0000-4000-8000-000000009999'};
 await view.rerender(<CatRoute />);
 expect(await view.findByText('Cat profile unavailable')).toBeTruthy();
 expect(view.queryByText('Older cat')).toBeNull();
});

it('discards a photo signing response after the account changes', async () => {
 let finish!: (value: Map<string, {portraitUri: string}>) => void;
 mockRpc.mockResolvedValueOnce({data:[{animalId:mockId,primaryAlias:'Test cat',verification:'reported',timeBucket:null}],error:null}).mockResolvedValue({data:[],error:null});
 mockPresentations.mockImplementationOnce(() => new Promise(resolve => {finish=resolve;}));
 const view=await render(<CatRoute/>);
 await view.findByText('Test cat');
 await act(async () => { mockAuthListener(); });
 await view.findByText('Cat profile unavailable');
 await act(async () => {finish(new Map([[mockId,{portraitUri:'https://example.test/stale'}]]));});
 expect(view.queryByText('Test cat')).toBeNull();
 expect(JSON.stringify(view.toJSON())).not.toContain('https://example.test/stale');
});
