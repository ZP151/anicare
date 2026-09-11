import { COMMUNITY_TEST_POSTS, communitySampleAuthor, communitySampleText } from './test-samples';

it('defines twenty-four persisted fixture conversations with local demo profiles', () => {
  expect(COMMUNITY_TEST_POSTS).toHaveLength(24);
  expect(new Set(COMMUNITY_TEST_POSTS.map(post => post.id)).size).toBe(24);
  expect(COMMUNITY_TEST_POSTS.every(post => /^C\d{2}$/.test(post.code) && /^Demo /.test(post.profile.name) && /^human-(?:0[1-9]|1[0-5])$/.test(post.profile.avatarKey))).toBe(true);
  expect(COMMUNITY_TEST_POSTS.every(post => post.media.length <= 6)).toBe(true);
  expect(COMMUNITY_TEST_POSTS.find(post => post.code === 'C09')?.media).toEqual(['garden-pair.jpg', 'shelter-trio.jpg']);
  expect(COMMUNITY_TEST_POSTS.find(post => post.code === 'C12')?.media).toEqual(['side-tabby.jpg', 'rear-ginger.jpg', 'motion-black.jpg', 'hidden-calico.jpg']);
  expect(COMMUNITY_TEST_POSTS.filter(post => post.communitySlug === 'sg-clsz05' && post.media.length > 0)).toHaveLength(6);
});
it('returns distinct local-only demo authors for a known conversation and never for resident content', () => {
  expect(communitySampleAuthor('00000000-0000-4000-8000-00000000c101', 'en')).toEqual({name: 'Demo Mei', avatarKey: 'human-01', photo: 'woman'});
  expect(communitySampleAuthor('00000000-0000-4000-8000-00000000d101', 'zh-CN')).toEqual({name: 'Demo Ren', avatarKey: 'human-10', photo: null});
  expect(communitySampleAuthor('resident-post', 'zh-CN')).toBeNull();
});

it('keeps every persisted demo post and reply visibly synthetic in either language', () => {
  expect(COMMUNITY_TEST_POSTS.length).toBeGreaterThanOrEqual(8);
  const ids = new Set<string>();
  for (const post of COMMUNITY_TEST_POSTS) {
    for (const item of [post, post.reply]) {
      expect(ids.has(item.id)).toBe(false); ids.add(item.id);
      expect(item.body.en).toMatch(/^\[Test sample /);
      const en = communitySampleText(item.id, item.body.en, 'en');
      const zh = communitySampleText(item.id, item.body.en, 'zh-CN');
      expect(en.label).toMatch(/^Test sample /);
      expect(zh.label).toMatch(/^测试样本 /);
      expect(zh.body).toBe(item.body.zh);
      expect(communitySampleText(item.id, 'User edited text', 'zh-CN').body).toBe('User edited text');
    }
  }
});
it('does not translate or relabel real posts even if they reuse demo text', () => {
  const body = COMMUNITY_TEST_POSTS[0]!.body.en;
  expect(communitySampleText('resident-post', body, 'zh-CN')).toEqual({ body, label: null });
});
