import {act,fireEvent,render,waitFor} from '@testing-library/react-native';
import {Alert} from 'react-native';
import {ManagedDraftList} from './ManagedDraftList';
const items=[{id:'a',title:'Photo draft',detail:'One photo',updatedAt:'2026-09-13T00:00:00Z',kind:'photo' as const,canDelete:true},{id:'b',title:'Text draft',detail:'No photo',updatedAt:'2026-09-01T00:00:00Z',kind:'text' as const,canDelete:true},{id:'c',title:'Awaiting publication',detail:'Pending',updatedAt:'2026-09-12T00:00:00Z',kind:'pending' as const,canDelete:false}];
it('filters photos and lets long press enter selection',async()=>{
 const v=await render(<ManagedDraftList items={items} zh={false} onOpen={jest.fn()} onDelete={jest.fn()} isCurrent={async()=>true}/>);
 await fireEvent.press(v.getByLabelText('Filter photos'));expect(v.queryByText('Text draft')).toBeNull();
 await fireEvent(v.getByLabelText('Photo draft'),'longPress');expect(v.getByLabelText('Delete selected')).toBeTruthy();await v.unmount();
});
it('confirms a batch, excludes pending items and retains failed deletions',async()=>{
 let confirm:()=>void=()=>{};jest.spyOn(Alert,'alert').mockImplementation((_title,_message,buttons)=>{confirm=buttons![1]!.onPress as ()=>void;});
 const remove=jest.fn(async(id:string)=>{if(id==='b')throw new Error('locked');});
 const v=await render(<ManagedDraftList items={items} zh={false} onOpen={jest.fn()} onDelete={remove} isCurrent={async()=>true}/>);
 await fireEvent.press(v.getByText('Select'));await fireEvent.press(v.getByText('Select all'));await fireEvent.press(v.getByLabelText('Delete selected'));
 expect(remove).not.toHaveBeenCalled();await act(async()=>{confirm();});await waitFor(()=>expect(remove).toHaveBeenCalledTimes(2));
 expect(remove).not.toHaveBeenCalledWith('c');expect(v.queryByText('Photo draft')).toBeNull();expect(v.getByText('Text draft')).toBeTruthy();await v.unmount();jest.restoreAllMocks();
});

it('stops a batch after owner change and suppresses repeated confirmation dialogs',async()=>{
 let confirm!:()=>void;const alert=jest.spyOn(Alert,'alert').mockImplementation((_title,_message,buttons)=>{confirm=buttons![1]!.onPress as ()=>void;});
 const remove=jest.fn(),current=jest.fn().mockResolvedValueOnce(true).mockResolvedValue(false);
 const v=await render(<ManagedDraftList items={items} zh={false} onOpen={jest.fn()} onDelete={remove} isCurrent={current}/>);
 await fireEvent.press(v.getByText('Select'));await fireEvent.press(v.getByText('Select all'));
 await fireEvent.press(v.getByLabelText('Delete selected'));await fireEvent.press(v.getByLabelText('Delete selected'));expect(alert).toHaveBeenCalledTimes(1);
 await act(async()=>confirm());await waitFor(()=>expect(current).toHaveBeenCalledTimes(2));expect(remove).toHaveBeenCalledTimes(1);expect(v.getByRole('alert')).toBeTruthy();
 expect(v.getByText('Text draft')).toBeTruthy();await v.unmount();jest.restoreAllMocks();
});
it('keeps drafts when checking the active session fails',async()=>{
 let confirm!:()=>void;jest.spyOn(Alert,'alert').mockImplementation((_title,_message,buttons)=>{confirm=buttons![1]!.onPress as ()=>void;});const remove=jest.fn();
 const v=await render(<ManagedDraftList items={items} zh={false} onOpen={jest.fn()} onDelete={remove} isCurrent={async()=>{throw new Error('offline');}}/>);
 await fireEvent.press(v.getByText('Select'));await fireEvent.press(v.getByText('Select all'));await fireEvent.press(v.getByLabelText('Delete selected'));
 await act(async()=>confirm());await v.findByRole('alert');expect(remove).not.toHaveBeenCalled();expect(v.getByText('Photo draft')).toBeTruthy();await v.unmount();jest.restoreAllMocks();
});
