import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {createSocialDraft, editSocialDraft, freezeSocialDraft, type SocialImage} from './post-draft';
import {createSocialDraftStore, initializeSocialDatabase, SOCIAL_DRAFT_SCHEMA, type SocialDatabase} from './post-draft-storage';

const {DatabaseSync}=createRequire(__filename)('node:sqlite');
const owner='00000000-0000-4000-8000-000000004011', other='00000000-0000-4000-8000-000000004012', id='00000000-0000-4000-8000-000000004013', rid='00000000-0000-4000-8000-000000004014';
const now='2026-09-11T00:00:00.000Z';
const thumb=new Uint8Array([1,2,3]),display=new Uint8Array([4,5,6,7]);
const sha=async(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
function setup(){
 const sqlite=new DatabaseSync(':memory:');sqlite.exec(SOCIAL_DRAFT_SCHEMA);
 const db:SocialDatabase={execAsync:async sql=>sqlite.exec(sql),runAsync:async(sql,...args)=>{const r=sqlite.prepare(sql).run(...args);return {changes:Number(r.changes)};},getFirstAsync:async(sql,...args)=>sqlite.prepare(sql).get(...args)??null,getAllAsync:async(sql,...args)=>sqlite.prepare(sql).all(...args),withExclusiveTransactionAsync:async job=>{sqlite.exec('BEGIN');try{await job(db);sqlite.exec('COMMIT');}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
 return {sqlite,db,store:createSocialDraftStore(async()=>db,sha)};
}
async function photo():Promise<SocialImage>{return {id:rid,requestId:other,thumb:{width:100,height:100,byteLength:thumb.length,sha256:await sha(thumb)},display:{width:400,height:400,byteLength:display.length,sha256:await sha(display)}};}

it('refuses plaintext SQLite instead of silently storing private images without encryption',async()=>{
 const {db,sqlite}=setup();
 await expect(initializeSocialDatabase(db)).rejects.toThrow('encrypted_social_storage_unavailable');
 sqlite.close();
});

it('atomically persists photo bytes and order, isolates owners, and cascades explicit deletion',async()=>{
 const {store,sqlite}=setup();const image=await photo();
 const draft=editSocialDraft(createSocialDraft(owner,id,rid,now),{body:'Retain this caption',images:[image]},now);
 const saved=await store.save(owner,draft,[{imageId:image.id,thumb,display}]);
 expect(saved.revision).toBe(1);
 expect((await store.read(owner,id))?.images).toEqual([image]);
 expect(await store.read(other,id)).toBeNull();expect(await store.list(other)).toEqual([]);
 await expect(store.readImage(other,id,image.id)).rejects.toThrow('social_image_unavailable');
 expect((await store.readImage(owner,id,image.id)).display).toEqual(display);
 await store.remove(other,id);expect(await store.read(owner,id)).not.toBeNull();
 await store.remove(owner,id);expect(await store.list(owner)).toEqual([]);
 expect(sqlite.prepare('SELECT count(*) AS n FROM social_images').get().n).toBe(0);sqlite.close();
});

it('rejects changed/missing bytes without persisting a partial draft',async()=>{
 const {store,sqlite}=setup();const image=await photo();const draft={...createSocialDraft(owner,id,rid,now),images:[image]};
 await expect(store.save(owner,draft,[{imageId:image.id,thumb,display:new Uint8Array([8,9,10,11])}])).rejects.toThrow('social_image_changed');
 expect(await store.read(owner,id)).toBeNull();
 await expect(store.save(owner,draft)).rejects.toThrow('social_image_unavailable');
 expect(await store.read(owner,id)).toBeNull();sqlite.close();
});

it('prevents stale autosave overwrites and prunes only images removed by the winning revision',async()=>{
 const {store,sqlite}=setup();const image=await photo();const saved=await store.save(owner,{...createSocialDraft(owner,id,rid,now),images:[image]},[{imageId:image.id,thumb,display}]);
 const newer=await store.save(owner,editSocialDraft(saved,{body:'Newest edit'},now));
 await expect(store.save(owner,editSocialDraft(saved,{body:'Late stale edit',images:[]},now))).rejects.toThrow('social_draft_conflict');
 expect((await store.read(owner,id))?.body).toBe('Newest edit');
 expect((await store.readImage(owner,id,image.id)).thumb).toEqual(thumb);
 await store.save(owner,editSocialDraft(newer,{images:[]},now));
 await expect(store.readImage(owner,id,image.id)).rejects.toThrow('social_image_unavailable');sqlite.close();
});

it('reopens only the matching pending attempt after a definitive expiry rejection, retaining local bytes',async()=>{
 const {store,sqlite}=setup();const image={...await photo(),mediaId:other};
 let saved=await store.save(owner,{...createSocialDraft(owner,id,rid,now),body:'Keep caption',communitySlug:'sg-clsz05',images:[image]},[{imageId:image.id,thumb,display}]);
 saved=await store.save(owner,freezeSocialDraft(saved,now));
 await expect(store.reopenExpired(owner,id,other,()=>other)).rejects.toThrow('social_draft_conflict');
 const reopened=await store.reopenExpired(owner,id,rid,()=>other);
 expect(reopened).toMatchObject({phase:'editing',body:'Keep caption',requestId:other});expect(reopened.images[0]?.mediaId).toBeUndefined();
 expect((await store.readImage(owner,id,image.id)).display).toEqual(display);sqlite.close();
});
