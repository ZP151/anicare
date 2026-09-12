jest.mock('expo-image-manipulator',()=>({ImageManipulator:{manipulate:jest.fn()},SaveFormat:{JPEG:'jpeg'},FlipType:{Horizontal:'horizontal'}}));
jest.mock('expo-image-picker',()=>({requestCameraPermissionsAsync:jest.fn(),requestMediaLibraryPermissionsAsync:jest.fn(),launchCameraAsync:jest.fn(),launchImageLibraryAsync:jest.fn()}));
jest.mock('expo-crypto',()=>({randomUUID:()=> '00000000-0000-4000-8000-000000004155'}));
jest.mock('expo-file-system',()=>({Paths:{cache:'file:///cache/'},File:jest.fn().mockImplementation(()=>({bytes:async()=>new Uint8Array([1,2,3])}))}));
jest.mock('../media/processor',()=>({prepareCommunityImage:jest.fn(),discardCommunityImage:jest.fn()}));
import * as Picker from 'expo-image-picker';
import {prepareCommunityImage,discardCommunityImage} from '../media/processor';
import {ImageManipulator} from 'expo-image-manipulator';
import {File} from 'expo-file-system';
import {editSocialImage,selectSocialImages} from './post-images.native';
beforeEach(()=>jest.clearAllMocks());
it('requests only the selected permission and does not launch after refusal',async()=>{
 jest.mocked(Picker.requestCameraPermissionsAsync).mockResolvedValue({granted:false} as never);
 await expect(selectSocialImages('camera',3,()=>true)).rejects.toThrow('camera_permission_required');
 expect(Picker.requestMediaLibraryPermissionsAsync).not.toHaveBeenCalled();expect(Picker.launchCameraAsync).not.toHaveBeenCalled();
});
it('treats picker dismissal as unchanged and bounds multi-selection',async()=>{
 jest.mocked(Picker.requestMediaLibraryPermissionsAsync).mockResolvedValue({granted:true} as never);
 jest.mocked(Picker.launchImageLibraryAsync).mockResolvedValue({canceled:true,assets:null});
 await expect(selectSocialImages('library',2,()=>true)).resolves.toEqual([]);
 expect(Picker.launchImageLibraryAsync).toHaveBeenCalledWith(expect.objectContaining({selectionLimit:2,orderedSelection:true,mediaTypes:['images']}));
 expect(prepareCommunityImage).not.toHaveBeenCalled();
});
it('removes processed temporary bytes when thumbnail preparation fails',async()=>{
 jest.mocked(Picker.requestMediaLibraryPermissionsAsync).mockResolvedValue({granted:true} as never);
 jest.mocked(Picker.launchImageLibraryAsync).mockResolvedValue({canceled:false,assets:[{uri:'file:///source'}]} as never);
 jest.mocked(prepareCommunityImage).mockResolvedValueOnce({uri:'file:///cache/display'} as never).mockRejectedValueOnce(new Error('processing_failed'));
 await expect(selectSocialImages('library',1,()=>true)).rejects.toThrow('processing_failed');
 expect(discardCommunityImage).toHaveBeenCalledWith('file:///cache/display');
});
it('does not open the picker after the account changes during permission request',async()=>{
 jest.mocked(Picker.requestCameraPermissionsAsync).mockResolvedValue({granted:true} as never);
 await expect(selectSocialImages('camera',1,()=>false)).rejects.toThrow('stale_account');
 expect(Picker.launchCameraAsync).not.toHaveBeenCalled();
});

function manipulator(){
 const rendered={saveAsync:jest.fn(async()=>({uri:'file:///cache/manipulated.jpg'})),release:jest.fn()};
 const context={rotate:jest.fn(),flip:jest.fn(),crop:jest.fn(),renderAsync:jest.fn(async()=>rendered),release:jest.fn()};
 jest.mocked(ImageManipulator.manipulate).mockReturnValue(context as never);
 const remove=jest.fn();jest.mocked(File).mockImplementation(()=>({exists:true,delete:remove,bytes:async()=>new Uint8Array([1,2,3])}) as never);
 return {context,rendered,remove};
}
it('renders rotation, mirror and crop then returns canonical bytes and clears temporary files',async()=>{
 const {context,rendered,remove}=manipulator();const variant={width:100,height:100,byteLength:3,sha256:'a'.repeat(64)};
 jest.mocked(prepareCommunityImage).mockResolvedValueOnce({...variant,uri:'file:///cache/display'} as never).mockResolvedValueOnce({...variant,uri:'file:///cache/thumb'} as never);
 const edited=await editSocialImage('file:///private-preview',1200,800,{turns:1,mirror:true,ratio:1},()=>true);
 expect(context.rotate).toHaveBeenCalledWith(90);expect(context.flip).toHaveBeenCalledWith('horizontal');expect(context.crop).toHaveBeenCalledWith({originX:0,originY:200,width:800,height:800});
 expect(edited.bytes.display).toEqual(new Uint8Array([1,2,3]));expect(edited.bytes.imageId).toBe(edited.image.id);
 expect(discardCommunityImage).toHaveBeenCalledWith('file:///cache/display',0,['file:///cache/display','file:///cache/thumb']);
 expect(remove).toHaveBeenCalledTimes(1);expect(context.release).toHaveBeenCalledTimes(1);expect(rendered.release).toHaveBeenCalledTimes(1);
});
it('discards a rendered edit when its owning screen closes before rendering completes',async()=>{
 const {context,remove}=manipulator();const current=jest.fn().mockReturnValueOnce(true).mockReturnValue(false);
 await expect(editSocialImage('file:///private-preview',100,100,{turns:1,mirror:false,ratio:null},current)).rejects.toThrow('stale_account');
 expect(prepareCommunityImage).not.toHaveBeenCalled();expect(remove).toHaveBeenCalledTimes(1);expect(context.release).toHaveBeenCalledTimes(1);
});
it('cleans a partial edit when canonical thumbnail processing fails',async()=>{
 const {remove}=manipulator();jest.mocked(prepareCommunityImage).mockResolvedValueOnce({uri:'file:///cache/display'} as never).mockRejectedValueOnce(new Error('thumbnail_failed'));
 await expect(editSocialImage('file:///private-preview',100,100,{turns:1,mirror:false,ratio:null},()=>true)).rejects.toThrow('thumbnail_failed');
 expect(discardCommunityImage).toHaveBeenCalledWith('file:///cache/display',0,['file:///cache/display']);expect(remove).toHaveBeenCalledTimes(1);
});
