export const MAX_SOCIAL_IMAGES = 6;
export const SOCIAL_DISPLAY_BYTES = 4 * 1024 * 1024;
export const SOCIAL_THUMB_BYTES = 512 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z0-9][a-z0-9-]{0,79}$/;
export type SocialVariant = Readonly<{sha256:string;byteLength:number;width:number;height:number}>;
export type SocialImage = Readonly<{id:string;requestId:string;thumb:SocialVariant;display:SocialVariant;mediaId?:string;upload?:Readonly<{jobId:string;expiresAt:string}>}>;
export type SocialDraft = Readonly<{schemaVersion:1;id:string;ownerId:string;requestId:string;title:string;body:string;communitySlug:string|null;catId:string|null;images:readonly SocialImage[];phase:'editing'|'publishing';revision:number;updatedAt:string}>;
export type SocialDraftEdit = Partial<Pick<SocialDraft,'title'|'body'|'communitySlug'|'catId'|'images'>>;
export function isSocialId(value:unknown):value is string {return typeof value==='string'&&UUID.test(value);}
function record(value:unknown):value is Record<string,unknown>{return !!value&&typeof value==='object'&&!Array.isArray(value);}
function keys(value:Record<string,unknown>,required:readonly string[],optional:readonly string[]=[]){return required.every(k=>Object.hasOwn(value,k))&&Object.keys(value).every(k=>required.includes(k)||optional.includes(k));}
function timestamp(value:unknown):value is string{return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(value)&&Number.isFinite(Date.parse(value));}
export function isSocialVariant(value:unknown,kind:'thumb'|'display'):value is SocialVariant {
  const max=kind==='thumb'?480:2048;
  return record(value)&&keys(value,['sha256','byteLength','width','height'])&&typeof value.sha256==='string'&&/^[a-f0-9]{64}$/.test(value.sha256)&&Number.isInteger(value.byteLength)&&Number(value.byteLength)>0&&Number(value.byteLength)<=(kind==='thumb'?SOCIAL_THUMB_BYTES:SOCIAL_DISPLAY_BYTES)&&Number.isInteger(value.width)&&Number(value.width)>0&&Number(value.width)<=max&&Number.isInteger(value.height)&&Number(value.height)>0&&Number(value.height)<=max;
}
export function parseSocialDraft(value:unknown,ownerId:string):SocialDraft {
  if(!isSocialId(ownerId)||!record(value)||!keys(value,['schemaVersion','id','ownerId','requestId','title','body','communitySlug','catId','images','phase','revision','updatedAt'])||value.schemaVersion!==1||!isSocialId(value.id)||!isSocialId(value.ownerId)||!isSocialId(value.requestId)||typeof value.title!=='string'||value.title.length>80||typeof value.body!=='string'||value.body.length>2000||(value.communitySlug!==null&&(typeof value.communitySlug!=='string'||!SLUG.test(value.communitySlug)))||(value.catId!==null&&!isSocialId(value.catId))||!Array.isArray(value.images)||value.images.length>MAX_SOCIAL_IMAGES||!['editing','publishing'].includes(String(value.phase))||!Number.isSafeInteger(value.revision)||Number(value.revision)<0||!timestamp(value.updatedAt))throw new Error('invalid_social_draft');
  if(value.ownerId!==ownerId)throw new Error('social_draft_owner_mismatch');
  const ids=new Set<string>(),requests=new Set<string>(),media=new Set<string>();
  for(const image of value.images){
    if(!record(image)||!keys(image,['id','requestId','thumb','display'],['mediaId','upload'])||!isSocialId(image.id)||!isSocialId(image.requestId)||!isSocialVariant(image.thumb,'thumb')||!isSocialVariant(image.display,'display')||(image.mediaId!==undefined&&!isSocialId(image.mediaId))||ids.has(image.id)||requests.has(image.requestId)||(image.mediaId!==undefined&&media.has(image.mediaId as string)))throw new Error('invalid_social_draft');
    if(image.upload!==undefined&&(!record(image.upload)||!keys(image.upload,['jobId','expiresAt'])||!isSocialId(image.upload.jobId)||!timestamp(image.upload.expiresAt)||(image.mediaId!==undefined&&image.mediaId!==image.upload.jobId)))throw new Error('invalid_social_draft');
    ids.add(image.id);requests.add(image.requestId);if(image.mediaId!==undefined)media.add(image.mediaId as string);
  }
  const draft=value as unknown as SocialDraft;
  if(draft.phase==='publishing')validateSocialPublication(draft);
  return draft;
}
export function createSocialDraft(ownerId:string,id:string,requestId:string,now:string):SocialDraft {
  return parseSocialDraft({schemaVersion:1,id,ownerId,requestId,title:'',body:'',communitySlug:null,catId:null,images:[],phase:'editing',revision:0,updatedAt:now},ownerId);
}
export function editSocialDraft(draft:SocialDraft,patch:SocialDraftEdit,now:string):SocialDraft {
  if(draft.phase!=='editing')throw new Error('social_publication_pending');
  if(!record(patch)||Object.keys(patch).some(k=>!['title','body','communitySlug','catId','images'].includes(k)))throw new Error('invalid_social_draft');
  return parseSocialDraft({...draft,...patch,updatedAt:now},draft.ownerId);
}
export function validateSocialPublication(draft:SocialDraft):void {
  if(!draft.body.trim()||(!draft.communitySlug&&!draft.catId))throw new Error('invalid_social_post');
  if(draft.images.some(image=>!image.mediaId))throw new Error('social_images_not_uploaded');
}
export function freezeSocialDraft(draft:SocialDraft,now:string):SocialDraft {
  validateSocialPublication(draft);
  return parseSocialDraft({...draft,phase:'publishing',updatedAt:now},draft.ownerId);
}
