import { getCatPresentations } from './cat-presentation';

const firstId = '00000000-0000-4000-8000-000000002801';
const secondId = '00000000-0000-4000-8000-000000002802';

it('returns only strictly validated portrait rows with short-lived signed URLs', async () => {
  const createSignedUrls = jest.fn(async (paths: string[], expiresIn: number) => ({
    data: paths.map((path) => ({ path, signedUrl: `https://example.test/${path}` })), error: null,
  }));
  const rpc = jest.fn(async () => ({ data: [
    { animalId: firstId, portraitPath: `synthetic-test/${firstId}/portrait.jpg`, sampleLabel: '测试样本 S01' },
    { animalId: secondId, portraitPath: null, sampleLabel: '测试样本 S05' },
  ], error: null }));

  await expect(getCatPresentations([firstId, secondId], { rpc, storage: { from: () => ({ createSignedUrls }) } }))
    .resolves.toEqual(new Map([
      [firstId, { portraitUri: `https://example.test/synthetic-test/${firstId}/portrait.jpg`, sampleLabel: '测试样本 S01' }],
      [secondId, { sampleLabel: '测试样本 S05' }],
    ]));
  expect(rpc).toHaveBeenCalledWith('get_public_cat_presentations', { p_animal_ids: [firstId, secondId] });
  expect(createSignedUrls).toHaveBeenCalledWith([`synthetic-test/${firstId}/portrait.jpg`], 60);
});

it('fails closed when a server row or signed response is malformed', async () => {
  const rpc = async () => ({ data: [{
    animalId: firstId, portraitPath: `synthetic-test/${firstId}/../private.jpg`, sampleLabel: '测试样本 S01',
  }], error: null });
  await expect(getCatPresentations([firstId], { rpc, storage: { from: () => ({ createSignedUrls: async () => ({ data: [], error: null }) }) } }))
    .resolves.toEqual(new Map());
});

it('does not call remote services for invalid or duplicate IDs', async () => {
  const rpc = jest.fn();
  await expect(getCatPresentations(['not-a-uuid', firstId, firstId], { rpc, storage: { from: jest.fn() } }))
    .resolves.toEqual(new Map());
  expect(rpc).not.toHaveBeenCalled();
});
