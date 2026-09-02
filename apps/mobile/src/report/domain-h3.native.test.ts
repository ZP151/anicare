import { toPublicLocationCell } from '@animalhelper/domain';

describe('real domain H3 coarsening in the Expo runtime', () => {
  it('loads the package through the tracked public source barrel', () => {
    expect(require.resolve('@animalhelper/domain').replace(/\\/g, '/')).toContain('/packages/domain/src/index.ts');
  });

  it('coarsens a Singapore coordinate to the hand-checked canonical H3 resolution 9 cell', () => {
    expect(toPublicLocationCell({ latitude: 1.3521, longitude: 103.8198 })).toEqual({
      cellId: '89652636d87ffff',
      resolution: 9,
    });
  });
});
