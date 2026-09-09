import { COMMUNITY_TEST_POSTS, communitySampleText } from './test-samples';

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
