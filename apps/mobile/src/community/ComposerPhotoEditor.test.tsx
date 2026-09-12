jest.mock('react-native-safe-area-context',()=>require('react-native-safe-area-context/jest/mock').default);
const mockEdit=jest.fn(),mockDispose=jest.fn();
jest.mock('./post-images',()=>({editSocialImage:(...args:unknown[])=>mockEdit(...args),createSocialPreviewScope:()=>({preview:()=> 'file:///edited-preview',dispose:mockDispose})}));
import {fireEvent,render,waitFor} from '@testing-library/react-native';
import {ComposerPhotoEditor} from './ComposerPhotoEditor';
const variant={width:600,height:400,byteLength:3,sha256:'a'.repeat(64)},image={id:'old',requestId:'old-request',display:variant,thumb:variant};
const prepared={image:{...image,id:'new'},bytes:{imageId:'new',thumb:new Uint8Array([1]),display:new Uint8Array([2])}};
beforeEach(()=>{jest.clearAllMocks();mockEdit.mockResolvedValue(prepared);});
it('previews edits without saving and writes new bytes only after Done',async()=>{
 const save=jest.fn(async()=>{});const v=await render(<ComposerPhotoEditor image={image} uri="file:///original" zh={false} onClose={jest.fn()} onSave={save}/>);
 await fireEvent.press(v.getByLabelText('Rotate photo'));await waitFor(()=>expect(mockEdit).toHaveBeenCalled());
 expect(save).not.toHaveBeenCalled();expect(v.getByLabelText('Photo edit preview').props.source.uri).toBe('file:///edited-preview');
 await fireEvent.press(v.getByLabelText('Save photo'));expect(save).toHaveBeenCalledWith(prepared);await v.unmount();
});
it('reset returns to the original and cancel never writes a changed photo',async()=>{
 const save=jest.fn(),close=jest.fn();const v=await render(<ComposerPhotoEditor image={image} uri="file:///original" zh={false} onClose={close} onSave={save}/>);
 await fireEvent.press(v.getByLabelText('Crop 1:1'));await waitFor(()=>expect(mockEdit).toHaveBeenCalled());
 await fireEvent.press(v.getByLabelText('Reset edits'));expect(v.getByLabelText('Photo edit preview').props.source.uri).toBe('file:///original');
 await fireEvent.press(v.getByLabelText('Close photo'));expect(close).toHaveBeenCalled();expect(save).not.toHaveBeenCalled();await v.unmount();expect(mockDispose).toHaveBeenCalled();
});
it('keeps the original usable after a processing failure',async()=>{
 mockEdit.mockRejectedValueOnce(new Error('disk_full'));const save=jest.fn();const v=await render(<ComposerPhotoEditor image={image} uri="file:///original" zh={false} onClose={jest.fn()} onSave={save}/>);
 await fireEvent.press(v.getByLabelText('Mirror photo'));await v.findByRole('alert');expect(v.getByLabelText('Photo edit preview').props.source.uri).toBe('file:///original');
 expect(save).not.toHaveBeenCalled();await v.unmount();
});
