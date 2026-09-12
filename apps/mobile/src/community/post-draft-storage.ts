import {isSocialId, parseSocialDraft, type SocialDraft, type SocialImage} from './post-draft';

type Binding=string|number|null|Uint8Array;
export interface SocialExecutor {
 execAsync(sql:string):Promise<void>;
 runAsync(sql:string,...args:Binding[]):Promise<{changes:number}>;
 getFirstAsync<T>(sql:string,...args:Binding[]):Promise<T|null>;
 getAllAsync<T>(sql:string,...args:Binding[]):Promise<T[]>;
}
export interface SocialDatabase extends SocialExecutor {withExclusiveTransactionAsync(job:(tx:SocialExecutor)=>Promise<void>):Promise<void>;}
export type SocialImageBytes=Readonly<{imageId:string;thumb:Uint8Array;display:Uint8Array}>;
export const SOCIAL_DRAFT_SCHEMA=`PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS social_drafts (
 id TEXT PRIMARY KEY NOT NULL, owner_id TEXT NOT NULL, revision INTEGER NOT NULL,
 updated_at TEXT NOT NULL, payload_json TEXT NOT NULL, UNIQUE(id,owner_id)
);
CREATE INDEX IF NOT EXISTS social_drafts_owner ON social_drafts(owner_id,updated_at DESC,id);
CREATE TABLE IF NOT EXISTS social_images (
 draft_id TEXT NOT NULL, owner_id TEXT NOT NULL, image_id TEXT NOT NULL,
 thumb BLOB NOT NULL, display BLOB NOT NULL, metadata_json TEXT NOT NULL,
 PRIMARY KEY(draft_id,owner_id,image_id),
 FOREIGN KEY(draft_id,owner_id) REFERENCES social_drafts(id,owner_id) ON DELETE CASCADE
);`;
type Row={payload_json:string;revision:number};
type ImageRow={thumb:Uint8Array;display:Uint8Array;metadata_json:string};
export async function initializeSocialDatabase(db:SocialExecutor):Promise<void>{
 const cipher=await db.getFirstAsync<{cipher_version?:string}>('PRAGMA cipher_version;');
 if(typeof cipher?.cipher_version!=='string'||!cipher.cipher_version.trim())throw new Error('encrypted_social_storage_unavailable');
 await db.execAsync(SOCIAL_DRAFT_SCHEMA);
}
function identity(owner:string,id:string){if(!isSocialId(owner)||!isSocialId(id))throw new Error('invalid_social_draft');}
function fromRow(row:Row,owner:string):SocialDraft {const draft=parseSocialDraft(JSON.parse(row.payload_json),owner);if(draft.revision!==row.revision)throw new Error('invalid_social_draft');return draft;}
function mediaMetadata(image:SocialImage){return JSON.stringify({thumb:image.thumb,display:image.display});}
function publication(draft:SocialDraft){return JSON.stringify({title:draft.title,body:draft.body,catId:draft.catId,communitySlug:draft.communitySlug,requestId:draft.requestId,images:draft.images});}

/** SQLCipher owns encryption of both tables; image bytes and their draft commit together. */
export function createSocialDraftStore(getDatabase:()=>Promise<SocialDatabase>,sha256:(bytes:Uint8Array)=>Promise<string>){
 const read=async(owner:string,id:string):Promise<SocialDraft|null>=>{
  identity(owner,id);const db=await getDatabase();const row=await db.getFirstAsync<Row>('SELECT payload_json,revision FROM social_drafts WHERE id=? AND owner_id=?',id,owner);return row?fromRow(row,owner):null;
 };
 return {
  read,
  async list(owner:string):Promise<SocialDraft[]>{
   if(!isSocialId(owner))throw new Error('invalid_social_draft');const db=await getDatabase();const rows=await db.getAllAsync<Row>('SELECT payload_json,revision FROM social_drafts WHERE owner_id=? ORDER BY updated_at DESC,id',owner);return rows.map(row=>fromRow(row,owner));
  },
  async save(owner:string,input:SocialDraft,bytes:readonly SocialImageBytes[]=[]):Promise<SocialDraft>{
   const draft=parseSocialDraft(input,owner);const newIds=new Set<string>();
   bytes=bytes.map(item=>({imageId:item.imageId,thumb:new Uint8Array(item.thumb),display:new Uint8Array(item.display)}));
   for(const item of bytes){
    const image=draft.images.find(i=>i.id===item.imageId);
    if(!image||newIds.has(item.imageId)||item.thumb.byteLength!==image.thumb.byteLength||item.display.byteLength!==image.display.byteLength||await sha256(item.thumb)!==image.thumb.sha256||await sha256(item.display)!==image.display.sha256)throw new Error('social_image_changed');
    newIds.add(item.imageId);
   }
   const db=await getDatabase();const next={...draft,revision:draft.revision+1};
   await db.withExclusiveTransactionAsync(async tx=>{
    const previous=await tx.getFirstAsync<Row&{owner_id:string}>('SELECT payload_json,revision,owner_id FROM social_drafts WHERE id=?',draft.id);
    if(previous&&(previous.owner_id!==owner||previous.revision!==draft.revision)||!previous&&draft.revision!==0)throw new Error('social_draft_conflict');
    if(previous){const old=fromRow(previous,owner);if(old.phase==='publishing'&&(draft.phase!=='publishing'||publication(old)!==publication(draft)))throw new Error('social_publication_pending');}
    if(previous)await tx.runAsync('UPDATE social_drafts SET revision=?,updated_at=?,payload_json=? WHERE id=? AND owner_id=?',next.revision,next.updatedAt,JSON.stringify(next),next.id,owner);
    else await tx.runAsync('INSERT INTO social_drafts(id,owner_id,revision,updated_at,payload_json) VALUES(?,?,?,?,?)',next.id,owner,next.revision,next.updatedAt,JSON.stringify(next));
    for(const image of draft.images){
     const existing=await tx.getFirstAsync<{metadata_json:string}>('SELECT metadata_json FROM social_images WHERE draft_id=? AND owner_id=? AND image_id=?',draft.id,owner,image.id);
     if(existing){if(existing.metadata_json!==mediaMetadata(image))throw new Error('social_image_changed');continue;}
     const supplied=bytes.find(item=>item.imageId===image.id);if(!supplied)throw new Error('social_image_unavailable');
     await tx.runAsync('INSERT INTO social_images(draft_id,owner_id,image_id,thumb,display,metadata_json) VALUES(?,?,?,?,?,?)',draft.id,owner,image.id,supplied.thumb,supplied.display,mediaMetadata(image));
    }
    const stored=await tx.getAllAsync<{image_id:string}>('SELECT image_id FROM social_images WHERE draft_id=? AND owner_id=?',draft.id,owner);
    for(const item of stored)if(!draft.images.some(image=>image.id===item.image_id))await tx.runAsync('DELETE FROM social_images WHERE draft_id=? AND owner_id=? AND image_id=?',draft.id,owner,item.image_id);
   });
   return next;
  },
  async readImage(owner:string,id:string,imageId:string):Promise<SocialImageBytes>{
   identity(owner,id);if(!isSocialId(imageId))throw new Error('social_image_unavailable');
   const draft=await read(owner,id);const metadata=draft?.images.find(image=>image.id===imageId);if(!metadata)throw new Error('social_image_unavailable');
   const db=await getDatabase();const row=await db.getFirstAsync<ImageRow>('SELECT thumb,display,metadata_json FROM social_images WHERE draft_id=? AND owner_id=? AND image_id=?',id,owner,imageId);
   if(!row||row.metadata_json!==mediaMetadata(metadata)||row.thumb.byteLength!==metadata.thumb.byteLength||row.display.byteLength!==metadata.display.byteLength||await sha256(row.thumb)!==metadata.thumb.sha256||await sha256(row.display)!==metadata.display.sha256)throw new Error('social_image_changed');
   return {imageId,thumb:new Uint8Array(row.thumb),display:new Uint8Array(row.display)};
  },
  async remove(owner:string,id:string):Promise<void>{identity(owner,id);const db=await getDatabase();await db.runAsync('DELETE FROM social_drafts WHERE owner_id=? AND id=?',owner,id);},
  async removeEditing(owner:string,id:string):Promise<void>{identity(owner,id);const db=await getDatabase();const result=await db.runAsync("DELETE FROM social_drafts WHERE owner_id=? AND id=? AND json_extract(payload_json,'$.phase')='editing'",owner,id);if(result.changes!==1)throw new Error('social_draft_conflict');},
  async reopenExpired(owner:string,id:string,requestId:string,newId:()=>string):Promise<SocialDraft>{
   identity(owner,id);const db=await getDatabase();let result:SocialDraft|undefined;
   await db.withExclusiveTransactionAsync(async tx=>{
    const row=await tx.getFirstAsync<Row>('SELECT payload_json,revision FROM social_drafts WHERE id=? AND owner_id=?',id,owner);
    if(!row)throw new Error('social_draft_conflict');const previous=fromRow(row,owner);
    if(previous.phase!=='publishing'||previous.requestId!==requestId)throw new Error('social_draft_conflict');
    result=parseSocialDraft({...previous,phase:'editing',requestId:newId(),revision:previous.revision+1,images:previous.images.map(image=>{const {upload:_upload,mediaId:_media,...rest}=image;return {...rest,requestId:newId()};})},owner);
    await tx.runAsync('UPDATE social_drafts SET revision=?,payload_json=? WHERE id=? AND owner_id=?',result.revision,JSON.stringify(result),id,owner);
   });return result!;
  },
 };
}
export type SocialDraftStore=ReturnType<typeof createSocialDraftStore>;
