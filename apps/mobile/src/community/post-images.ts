import type {SocialImage} from './post-draft';
import type {SocialImageBytes} from './post-draft-storage';
export type PreparedSocialImage=Readonly<{image:SocialImage;bytes:SocialImageBytes}>;
export function sweepSocialImageCache():void {}
export async function selectSocialImages(_source:'camera'|'library',_remaining:number,_isCurrent:()=>boolean):Promise<PreparedSocialImage[]>{throw new Error('secure_media_processing_unavailable');}
export function createSocialPreviewScope():{preview(bytes:Uint8Array):string;dispose():void}{return {preview:()=>{throw new Error('secure_media_processing_unavailable');},dispose:()=>{}};}

export async function editSocialImage(_uri:string,_width:number,_height:number,_edit:import('./photo-edit').PhotoEdit,_current:()=>boolean):Promise<PreparedSocialImage>{throw new Error('secure_media_processing_unavailable');}
