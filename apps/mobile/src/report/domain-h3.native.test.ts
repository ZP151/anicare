import { toPublicLocationCell } from '@animalhelper/domain';

describe('real domain H3 coarsening in the Expo runtime', () => {
  it('coarsens a Singapore coordinate to the hand-checked canonical H3 resolution 9 cell', () => {
    expect(toPublicLocationCell({ latitude: 1.3521, longitude: 103.8198 })).toEqual({
      cellId: '89652636d87ffff',
      resolution: 9,
    });
  });
});
