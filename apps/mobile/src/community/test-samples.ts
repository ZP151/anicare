import type { Locale } from '../i18n/catalog';

// One source for the hosted provisioner and the UI. These are persisted test
// conversations, never fallback posts injected when a real feed is empty.
const scenarios = [
  ['sg-clsz05', null, 'A quiet afternoon in West Coast. What do you enjoy about your neighbourhood?', '西海岸的悠闲午后。你最喜欢邻里里的什么？', 'The shady walking paths are my favourite.', '我喜欢有树荫的步道。', 'Demo Mei', 'human-01'],
  ['sg-clsz05', null, 'Let’s share tips for keeping community water bowls clean.', '一起聊聊怎样保持社区饮水碗清洁吧。', 'A separate brush makes cleaning easier.', '准备一把专用刷子会方便些。', 'Demo Kai', 'human-02'],
  ['clementi', null, 'Welcome, Clementi neighbours. Introduce yourself and say hello.', '金文泰的邻居们，欢迎来打个招呼。', 'Hello! Looking forward to meeting other cat lovers.', '你好！期待认识更多喜欢猫的邻居。', 'Demo Lin', 'human-03'],
  ['woodlands', '00000000-0000-4000-8000-00000000a107', 'Mochi’s portrait for our neighbourhood cat album.', '给社区猫咪相册添一张麻糬的肖像。', 'Those little ears are adorable.', '小耳朵真可爱。', 'Demo Noor', 'human-04'],
  ['queenstown', '00000000-0000-4000-8000-00000000a112', 'Coco has a very photogenic face. Share your favourite cat portrait.', '可可很上镜。来分享你喜欢的猫咪肖像吧。', 'I like portraits taken from a respectful distance.', '我喜欢保持距离拍下的自然神态。', 'Demo Aria', 'human-05'],
  ['bedok', '00000000-0000-4000-8000-00000000a113', 'Meet Snowy in this sample cat album.', '在这个示例相册里认识小雪。', 'Such a soft-looking coat.', '毛茸茸的样子很可爱。', 'Demo Ben', 'human-06'],
  ['punggol', '00000000-0000-4000-8000-00000000a109', 'Luna’s tabby markings make a lovely portrait.', '露娜的狸花纹路很适合拍肖像。', 'The stripes around the face are lovely.', '脸颊两边的花纹真好看。', 'Demo Siti', 'human-07'],
  ['jurong-west', '00000000-0000-4000-8000-00000000a101', 'Marmalade joins the sample neighbourhood album.', '阿橘加入了社区示例相册。', 'A cheerful orange face to brighten the feed.', '这张橘色小脸让动态页明亮了起来。', 'Demo Owen', 'human-08'],
  ['sg-clsz05', null, 'A pair of synthetic garden cats makes a useful gallery test.', '一对合成花园猫咪很适合测试图片画廊。', 'The two angles make the gallery easy to inspect.', '两个角度让画廊更容易检查。', 'Demo Mei', 'human-01'],
  ['sg-clsz05', '00000000-0000-4000-8000-00000000a115', 'Biscuit is back in the sample cat album.', '饼干回到了示例猫咪相册。', 'The new test portrait is visible now.', '新的测试肖像现在可以看到了。', 'Demo Ray', 'human-10'],
  ['sg-clsz05', '00000000-0000-4000-8000-00000000a116', 'Willow has a synthetic portrait for gallery checks.', '柳柳有一张用于画廊检查的合成肖像。', 'This one keeps the fixture label visible.', '这张图会保留样本标签。', 'Demo Hana', 'human-11'],
  ['sg-clsz05', '00000000-0000-4000-8000-00000000a117', 'A side-view tabby checks non-front-facing portraits.', '侧身狸花用于检查非正面肖像。', 'The profile view is clearly marked synthetic.', '侧面图已明确标为合成样本。', 'Demo Dev', 'human-12'],
  ['sg-clsz08', '00000000-0000-4000-8000-00000000a118', 'A rear-facing ginger cat exercises another portrait angle.', '背对镜头的姜黄色猫咪测试另一种肖像角度。', 'It still belongs only to this synthetic fixture.', '它仍只对应这一条合成样本。', 'Demo Yue', 'human-13'],
  ['tampines', '00000000-0000-4000-8000-00000000a119', 'A little motion blur checks image loading without a real sighting.', '轻微动态模糊用于测试加载，不代表真实目击。', 'The test label makes that distinction clear.', '测试标签明确区分了这一点。', 'Demo Iman', 'human-14'],
  ['queenstown', '00000000-0000-4000-8000-00000000a120', 'A partly hidden calico tests an occluded synthetic portrait.', '一只部分遮挡的三花猫测试合成肖像遮挡场景。', 'No real location is represented here.', '这里不代表真实地点。', 'Demo Sol', 'human-15'],
  ['bedok', null, 'A synthetic shelter trio is for multi-cat gallery testing only.', '合成收容所三猫图仅用于多猫画廊测试。', 'It is not attached to a single cat identity.', '它不会关联到单只猫的身份。', 'Demo Kai', 'human-02'],
  ['pasir-ris', '00000000-0000-4000-8000-00000000a121', 'Nori reuses an approved side-view image for list density.', '海苔复用已批准的侧身图片以测试列表密度。', 'The alias and fixture label remain separate.', '别名和样本标签保持分开。', 'Demo Kai', 'human-02'],
  ['punggol', '00000000-0000-4000-8000-00000000a122', 'Poppy adds a rear-angle sample in the north-east feed.', '罂粟在东北区动态中加入背面角度样本。', 'The sample is synthetic and labelled.', '样本为合成素材且有标签。', 'Demo Lin', 'human-03'],
  ['sengkang', '00000000-0000-4000-8000-00000000a123', 'Jasper keeps the motion-blur fixture easy to find.', '碧玉让动态模糊样本更容易找到。', 'The image is only a controlled test asset.', '图片只是受控测试素材。', 'Demo Noor', 'human-04'],
  ['clementi', '00000000-0000-4000-8000-00000000a124', 'Miso adds an occluded portrait to this demo collection.', '味噌为示例集合增加一张遮挡肖像。', 'It is never presented as a resident report.', '它绝不会被当作居民上报。', 'Demo Aria', 'human-05'],
  ['clementi', '00000000-0000-4000-8000-00000000a125', 'Tofu continues the intentionally reused synthetic-photo series.', '豆腐延续刻意复用的合成图片系列。', 'Reusing approved assets helps test repeated cards.', '复用已批准素材有助于测试重复卡片。', 'Demo Ben', 'human-06'],
  ['bukit-batok', '00000000-0000-4000-8000-00000000a126', 'Sable adds a second rear-angle fixture.', '乌檀加入第二条背面角度样本。', 'It remains a labelled fixture.', '它仍是带标签的样本。', 'Demo Siti', 'human-07'],
  ['jurong-west', '00000000-0000-4000-8000-00000000a127', 'Pixel keeps a blurred portrait in the dense sample feed.', '像素让密集示例动态中保留一张模糊肖像。', 'The text makes the synthetic source explicit.', '文字明确说明了合成来源。', 'Demo Owen', 'human-08'],
  ['macritchie', '00000000-0000-4000-8000-00000000a128', 'Fennel tests a hidden-cat card without implying a real place.', '茴香测试隐藏猫咪卡片，不暗示真实地点。', 'This is a controlled test card.', '这是受控测试卡片。', 'Demo Jia', 'human-09'],
] as const;

// These names refer only to approved synthetic source files. The provisioner
// derives the display/thumb JPEG variants and verifies their byte hashes.
const mediaByCode: Readonly<Record<string, readonly string[]>> = {
  C01: ['garden-pair.jpg', 'shelter-trio.jpg'],
  C02: ['side-tabby.jpg'],
  C09: ['garden-pair.jpg', 'shelter-trio.jpg'],
  C10: ['biscuit.jpg'],
  C11: ['willow.jpg'],
  C12: ['side-tabby.jpg', 'rear-ginger.jpg', 'motion-black.jpg', 'hidden-calico.jpg'],
  C16: ['shelter-trio.jpg', 'garden-pair.jpg'],
};
const replyProfiles = [
  {name: 'Demo Ren', avatarKey: 'human-10'}, {name: 'Demo Asha', avatarKey: 'human-11'},
  {name: 'Demo Bo', avatarKey: 'human-12'}, {name: 'Demo Qi', avatarKey: 'human-13'},
] as const;

export const COMMUNITY_TEST_POSTS = scenarios.map(([communitySlug, catId, en, zh, replyEn, replyZh, profileName, avatarKey], index) => {
  const code = `C${String(index + 1).padStart(2, '0')}`;
  return {
    id: `00000000-0000-4000-8000-00000000c${101 + index}`,
    code, communitySlug, catId, media: mediaByCode[code] ?? [],
    profile: {name: profileName, avatarKey, photo: index === 0 || index === 8 ? 'woman' as const : index === 1 || index === 15 ? 'man' as const : null},
    replyProfile: {...replyProfiles[index % replyProfiles.length]!},
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

/** Local fixture display metadata only; it never represents an authenticated account. */
export function communitySampleAuthor(id: string, _locale: Locale): Readonly<{name: string; avatarKey: string; photo: 'woman' | 'man' | null}> | null {
  const post = COMMUNITY_TEST_POSTS.find(candidate => candidate.id === id || candidate.reply.id === id);
  if (!post) return null;
  return post.id === id ? post.profile : {...post.replyProfile, photo: null};
}
