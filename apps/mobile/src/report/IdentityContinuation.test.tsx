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
