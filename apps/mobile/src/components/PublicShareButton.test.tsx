import {fireEvent,render,waitFor} from '@testing-library/react-native';
import {Share} from 'react-native';
import {PublicShareButton} from './PublicShareButton';
it('shares only a public route and never arbitrary content or query parameters',async()=>{
 const share=jest.spyOn(Share,'share').mockResolvedValue({action:Share.sharedAction});
 const view=await render(<PublicShareButton kind="post" id="00000000-0000-4000-8000-000000000001" zh={false}/>);
 await fireEvent.press(view.getByLabelText('Share post'));
 await waitFor(()=>expect(share).toHaveBeenCalledWith({message:'Whisker Commons\nanimalhelper://community/00000000-0000-4000-8000-000000000001'}));
 await view.unmount();share.mockRestore();
});
it('does not create a share route for an invalid identity',async()=>{
 const share=jest.spyOn(Share,'share');
 const view=await render(<PublicShareButton kind="cat" id="bad?private=token" zh/>);
 await fireEvent.press(view.getByLabelText('分享猫主页'));expect(share).not.toHaveBeenCalled();await view.unmount();share.mockRestore();
});
