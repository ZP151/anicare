import { sanitizeDraftForStorage } from './draft-policy';

describe('offline draft privacy', () => {
  it('never persists precise coordinates or access tokens', () => {
    expect(
      sanitizeDraftForStorage({
        id: 'draft-1',
        notes: 'white paws',
        risk: 'sensitive',
        latitude: 1.3521,
        longitude: 103.8198,
        accessToken: 'secret',
      }),
    ).toEqual({
      id: 'draft-1',
      notes: 'white paws',
      risk: 'sensitive',
    });
  });

  it('normalises notes and rejects unknown risk values', () => {
    expect(
      sanitizeDraftForStorage({ id: 'draft-2', notes: '  tabby  ', risk: 'unknown' }),
    ).toEqual({
      id: 'draft-2',
      notes: 'tabby',
      risk: 'normal',
    });
  });

  it('does not persist a raw selected-image URI', () => {
    expect(sanitizeDraftForStorage({ id: 'd1', photoUri: 'file:///raw.jpg', latitude: 1, accessToken: 'x' })).not.toHaveProperty('photoUri');
  });
});
