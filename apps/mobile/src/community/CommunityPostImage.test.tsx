import {act,fireEvent,render,waitFor} from '@testing-library/react-native';
let mockOwner:string|null|undefined='owner-a';const mockSession=jest.fn();
jest.mock('../auth/use-account-session',()=>({useAccountSession:()=>({owner:mockOwner})}));
jest.mock('../api/supabase',()=>({getSupabaseClient:()=>({auth:{getSession:mockSession}})}));
jest.mock('../api/community-extras',()=>({communityMediaUrl:()=> 'https://example.test/functions/v1/community-media'}));
import {CommunityPostImage} from './CommunityPostImage';
const props={postId:'post',mediaId:'media',label:'Post photo',style:{width:120,height:120}};
beforeEach(()=>{mockOwner='owner-a';mockSession.mockReset();});
it('can retry an unavailable story photo without replacing it with a cat portrait',async()=>{
 mockOwner=null;const view=await render(<CommunityPostImage {...props} retryLabel="Retry story photo"/>);
 await fireEvent(view.getByLabelText('Post photo'),'error');
 await fireEvent.press(view.getByRole('button',{name:'Retry story photo'}));
 expect(view.getByLabelText('Post photo').props.source.uri).toContain('/community-media');
});
it('waits for the matching session and carries its bearer on every native image request',async()=>{
 mockSession.mockResolvedValue({data:{session:{user:{id:'owner-a'},access_token:'test-bearer'}},error:null});
 const view=await render(<CommunityPostImage {...props}/>);
 await waitFor(()=>expect(view.getByLabelText('Post photo').props.source).toMatchObject({cache:'reload',headers:{Authorization:'Bearer test-bearer'}}));await view.unmount();
});
it('never turns a failed authenticated session read into a guest request',async()=>{
 mockSession.mockRejectedValue(new Error('offline'));const view=await render(<CommunityPostImage {...props}/>);
 expect(view.getByLabelText('Post photo').props.source).toBeUndefined();await view.unmount();
});
it('ignores a previous account token arriving after account switching',async()=>{
 let finish:(value:unknown)=>void=()=>{};mockSession.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;})).mockResolvedValue({data:{session:null},error:null});
 const view=await render(<CommunityPostImage {...props}/>);mockOwner='owner-b';await view.rerender(<CommunityPostImage {...props}/>);
 await act(async()=>finish({data:{session:{user:{id:'owner-a'},access_token:'old'}},error:null}));expect(view.getByLabelText('Post photo').props.source).toBeUndefined();await view.unmount();
});
it('keeps a readable placeholder after a thumbnail load failure',async()=>{
 mockOwner=null;const view=await render(<CommunityPostImage {...props}/>);
 await fireEvent(view.getByLabelText('Post photo'),'error');
 expect(view.getByText('Photo unavailable')).toBeTruthy();expect(view.getByLabelText('Post photo')).toBeTruthy();await view.unmount();
});

it('sends the public gateway key for guest photos without impersonating an authenticated user',async()=>{
 const old=process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY='public-test-key';
 try {mockOwner=null;const view=await render(<CommunityPostImage {...props}/>);
 expect(view.getByLabelText('Post photo').props.source.headers).toEqual({apikey:'public-test-key'});await view.unmount();
 } finally {if(old===undefined)delete process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;else process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY=old;}
});
