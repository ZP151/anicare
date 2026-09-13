import { act, fireEvent, render } from '@testing-library/react-native';
const mockDiscover = jest.fn(), mockFollowed = jest.fn(), mockSummary = jest.fn();
jest.mock('../api/follows', () => ({ listDiscoveredCats: (...a: unknown[]) => mockDiscover(...a), listFollowedCats: (...a: unknown[]) => mockFollowed(...a) }));
jest.mock('../api/cats', () => ({ getPublicCatSummary: (...a: unknown[]) => mockSummary(...a) }));
jest.mock('../api/cat-presentation', () => ({ getCatPresentations: async () => new Map() }));
jest.mock('../auth/session-subject', () => ({ readSessionSubjectStrict: async () => 'owner' }));
import { CatPicker } from './CatPicker';
const cat = { animalId: '00000000-0000-4000-8000-000000004511', primaryAlias: 'Pepper', verification: 'reported', timeBucket: null, cursor: '00000000-0000-4000-8000-000000004511' };
const props = { owner: 'owner', selectedCatId: null, communitySlug: null, locale: 'en' as const, onConfirm: jest.fn(), onCancel: jest.fn() };
beforeEach(() => { jest.clearAllMocks(); mockDiscover.mockResolvedValue({ items: [cat], nextCursor: null }); mockFollowed.mockResolvedValue({ items: [], nextCursor: null }); mockSummary.mockResolvedValue(cat); });
it('selects a preview first and changes the draft only after explicit confirmation', async () => {
 const view = await render(<CatPicker {...props} />);
 await fireEvent.press(await view.findByRole('button', { name: 'Select Pepper' }));
 expect(props.onConfirm).not.toHaveBeenCalled();
 expect(view.getByRole('button', { name: 'Select Pepper' }).props.accessibilityState.selected).toBe(true);
 await fireEvent.press(view.getByRole('button', { name: 'Confirm cat' }));
 expect(props.onConfirm).toHaveBeenCalledWith(cat.animalId);
});
it('cancel preserves the previous selection', async () => {
 const view = await render(<CatPicker {...props} selectedCatId={cat.animalId} />);
 await view.findByText('Pepper');
 await fireEvent.press(view.getByRole('button', { name: 'Cancel selection' }));
 expect(props.onConfirm).not.toHaveBeenCalled(); expect(props.onCancel).toHaveBeenCalledTimes(1);
});
it('supports an explicitly unknown or multi-cat post', async () => {
 const view = await render(<CatPicker {...props} />);
 await fireEvent.press(view.getByRole('button', { name: 'No single cat' }));
 await fireEvent.press(view.getByRole('button', { name: 'Confirm cat' }));
 expect(props.onConfirm).toHaveBeenCalledWith(null);
});
it('does not confirm a cat that becomes unavailable', async () => {
 const view = await render(<CatPicker {...props} />);
 await fireEvent.press(await view.findByRole('button', { name: 'Select Pepper' }));
 mockSummary.mockResolvedValue(null);
 await fireEvent.press(view.getByRole('button', { name: 'Confirm cat' }));
 expect(await view.findByText('This cat is no longer available. Choose another or no single cat.')).toBeTruthy();
 expect(props.onConfirm).not.toHaveBeenCalled();
});
it('makes empty followed scope and discovery retry explicit', async () => {
 mockDiscover.mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ items: [cat], nextCursor: null });
 const view = await render(<CatPicker {...props} />);
 await fireEvent.press(await view.findByRole('button', { name: 'Retry cats' }));
 await view.findByText('Pepper');
 await fireEvent.press(view.getByRole('tab', { name: 'Following' }));
 expect(await view.findByText('No followed cats here yet. Try Discover.')).toBeTruthy();
});
it('does not apply a pending confirmation to another account', async () => {
 let finish!: (v: unknown) => void;
 const view = await render(<CatPicker {...props} />);
 await fireEvent.press(await view.findByRole('button', { name: 'Select Pepper' }));
 mockSummary.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
 await fireEvent.press(view.getByRole('button', { name: 'Confirm cat' }));
 await view.rerender(<CatPicker {...props} owner="different-owner" />);
 await act(async () => finish(cat));
 expect(props.onConfirm).not.toHaveBeenCalled();
});
