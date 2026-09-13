import {readFile} from 'node:fs/promises';
import {ACTIVE_COMMUNITY_TEST_POSTS} from '../../../apps/mobile/src/community/sample-catalog-v2.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import {deterministicJpegFixture} from '../../pilot-gate-2a/src/jpeg-fixture.js';
import {validateCommunityMediaVariants, prepareFixtureJpeg} from './media.js';

test('derives bounded JPEG display and thumbnail variants with independently recorded hashes', async () => {
  const input = deterministicJpegFixture().bytes;
  const variants = await validateCommunityMediaVariants(input, input);
  assert.deepEqual(variants.display, {bytes: input, sha256: deterministicJpegFixture().sha256, width: 1, height: 1});
  assert.deepEqual(variants.thumb, {bytes: input, sha256: deterministicJpegFixture().sha256, width: 1, height: 1});
});

test('refuses an asset that cannot be decoded as a JPEG', async () => {
  await assert.rejects(validateCommunityMediaVariants(new Uint8Array([1, 2, 3]), deterministicJpegFixture().bytes), /test_sample_community_media_invalid/);
});

test('prepares every active catalogue photograph and thumbnail for the production decoder',async()=>{
 for(const filename of new Set(ACTIVE_COMMUNITY_TEST_POSTS.flatMap(post=>post.media))){
  const display=await readFile(new URL('../../../docs/test-samples/ios-v1/assets/'+filename,import.meta.url));
  const thumb=await readFile(new URL('../../../docs/test-samples/ios-v1/assets/'+filename.replace(/\.jpg$/,'-thumb.jpg'),import.meta.url));
  const result=await validateCommunityMediaVariants(prepareFixtureJpeg(display),prepareFixtureJpeg(thumb));
  assert.ok(result.display.width>0);assert.ok(result.thumb.width<=480);
 }
});
test('fixture JFIF preparation preserves an already compliant file and never repairs arbitrary data',async()=>{
 const valid=deterministicJpegFixture().bytes;
 await assert.rejects(validateCommunityMediaVariants(prepareFixtureJpeg(new Uint8Array([0xff,0xd8,0xff,0xdb,0,2,0xff,0xd9])),valid),/media_invalid/);
 assert.deepEqual(prepareFixtureJpeg(valid),valid);
 await assert.rejects(validateCommunityMediaVariants(prepareFixtureJpeg(new Uint8Array([1,2,3])),valid),/media_invalid/);
});
