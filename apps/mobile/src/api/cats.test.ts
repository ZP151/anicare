import { getPublicCatSummary } from './cats';
const animalId = '00000000-0000-4000-8000-000000002599';
const cat = { animalId, primaryAlias: 'Older cat', verification: 'reported', timeBucket: null };
it('loads one by-ID summary with explicit empty activity', async () => {
 const rpc = jest.fn(async () => ({ data: [cat], error: null }));
 await expect(getPublicCatSummary(animalId, { rpc })).resolves.toEqual(cat);
 expect(rpc).toHaveBeenCalledWith('get_public_cat_summary', { p_animal_id: animalId });
});
it.each([null, []])('treats an unavailable profile uniformly: %j', async (data) => {
 await expect(getPublicCatSummary(animalId, { rpc: async () => ({ data, error: null }) })).resolves.toBeNull();
});
it.each([
 { ...cat, storagePath: 'private.jpg' }, { ...cat, animalId: '00000000-0000-4000-8000-000000009999' },
 { ...cat, primaryAlias: '' }, { ...cat, primaryAlias: 'a'.repeat(81) }, { ...cat, timeBucket: '2026-09-08' },
 { ...cat, verification: 'automatic' },
])('rejects a malformed or overbroad summary', async (row) => {
 await expect(getPublicCatSummary(animalId, { rpc: async () => ({ data: [row], error: null }) })).rejects.toThrow('invalid_public_cat_summary');
});
it('does not query an invalid ID and masks transport failures', async () => {
 const rpc = jest.fn(async () => { throw new Error('sensitive backend detail'); });
 await expect(getPublicCatSummary('demo-cat', { rpc })).rejects.toThrow('public_cat_unavailable');
 expect(rpc).not.toHaveBeenCalled();
 await expect(getPublicCatSummary(animalId, { rpc })).rejects.toThrow('public_cat_unavailable');
});
