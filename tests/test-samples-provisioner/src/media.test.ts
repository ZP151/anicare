import assert from 'node:assert/strict';
import test from 'node:test';
import {deterministicJpegFixture} from '../../pilot-gate-2a/src/jpeg-fixture.js';
import {validateCommunityMediaVariants} from './media.js';

test('derives bounded JPEG display and thumbnail variants with independently recorded hashes', async () => {
  const input = deterministicJpegFixture().bytes;
  const variants = await validateCommunityMediaVariants(input, input);
  assert.deepEqual(variants.display, {bytes: input, sha256: deterministicJpegFixture().sha256, width: 1, height: 1});
  assert.deepEqual(variants.thumb, {bytes: input, sha256: deterministicJpegFixture().sha256, width: 1, height: 1});
});

test('refuses an asset that cannot be decoded as a JPEG', async () => {
  await assert.rejects(validateCommunityMediaVariants(new Uint8Array([1, 2, 3]), deterministicJpegFixture().bytes), /test_sample_community_media_invalid/);
});
