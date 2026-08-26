import { sanitizeDraftForStorage } from './draft-policy';

describe('offline draft privacy', () => {
  it('never persists precise coordinates or access tokens', () => {
    expect(
      sanitizeDraftForStorage({
        id: 'draft-1',
        photoUri: 'file:///cat.jpg',
        notes: 'white paws',
        risk: 'sensitive',
        latitude: 1.3521,
        longitude: 103.8198,
        accessToken: 'secret',
      }),
    ).toEqual({
      id: 'draft-1',
      photoUri: 'file:///cat.jpg',
      notes: 'white paws',
      risk: 'sensitive',
    });
  });

  it('normalises notes and rejects unknown risk values', () => {
    expect(
      sanitizeDraftForStorage({ id: 'draft-2', notes: '  tabby  ', risk: 'unknown' }),
    ).toEqual({
      id: 'draft-2',
      photoUri: null,
      notes: 'tabby',
      risk: 'normal',
    });
  });
});
