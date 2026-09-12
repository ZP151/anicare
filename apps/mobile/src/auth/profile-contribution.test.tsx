import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

const mockOwner = '00000000-0000-4000-8000-000000000901';
const mockInsert = jest.fn();
const mockUpdate = jest.fn();
const mockLookup = jest.fn();
const mockOtp = jest.fn();
const mockEq = jest.fn();
let mockLocale = 'en';
let mockSubject:string|null=mockOwner;let mockListener:()=>void=()=>{};const mockSignOut=jest.fn();const mockAdult=jest.fn();
jest.mock('./session-subject',()=>({readSessionSubjectStrict:async()=>mockSubject,subscribeSessionSubject:(f:()=>void)=>{mockListener=f;return()=>{};}}));
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: jest.fn(),push:jest.fn() }), useFocusEffect:(fn:any)=>require('react').useEffect(fn,[fn]), useLocalSearchParams: () => ({}) }));
jest.mock('../media/processor', () => ({ prepareAvatar: jest.fn(), discardAvatar: jest.fn() }));
jest.mock('../api/profile-avatar-upload', () => ({ uploadProfileAvatar: jest.fn() }));
jest.mock('expo-web-browser', () => ({ maybeCompleteAuthSession: jest.fn() }));
jest.mock('expo-linking', () => ({ createURL: () => 'animalhelper://auth/callback' }));
jest.mock('../api/supabase', () => ({ getSupabaseClient: () => ({
  auth: { getSession: async () => ({ data: { session: { user: { id: mockOwner, email: 'private-email@example.test' } } } }), signInWithOtp: mockOtp, signOut:mockSignOut },
  rpc:mockAdult,
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mockLookup }) }), update: mockUpdate, insert: mockInsert }),
}) }));
jest.mock('../offline/draft-store', () => ({}));
jest.mock('../i18n/LocaleContext', () => ({ useLocale: () => ({ locale: mockLocale, setLocale: jest.fn(), t: (key: string) => key }) }));
import Profile from '../../app/(tabs)/profile';

beforeEach(() => {
  jest.clearAllMocks(); mockLocale = 'en';mockSubject=mockOwner;mockAdult.mockResolvedValue({data:false,error:null});mockSignOut.mockResolvedValue({error:{message:'logoutfailed'}});
  mockEq.mockResolvedValue({ error: null });
  mockUpdate.mockReturnValue({ eq: mockEq });
  mockInsert.mockResolvedValue({ error: null });
  mockLookup.mockResolvedValue({ data: { id: mockOwner, public_name: 'Chosen name' }, error: null });
});

it('repeated adult confirmation updates eligibility without overwriting a chosen public name', async () => {
  const view = await render(<Profile />);
  await view.findByText(mockLocale==='zh-CN'?'已登录':'Signed in');
  await fireEvent.press(view.getByRole('button', { name: mockLocale==='zh-CN'?'我确认已年满 18 岁':'I confirm I am 18 or older' }));
  await waitFor(() => expect(view.getByText('18+ contributor confirmation recorded.')).toBeTruthy());
  expect(mockInsert).not.toHaveBeenCalled();
  expect(mockUpdate).toHaveBeenCalledWith({ locale: 'en', adult_confirmed_at: expect.any(String) });
  expect(mockEq).toHaveBeenCalledWith('id', mockOwner);
});

it.each([['en', 'Community contributor'], ['zh-CN', '社区贡献者']])('uses a fixed %s name for a new profile without deriving email', async (locale, name) => {
  mockLocale = locale; mockLookup.mockResolvedValue({ data: null, error: null });
  const view = await render(<Profile />);
  await view.findByText(mockLocale==='zh-CN'?'已登录':'Signed in');
  await fireEvent.press(view.getByRole('button', { name: mockLocale==='zh-CN'?'我确认已年满 18 岁':'I confirm I am 18 or older' }));
  await waitFor(() => expect(mockInsert).toHaveBeenCalledWith({ id: mockOwner, public_name: name, locale, adult_confirmed_at: expect.any(String) }));
  expect(JSON.stringify(mockInsert.mock.calls)).not.toContain('private-email');
});

it('uses a fixed localized message for remote confirmation errors', async () => {
  mockLocale = 'zh-CN'; mockLookup.mockResolvedValue({ data: null, error: { message: 'private token database error' } });
  const view = await render(<Profile />);
  await view.findByText(mockLocale==='zh-CN'?'已登录':'Signed in');
  await fireEvent.press(view.getByRole('button', { name: mockLocale==='zh-CN'?'我确认已年满 18 岁':'I confirm I am 18 or older' }));
  await waitFor(() => expect(view.getByText('暂时无法保存贡献者确认。请重试。')).toBeTruthy());
  expect(view.queryByText(/private token/)).toBeNull();
  expect(mockInsert).not.toHaveBeenCalled();
});

it('does not show the mail service error text', async () => {
  mockSubject = null;
  mockOtp.mockResolvedValue({ error: { message: 'private mail service trace' } });
  const view = await render(<Profile />);
  await view.findByText('Browsing anonymously');
  await fireEvent.press(view.getByRole('button', { name: 'Sign in' }));
  await fireEvent.changeText(view.getByLabelText('Email address'), 'person@example.test');
  await fireEvent.press(view.getByRole('button', { name: 'Send magic link' }));
  await waitFor(() => expect(mockOtp).toHaveBeenCalledTimes(1));
  expect(view.getByText('We could not send a sign-in link. Please try again.')).toBeTruthy();
  expect(JSON.stringify(view.toJSON())).not.toContain('private mail service trace');
});

it('keeps the signed-in profile focused on account actions instead of another login form', async () => {
  const view = await render(<Profile />);
  await view.findByText('Signed in');
  expect(view.queryByLabelText('Email address')).toBeNull();
  expect(view.queryByText('Continue with Apple')).toBeNull();
  expect(view.queryByText('AI training consent')).toBeNull();
  await fireEvent.press(view.getByRole('button',{name:'Settings'}));
  expect(view.getByRole('button', { name: 'My care records' })).toBeTruthy();
});

it('edits only the current account public name and shows the saved value', async () => {
  const view = await render(<Profile />);
  await view.findByText('Signed in');
  await fireEvent.press(view.getByRole('button', { name: 'Edit profile' }));
  await waitFor(() => expect(view.getByLabelText('Public display name').props.value).toBe('Chosen name'));
  await fireEvent.changeText(view.getByLabelText('Public display name'), 'Neighbour');
  await fireEvent.press(view.getByRole('button', { name: 'Save profile' }));
  await view.findByText('Profile saved.');
  expect(mockUpdate).toHaveBeenCalledWith({ public_name: 'Neighbour' });
  expect(mockEq).toHaveBeenCalledWith('id', mockOwner);
});
it('saves an explicitly selected neighbourhood with the name, displays it and preserves it on reopen',async()=>{
 const view=await render(<Profile/>);await view.findByText('Chosen name');await fireEvent.press(view.getByRole('button',{name:'Edit profile'}));await view.findByLabelText('Public display name');
 await fireEvent.press(view.getByRole('button',{name:'Choose neighbourhood'}));await fireEvent.changeText(view.getByLabelText('Search neighbourhood'),'West Coast');
 await fireEvent.press(view.getByRole('radio',{name:'West Coast'}));
 expect(mockUpdate).not.toHaveBeenCalled();await fireEvent.changeText(view.getByLabelText('Public display name'),'Neighbour');
 await fireEvent.press(view.getByRole('button',{name:'Save profile'}));await view.findByText('Profile saved.');
 expect(mockUpdate).toHaveBeenCalledWith({public_name:'Neighbour',neighbourhood_id:'sg-clsz05'});expect(view.getByText('West Coast')).toBeTruthy();
 mockLookup.mockResolvedValue({data:{public_name:'Neighbour',neighbourhood_id:'sg-clsz05'},error:null});await fireEvent.press(view.getByRole('button',{name:'Edit profile'}));
 await view.findByRole('button',{name:'Neighbourhood: West Coast'});await view.unmount();
});
it('cancels neighbourhood edits without a write and clears a saved selection explicitly',async()=>{
 mockLookup.mockResolvedValue({data:{public_name:'Chosen name',neighbourhood_id:'sg-clsz05'},error:null});
 const view=await render(<Profile/>);await view.findByText('West Coast');await fireEvent.press(view.getByRole('button',{name:'Edit profile'}));
 await view.findByRole('button',{name:'Neighbourhood: West Coast'});await fireEvent.press(view.getByRole('button',{name:'Clear neighbourhood'}));
 await fireEvent.press(view.getByRole('button',{name:'Close edit'}));expect(mockUpdate).not.toHaveBeenCalled();expect(view.getByText('West Coast')).toBeTruthy();
 await fireEvent.press(view.getByRole('button',{name:'Edit profile'}));await view.findByRole('button',{name:'Neighbourhood: West Coast'});
 await fireEvent.press(view.getByRole('button',{name:'Clear neighbourhood'}));await fireEvent.press(view.getByRole('button',{name:'Save profile'}));await view.findByText('Profile saved.');
 expect(mockUpdate).toHaveBeenCalledWith({public_name:'Chosen name',neighbourhood_id:null});expect(view.queryByText('West Coast')).toBeNull();await view.unmount();
});
it('keeps failed profile edits available for retry and clears the neighbourhood on sign-out',async()=>{
 mockLookup.mockResolvedValue({data:{public_name:'Chosen name',neighbourhood_id:'sg-clsz05'},error:null});mockEq.mockResolvedValueOnce({error:{message:'private database error'}});
 const view=await render(<Profile/>);await view.findByText('West Coast');await fireEvent.press(view.getByRole('button',{name:'Edit profile'}));await view.findByLabelText('Public display name');
 await fireEvent.press(view.getByRole('button',{name:'Save profile'}));await view.findByText('Could not save your profile. Try again.');expect(view.getByRole('button',{name:'Neighbourhood: West Coast'})).toBeTruthy();
 await act(async()=>{mockSubject=null;mockListener();});await view.findByText('Browsing anonymously');expect(view.queryByText('West Coast')).toBeNull();await view.unmount();
});

it('discards an account name response after signing out', async () => {
  let finish!: (value: unknown) => void;
  mockLookup.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const view = await render(<Profile />);
  await view.findByText('Signed in');
  await fireEvent.press(view.getByRole('button', { name: 'Edit profile' }));
  await waitFor(() => expect(mockLookup).toHaveBeenCalled());
  await act(async () => { mockSubject = null; mockListener(); finish({data:{public_name:'Previous private name'},error:null}); });
  await view.findByText('Browsing anonymously');
  expect(JSON.stringify(view.toJSON())).not.toContain('Previous private name');
  expect(view.queryByLabelText('Public display name')).toBeNull();
});

it('reveals email sign-in on request and clears it when the account changes', async () => {
  mockSubject = null;
  const view = await render(<Profile />);
  await view.findByText('Browsing anonymously');
  expect(view.queryByLabelText('Email address')).toBeNull();
  await fireEvent.press(view.getByRole('button', { name: 'Sign in' }));
  await fireEvent.changeText(view.getByLabelText('Email address'), 'person@example.test');
  await act(async () => { mockSubject = mockOwner; mockListener(); });
  await view.findByText('Signed in');
  expect(view.queryByLabelText('Email address')).toBeNull();
  expect(view.queryByDisplayValue('person@example.test')).toBeNull();
});

it('shows truthful session/adult state, keeps login on failed logout and clears after successful logout',async()=>{
 const view=await render(<Profile/>);await view.findByText('Signed in');await view.findByText('18+ confirmation required');await fireEvent.press(view.getByRole('button',{name:'Settings'}));
 await fireEvent.press(view.getByRole('button',{name:'Sign out'}));await view.findByText('Could not sign out. Your session is still active.');expect(view.getByText('Signed in')).toBeTruthy();
 mockSignOut.mockImplementation(async()=>{mockSubject=null;mockListener();return {error:null};});
 await fireEvent.press(view.getByRole('button',{name:'Sign out'}));await view.findByText('Browsing anonymously');expect(view.queryByText('Signed in')).toBeNull();
});
it('does not apply delayed adult status from a previous account',async()=>{
 let finish!:(x:unknown)=>void;mockAdult.mockImplementationOnce(()=>new Promise(r=>{finish=r;}));
 const view=await render(<Profile/>);await waitFor(()=>expect(mockAdult).toHaveBeenCalled());
 await act(async()=>{mockSubject=null;mockListener();finish({data:true,error:null});});await view.findByText('Browsing anonymously');expect(view.queryByText('18+ contributor confirmed')).toBeNull();
});

it('keeps profile editing out of Settings and removes the redundant Reports shortcut',async()=>{
 const view=await render(<Profile/>);await view.findByText('Chosen name');
 expect(view.queryByRole('button',{name:'Reports'})).toBeNull();
 await fireEvent.press(view.getByRole('button',{name:'Edit profile'}));
 await view.findByLabelText('Public display name');
 expect(view.getByRole('button',{name:'Change avatar'})).toBeTruthy();
 await fireEvent.press(view.getByRole('button',{name:'Close edit'}));
 await fireEvent.press(view.getByRole('button',{name:'Settings'}));
 expect(view.queryByRole('button',{name:'Display name'})).toBeNull();
 expect(view.queryByRole('button',{name:'Avatar'})).toBeNull();
});
