import { act, renderHook } from '@testing-library/react-native';
import type { CatPage } from '../api/follows';
const mockPresentations = jest.fn();
jest.mock('../api/cat-presentation', () => ({ getCatPresentations: (...args: unknown[]) => mockPresentations(...args) }));
import { useCatPage } from './use-cat-page';
const id = '00000000-0000-4000-8000-000000007001';
const page: CatPage = { items: [{ animalId: id, primaryAlias: 'Test cat', verification: 'reported', timeBucket: null, cursor: id }], nextCursor: null };
const pin = () => async () => true;
it('loads portraits for returned cats and clears them with the account page', async () => {
  mockPresentations.mockResolvedValue(new Map([[id, { portraitUri: 'https://example.test/portrait', sampleLabel: '测试样本 S01' }]]));
  const { result } = await renderHook(() => useCatPage(async () => page, pin));
  await act(async () => { await result.current.load(); });
  expect(result.current.presentations.get(id)?.sampleLabel).toBe('测试样本 S01');
  await act(async () => { result.current.clear(); });
  expect(result.current.presentations.size).toBe(0);
  expect(result.current.page.items).toEqual([]);
});
it('does not restore portraits after clear while signing is pending', async () => {
  let finish!: (value: Map<string, { portraitUri: string }>) => void;
  mockPresentations.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const { result } = await renderHook(() => useCatPage(async () => page, pin));
  let loading!: Promise<void>;
  await act(async () => { loading = result.current.load(); });
  await act(async () => { result.current.clear(); finish(new Map([[id, { portraitUri: 'https://example.test/stale' }]])); await loading; });
  expect(result.current.presentations.size).toBe(0);
  expect(result.current.page.items).toEqual([]);
});
