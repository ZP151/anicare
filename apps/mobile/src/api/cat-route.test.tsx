import { act, render, waitFor } from '@testing-library/react-native';
const mockId = '00000000-0000-4000-8000-000000002599';
let mockParams = { id: mockId };
const mockRpc = jest.fn();
let mockAuthListener: () => void = () => {};
jest.mock('expo-router', () => ({ useLocalSearchParams: () => mockParams, useRouter: () => ({ push: jest.fn() }) }));
jest.mock('./supabase', () => ({ getSupabaseClient: () => ({ rpc: mockRpc }) }));
jest.mock('../auth/session-subject', () => ({ readSessionSubjectStrict: async () => null, subscribeSessionSubject: (listener: () => void) => { mockAuthListener = listener; return () => {}; } }));
jest.mock('../i18n/LocaleContext', () => ({ useLocale: () => ({ locale: 'en' }) }));
jest.mock('../offline/draft-store', () => ({ saveOfflineDraft: jest.fn() }));
jest.mock('../components/ScreenScaffold', () => {
 const React = require('react'); const { Text, View } = require('react-native');
 return { ScreenScaffold: ({title,children}: {title:string;children:React.ReactNode}) => React.createElement(View,null,React.createElement(Text,null,title),children) };
});
import CatRoute from '../../app/cat/[id]';
beforeEach(() => { mockParams = { id: mockId }; mockRpc.mockReset(); });
it('renders the actual profile from by-ID data even without a feed window or activity', async () => {
 mockRpc.mockResolvedValue({ data: [{ animalId: mockId, primaryAlias: 'Older cat', verification: 'reported', timeBucket: null }], error: null });
 const view = await render(<CatRoute />);
 expect(await view.findByText('Older cat')).toBeTruthy();
 expect(view.getByText('No public activity yet')).toBeTruthy();
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
