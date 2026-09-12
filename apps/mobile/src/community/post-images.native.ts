import {ImageManipulator,SaveFormat,FlipType} from 'expo-image-manipulator';
import {photoEditPlan,type PhotoEdit} from './photo-edit';
import * as ImagePicker from 'expo-image-picker';
import {Directory,File,Paths} from 'expo-file-system';
import {randomUUID} from 'expo-crypto';
import {discardCommunityImage,prepareCommunityImage} from '../media/processor';
import {isSocialVariant,MAX_SOCIAL_IMAGES,type SocialVariant} from './post-draft';
import type {PreparedSocialImage} from './post-images';

let swept=false;
export function sweepSocialImageCache():void {
 if(swept)return;swept=true;
 try{for(const entry of new Directory(Paths.cache).list()){
  if(entry instanceof File&&entry.parentDirectory.uri===Paths.cache.uri&&/^animalhelper-social-(?:preview-)?[0-9a-f-]{36}\.jpg$/i.test(entry.name)&&entry.exists)entry.delete();
 }}catch{/* Scoped caches are retried on the next process launch. */}
}

/** Permissions are requested only in response to the corresponding user action. */
export async function selectSocialImages(source:'camera'|'library',remaining:number,isCurrent:()=>boolean):Promise<PreparedSocialImage[]>{
 sweepSocialImageCache();
 const limit=Math.min(MAX_SOCIAL_IMAGES,Math.floor(remaining));if(limit<1)return [];
 const permission=source==='camera'?await ImagePicker.requestCameraPermissionsAsync():await ImagePicker.requestMediaLibraryPermissionsAsync();
 if(!isCurrent())throw new Error('stale_account');
 if(!permission.granted)throw new Error(source==='camera'?'camera_permission_required':'library_permission_required');
 const result=source==='camera'?await ImagePicker.launchCameraAsync({mediaTypes:['images'],exif:false,quality:1}):await ImagePicker.launchImageLibraryAsync({mediaTypes:['images'],allowsMultipleSelection:true,selectionLimit:limit,orderedSelection:true,exif:false,quality:1});
 if(!isCurrent())throw new Error('stale_account');if(result.canceled)return [];
 const prepared:PreparedSocialImage[]=[];
 for(const asset of result.assets.slice(0,limit)){
  const temporary:string[]=[];
  try{
   const display=await prepareCommunityImage(asset.uri,'display');temporary.push(display.uri);
   if(!isCurrent())throw new Error('stale_account');
   const thumb=await prepareCommunityImage(display.uri,'thumb');temporary.push(thumb.uri);
   const metadata=(value:typeof thumb):SocialVariant=>({width:value.width,height:value.height,sha256:value.sha256,byteLength:value.byteLength});
   if(!isSocialVariant(metadata(thumb),'thumb')||!isSocialVariant(metadata(display),'display'))throw new Error('social_image_too_large');
   const thumbBytes=await new File(thumb.uri).bytes(),displayBytes=await new File(display.uri).bytes();
   if(!isCurrent())throw new Error('stale_account');
   const imageId=randomUUID();prepared.push({image:{id:imageId,requestId:randomUUID(),thumb:metadata(thumb),display:metadata(display)},bytes:{imageId,thumb:thumbBytes,display:displayBytes}});
  }finally{temporary.forEach(uri=>discardCommunityImage(uri));}
 }
 return prepared;
}

/** The caller disposes this scope on background, dismissal and owner changes. */
export function createSocialPreviewScope(){
 sweepSocialImageCache();
 const files:File[]=[];let disposed=false;
 return {
  preview(bytes:Uint8Array):string{
   if(disposed)throw new Error('social_preview_closed');
   const file=new File(Paths.cache,`animalhelper-social-preview-${randomUUID()}.jpg`);files.push(file);file.create({overwrite:false});file.write(bytes);return file.uri;
  },
  dispose(){disposed=true;for(const file of files){try{if(file.exists)file.delete();}catch{/* OS cache reclamation remains available. */}}files.length=0;},
 };
}

/** Re-render from this edit session's original; only the confirmed new asset enters the encrypted draft. */
export async function editSocialImage(uri:string,width:number,height:number,edit:PhotoEdit,current:()=>boolean):Promise<PreparedSocialImage>{
 if(!current())throw new Error('stale_account');
 const plan=photoEditPlan(width,height,edit),context=ImageManipulator.manipulate(uri);
 const temporary:string[]=[];let rendered:Awaited<ReturnType<typeof context.renderAsync>>|undefined;let manipulated:string|undefined;
 try{
  if(plan.rotation)context.rotate(plan.rotation);if(plan.mirror)context.flip(FlipType.Horizontal);if(plan.crop)context.crop(plan.crop);
  rendered=await context.renderAsync();const result=await rendered.saveAsync({format:SaveFormat.JPEG,compress:0.95});manipulated=result.uri;
  if(!current())throw new Error('stale_account');
  const display=await prepareCommunityImage(result.uri,'display');temporary.push(display.uri);
  if(!current())throw new Error('stale_account');
  const thumb=await prepareCommunityImage(display.uri,'thumb');temporary.push(thumb.uri);
  const metadata=(value:typeof thumb):SocialVariant=>({width:value.width,height:value.height,sha256:value.sha256,byteLength:value.byteLength});
  if(!isSocialVariant(metadata(thumb),'thumb')||!isSocialVariant(metadata(display),'display'))throw new Error('social_image_too_large');
  const thumbBytes=await new File(thumb.uri).bytes(),displayBytes=await new File(display.uri).bytes();
  if(!current())throw new Error('stale_account');
  const id=randomUUID();return {image:{id,requestId:randomUUID(),thumb:metadata(thumb),display:metadata(display)},bytes:{imageId:id,thumb:thumbBytes,display:displayBytes}};
 }finally{
  temporary.forEach(discardCommunityImage);
  if(manipulated){try{const file=new File(manipulated);if(file.exists)file.delete();}catch{/* A failed temporary write never replaces the draft. */}}
  rendered?.release();context.release();
 }
}
