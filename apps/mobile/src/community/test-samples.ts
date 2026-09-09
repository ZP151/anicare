import type { Locale } from '../i18n/catalog';

// One source for the hosted provisioner and the UI. These are persisted test
// conversations, never fallback posts injected when a real feed is empty.
const scenarios = [
  ['sg-clsz05', null, 'A quiet afternoon in West Coast. What do you enjoy about your neighbourhood?', '西海岸的悠闲午后。你最喜欢邻里里的什么？', 'The shady walking paths are my favourite.', '我喜欢有树荫的步道。'],
  ['sg-clsz05', null, 'Let’s share tips for keeping community water bowls clean.', '一起聊聊怎样保持社区饮水碗清洁吧。', 'A separate brush makes cleaning easier.', '准备一把专用刷子会方便些。'],
  ['clementi', null, 'Welcome, Clementi neighbours. Introduce yourself and say hello.', '金文泰的邻居们，欢迎来打个招呼。', 'Hello! Looking forward to meeting other cat lovers.', '你好！期待认识更多喜欢猫的邻居。'],
  ['woodlands', '00000000-0000-4000-8000-00000000a107', 'Mochi’s portrait for our neighbourhood cat album.', '给社区猫咪相册添一张麻糬的肖像。', 'Those little ears are adorable.', '小耳朵真可爱。'],
  ['queenstown', '00000000-0000-4000-8000-00000000a112', 'Coco has a very photogenic face. Share your favourite cat portrait.', '可可很上镜。来分享你喜欢的猫咪肖像吧。', 'I like portraits taken from a respectful distance.', '我喜欢保持距离拍下的自然神态。'],
  ['bedok', '00000000-0000-4000-8000-00000000a113', 'Meet Snowy in this sample cat album.', '在这个示例相册里认识小雪。', 'Such a soft-looking coat.', '毛茸茸的样子很可爱。'],
  ['punggol', '00000000-0000-4000-8000-00000000a109', 'Luna’s tabby markings make a lovely portrait.', '露娜的狸花纹路很适合拍肖像。', 'The stripes around the face are lovely.', '脸颊两边的花纹真好看。'],
  ['jurong-west', '00000000-0000-4000-8000-00000000a101', 'Marmalade joins the sample neighbourhood album.', '阿橘加入了社区示例相册。', 'A cheerful orange face to brighten the feed.', '这张橘色小脸让动态页明亮了起来。'],
] as const;

export const COMMUNITY_TEST_POSTS = scenarios.map(([communitySlug, catId, en, zh, replyEn, replyZh], index) => {
  const code = `C${String(index + 1).padStart(2, '0')}`;
  return {
    id: `00000000-0000-4000-8000-00000000c${101 + index}`,
    code, communitySlug, catId,
    body: {en: `[Test sample ${code}] ${en}`, zh},
    reply: {id: `00000000-0000-4000-8000-00000000d${101 + index}`, code,
      body: {en: `[Test sample ${code}] ${replyEn}`, zh: replyZh}},
  };
});

export function communitySampleText(id: string, body: string, locale: Locale): {body: string; label: string | null} {
  const sample = COMMUNITY_TEST_POSTS.flatMap(post => [post, post.reply]).find(item => item.id === id);
  if (!sample) return {body, label: null};
  return {
    body: body === sample.body.en ? (locale === 'zh-CN' ? sample.body.zh : sample.body.en.replace(/^\[Test sample C\d{2}\] /, '')) : body,
    label: `${locale === 'zh-CN' ? '测试样本' : 'Test sample'} ${sample.code}`,
  };
}
