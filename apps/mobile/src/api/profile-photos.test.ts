import {listMyProfilePhotos,parseProfilePhotos} from './profile-photos';
const postId='00000000-0000-4000-8000-000000004201',mediaId='00000000-0000-4000-8000-000000004202';
const cursor={createdAt:'2026-09-13T01:00:00.123456+00:00',postId,position:0};
const photo={postId,mediaId,position:0,width:480,height:640,cursor};
it('reads a photo page directly with an opaque precise cursor and no owner argument',async()=>{
 const rpc=jest.fn().mockResolvedValue({data:[photo],error:null});
 expect(await listMyProfilePhotos(cursor,{rpc})).toEqual({items:[photo],nextCursor:null});
 expect(rpc).toHaveBeenCalledWith('list_my_community_photos',{p_cursor:cursor,p_limit:24});
});
it('keeps a full photo page resumable without converting timestamp precision',()=>{
 const rows=Array.from({length:24},(_,i)=>({...photo,mediaId:`00000000-0000-4000-8000-${String(4202+i).padStart(12,'0')}`}));
 expect(parseProfilePhotos(rows).nextCursor).toEqual(cursor);
});
it.each([null,{},[{...photo,path:'private/media'}],[{...photo,width:0}],[{...photo,position:6}],[{...photo,cursor:{...cursor,postId:mediaId}}],[photo,photo]])('rejects malformed or duplicate photo results %#',(data)=>{
 expect(()=>parseProfilePhotos(data)).toThrow('invalid_profile_photos');
});
it('reports read failure instead of a false empty album',async()=>{
 await expect(listMyProfilePhotos(null,{rpc:async()=>({data:null,error:{message:'private trace'}})})).rejects.toThrow('profile_photos_unavailable');
});
it('rejects an invalid cursor before any network request',async()=>{
 const rpc=jest.fn();await expect(listMyProfilePhotos({...cursor,position:-1},{rpc})).rejects.toThrow('invalid_profile_photos');expect(rpc).not.toHaveBeenCalled();
});
