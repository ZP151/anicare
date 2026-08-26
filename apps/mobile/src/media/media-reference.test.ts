import { createReviewedMediaReference, selectReviewedMediaSweepTargets } from './media-reference';

describe('owned immutable reviewed-media references', () => {
  it('derives a bounded immutable reference from stable media and commit IDs', () => {
    expect(createReviewedMediaReference('media-12345678', 'commit-12345678'))
      .toBe('reviewed-media/media-12345678.commit-12345678.agcm');
  });

  it('sweeps only owned temp files and retains every final ciphertext even when no row protects it', () => {
    expect(selectReviewedMediaSweepTargets([
      'reviewed-media/.media-12345678.commit-orphan01.temp-12345678.tmp',
      'reviewed-media/media-12345678.commit-active01.agcm',
      'reviewed-media/media-87654321.commit-orphan01.agcm',
      'reviewed-media/../secret.agcm',
      'file:///attacker/reviewed-media/media-87654321.commit-orphan01.agcm',
      'reviewed-media/unrelated.txt',
    ])).toEqual([
      'reviewed-media/.media-12345678.commit-orphan01.temp-12345678.tmp',
    ]);
  });
});
