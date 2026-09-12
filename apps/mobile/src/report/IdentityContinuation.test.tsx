jest.mock('../api/cat-presentation',()=>({getCatPresentations:jest.fn(async()=>new Map())}));
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { IdentityContinuation } from './IdentityContinuation';

const sightingId = '12345678-1234-1234-1234-123456789abc';
const animalId = '87654321-1234-1234-1234-123456789abc';
const requestId = 'abcdef12-1234-1234-1234-123456789abc';

describe('IdentityContinuation', () => {
  it('serializes rapid first-choice presses before asynchronous owner checks finish', async () => {
    let release!: (value: boolean) => void;
    const ownerCheck = new Promise<boolean>((resolve) => { release = resolve; });
    const saveIntent = jest.fn(async (intent) => ({ intent, requestId }));
    const submit = jest.fn(async () => ({ status: 'tentative' }));
    const view = await render(<IdentityContinuation sightingId={sightingId} draft={null} locale="en" dependencies={{
      isOwner: () => ownerCheck, listPublicSightings: async () => ({ items: [], nextCursor: null }), saveIntent, submit,
    }} />);
    await fireEvent.press(view.getByRole('button', { name: 'Submit as a new cat' }));
    await fireEvent.press(view.getByRole('button', { name: 'Submit as a new cat' }));
    await act(async () => { release(true); });
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    expect(saveIntent).toHaveBeenCalledTimes(1);
  });

  it('does not display a successful result after the owner changes during submission', async () => {
    let owner = true;
    let resolve!: (value: { status: string }) => void;
    const submit = jest.fn(() => new Promise<{ status: string }>((done) => { resolve = done; }));
    const view = await render(<IdentityContinuation sightingId={sightingId} draft={null} locale="en" dependencies={{
      isOwner: async () => owner, listPublicSightings: async () => ({ items: [], nextCursor: null }),
      saveIntent: async (intent) => ({ intent, requestId }), submit,
    }} />);
    await fireEvent.press(view.getByRole('button', { name: 'Submit as a new cat' }));
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    await act(async () => { owner = false; resolve({ status: 'tentative' }); });
    expect(view.queryByText('The identity proposal is awaiting independent review.')).toBeNull();
  });
  it('adopts the durable request after a lost response and retries that same intent', async () => {
    const submit = jest.fn()
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce({ status: 'tentative' });
    const saveIntent = jest.fn(async (intent) => ({ intent, requestId }));
    const view = await render(<IdentityContinuation sightingId={sightingId} draft={null} locale="en" dependencies={{
      isOwner: async () => true,
      listPublicSightings: async () => ({ items: [{ sightingId, animalId, primaryAlias: 'Visible Cat', verification: 'reported', publicCellId: '8928308280fffff', timeBucket: 'today', coverMediaId: null, cursor: sightingId }], nextCursor: null }),
      saveIntent, submit,
    }} />);
    await waitFor(() => expect(view.getByRole('button', { name: 'Visible Cat' })).toBeTruthy());
    await fireEvent.press(view.getByRole('button', { name: 'Visible Cat' }));
    await waitFor(() => expect(view.getByRole('button', { name: 'Retry identity proposal' })).toBeTruthy());
    await fireEvent.press(view.getByRole('button', { name: 'Retry identity proposal' }));
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(2));
    expect(saveIntent).toHaveBeenCalledTimes(1);
    expect(submit.mock.calls).toEqual([
      [sightingId, { kind: 'existing', animalId }, requestId],
      [sightingId, { kind: 'existing', animalId }, requestId],
    ]);
  });

  it('does not submit after ownership changes before a selection starts', async () => {
    const submit = jest.fn();
    const view = await render(<IdentityContinuation sightingId={sightingId} draft={{ id: 'draft-12345678', notes: '', risk: 'normal', identityContinuation: { intent: { kind: 'new' }, requestId } }} locale="en" dependencies={{
      isOwner: async () => false, listPublicSightings: async () => ({ items: [], nextCursor: null }),
      saveIntent: async (intent) => ({ intent, requestId }), submit,
    }} />);
    await fireEvent.press(view.getByRole('button', { name: 'Retry identity proposal' }));
    expect(submit).not.toHaveBeenCalled();
  });

  it('stops after a durable save when the signed-in owner changes', async () => {
    let owner = true;
    const submit = jest.fn();
    const view = await render(<IdentityContinuation sightingId={sightingId} draft={null} locale="en" dependencies={{
      isOwner: async () => owner, listPublicSightings: async () => ({ items: [{ sightingId, animalId, primaryAlias: 'Visible Cat', verification: 'reported', publicCellId: '8928308280fffff', timeBucket: 'today', coverMediaId: null, cursor: sightingId }], nextCursor: null }),
      saveIntent: async (intent) => { owner = false; return { intent, requestId }; }, submit,
    }} />);
    await waitFor(() => expect(view.getByRole('button', { name: 'Visible Cat' })).toBeTruthy());
    await fireEvent.press(view.getByRole('button', { name: 'Visible Cat' }));
    await waitFor(() => expect(submit).not.toHaveBeenCalled());
  });
});

it('bounds the avatar choices to eight per page and preserves each selected cat identity',async()=>{
 const items=Array.from({length:20},(_,i)=>({sightingId,animalId:`00000000-0000-4000-8000-${String(i).padStart(12,'0')}`,primaryAlias:`Neighbour ${i}`,verification:'reported' as const,publicCellId:'8928308280fffff',timeBucket:'today' as const,coverMediaId:null,cursor:sightingId}));
 const submit=jest.fn(async()=>({status:'tentative'}));
 const view=await render(<IdentityContinuation sightingId={sightingId} draft={null} locale="en" dependencies={{isOwner:async()=>true,listPublicSightings:async()=>({items,nextCursor:null}),saveIntent:async intent=>({intent,requestId}),submit}}/>);
 await view.findByRole('button',{name:'Neighbour 0'});
 expect(view.getAllByTestId('identity-cat-bubble')).toHaveLength(8);
 expect(view.queryByRole('button',{name:'Neighbour 8'})).toBeNull();
 await fireEvent.press(view.getByRole('button',{name:'Next cats'}));
 expect(view.getAllByTestId('identity-cat-bubble')).toHaveLength(8);
 await fireEvent.press(view.getByRole('button',{name:'Neighbour 9'}));
 await waitFor(()=>expect(submit).toHaveBeenCalledWith(sightingId,{kind:'existing',animalId:items[9]!.animalId},requestId));
});

it('does not skip the last partial page when fetching another API page',async()=>{
 const items=Array.from({length:28},(_,i)=>({sightingId,animalId:`00000000-0000-4000-8000-${String(i).padStart(12,'0')}`,primaryAlias:`Cat ${i}`,verification:'reported' as const,publicCellId:'8928308280fffff',timeBucket:'today' as const,coverMediaId:null,cursor:sightingId}));
 const list=jest.fn(async({cursor})=>cursor?{items:items.slice(20),nextCursor:null}:{items:items.slice(0,20),nextCursor:'next'});
 const view=await render(<IdentityContinuation sightingId={sightingId} draft={null} locale="en" dependencies={{isOwner:async()=>true,listPublicSightings:list,saveIntent:async intent=>({intent,requestId}),submit:async()=>({status:'tentative'})}}/>);
 await view.findByRole('button',{name:'Cat 0'});
 await fireEvent.press(view.getByRole('button',{name:'Next cats'}));await fireEvent.press(view.getByRole('button',{name:'Next cats'}));
 await fireEvent.press(view.getByRole('button',{name:'Next cats'}));
 await view.findByRole('button',{name:'Cat 20'});expect(view.getByRole('button',{name:'Cat 23'})).toBeTruthy();
 await fireEvent.press(view.getByRole('button',{name:'Next cats'}));expect(view.getByRole('button',{name:'Cat 24'})).toBeTruthy();
});

it('preserves loaded pages when the receipt details are toggled by its parent',async()=>{
 const items=Array.from({length:25},(_,i)=>({sightingId,animalId:`00000000-0000-4000-8000-${String(i).padStart(12,'0')}`,primaryAlias:`Cat ${i}`,verification:'reported' as const,publicCellId:'8928308280fffff',timeBucket:'today' as const,coverMediaId:null,cursor:sightingId}));
 const list=jest.fn(async({cursor})=>cursor?{items:items.slice(20),nextCursor:null}:{items:items.slice(0,20),nextCursor:'next'});
 const deps={isOwner:async()=>true,listPublicSightings:list,saveIntent:async (intent:any)=>({intent,requestId}),submit:async()=>({status:'tentative'})};
 const view=await render(<IdentityContinuation sightingId={sightingId} draft={null} locale="en" dependencies={deps}/>);
 await view.findByRole('button',{name:'Cat 0'});
 for(let i=0;i<4;i++)await fireEvent.press(view.getByRole('button',{name:'Next cats'}));
 await view.findByRole('button',{name:'Cat 24'});
 await view.rerender(<IdentityContinuation sightingId={sightingId} draft={null} locale="en" dependencies={{...deps}}/>);
 expect(view.getByRole('button',{name:'Cat 24'})).toBeTruthy();expect(list).toHaveBeenCalledTimes(2);
});
