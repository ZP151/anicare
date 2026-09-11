import type { ProfileAvatarKey } from '../profile/profile-avatar';

type Copy = Readonly<{ en: string; zh: string }>;
type Example = Readonly<{ id: string; name: Copy; area: Copy; avatarKey: ProfileAvatarKey; messages: readonly Readonly<{ mine: boolean; text: Copy }>[] }>;

// Local UI examples, deliberately separate from account IDs, requests and RPCs.
export const EXAMPLE_CONVERSATIONS: readonly Example[] = [
  { id: 'west-coast', name: { en: 'Mei', zh: '小美' }, area: { en: 'West Coast', zh: '西海岸' }, avatarKey: 'human-01', messages: [
    { mine: false, text: { en: 'Was that the orange cat you saw near the park?', zh: '你在公园附近看到的是那只橘猫吗？' } },
    { mine: true, text: { en: 'I think so! It had a white tail tip.', zh: '应该是！它的尾巴尖是白色的。' } },
    { mine: false, text: { en: 'That sounds like Mochi. I left some fresh water in the shade.', zh: '听起来像麻薯。我在阴凉处放了一碗清水。' } },
  ] },
  { id: 'clementi', name: { en: 'Kai', zh: '阿凯' }, area: { en: 'Clementi', zh: '金文泰' }, avatarKey: 'human-05', messages: [
    { mine: false, text: { en: 'Your photo of the two cats made my morning 🙂', zh: '看到你拍的两只猫，今天心情都变好了 🙂' } },
    { mine: true, text: { en: 'They sat together for ages. The little one kept falling asleep.', zh: '它们一起坐了好久。小的那只一直打瞌睡。' } },
    { mine: false, text: { en: 'Hope I spot them on my next walk!', zh: '希望下次散步也能遇到它们！' } },
  ] },
  { id: 'tampines', name: { en: 'Aisha', zh: '艾莎' }, area: { en: 'Tampines', zh: '淡滨尼' }, avatarKey: 'human-07', messages: [
    { mine: false, text: { en: 'Do you know if the little grey cat has a regular carer?', zh: '你知道那只小灰猫有没有固定照顾它的人吗？' } },
    { mine: true, text: { en: 'Not sure yet. I added a sighting to its profile.', zh: '还不确定。我刚在它的档案里加了一条目击记录。' } },
    { mine: false, text: { en: 'Thanks, I’ll check the community post too.', zh: '谢谢，我也去社区帖子里看看。' } },
  ] },
];
export const exampleText = (copy: Copy, zh: boolean) => zh ? copy.zh : copy.en;
