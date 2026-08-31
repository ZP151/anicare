jest.mock('@shopify/react-native-skia', () => ({ ImageFormat: { JPEG: 3 }, Skia: {} }));

import { selectOwnedProcessorCacheSweepTargets } from './draft-media.native';

describe('startup processor-cache cleanup', () => {
  it('selects only direct app-owned canonical and reviewed JPEGs from the native cache root', () => {
    expect(selectOwnedProcessorCacheSweepTargets([
      'file:///cache/animalhelper-canonical-12345678.jpg',
      'file:///cache/animalhelper-reviewed-87654321.jpg',
      'file:///cache/unrelated.db',
      'file:///cache/subdir/animalhelper-reviewed-12345678.jpg',
      'file:///cache/../documents/animalhelper-reviewed-12345678.jpg',
      'file:///attacker/animalhelper-reviewed-12345678.jpg',
      'content://gallery/animalhelper-reviewed-12345678.jpg',
    ], 'file:///cache/')).toEqual([
      'file:///cache/animalhelper-canonical-12345678.jpg',
      'file:///cache/animalhelper-reviewed-87654321.jpg',
    ]);
  });
});
