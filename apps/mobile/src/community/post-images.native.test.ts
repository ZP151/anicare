jest.mock('expo-image-picker',()=>({requestCameraPermissionsAsync:jest.fn(),requestMediaLibraryPermissionsAsync:jest.fn(),launchCameraAsync:jest.fn(),launchImageLibraryAsync:jest.fn()}));
jest.mock('expo-crypto',()=>({randomUUID:()=> '00000000-0000-4000-8000-000000004155'}));
jest.mock('expo-file-system',()=>({Paths:{cache:'file:///cache/'},File:jest.fn().mockImplementation(()=>({bytes:async()=>new Uint8Array([1,2,3])}))}));
jest.mock('../media/processor',()=>({prepareCommunityImage:jest.fn(),discardCommunityImage:jest.fn()}));
import * as Picker from 'expo-image-picker';
import {prepareCommunityImage,discardCommunityImage} from '../media/processor';
import {selectSocialImages} from './post-images.native';
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
