import type { ProfileAvatarKey } from '../profile/profile-avatar';

type Copy = Readonly<{ en: string; zh: string }>;
type Example = Readonly<{ id: string; name: Copy; area: Copy; avatarKey: ProfileAvatarKey; messages: readonly Readonly<{ mine: boolean; text: Copy }>[] }>;

// Local UI examples, deliberately separate from account IDs, requests and RPCs.
export const EXAMPLE_CONVERSATIONS: readonly Example[] = [
  { id: 'west-coast', name: { en: 'Mei', zh: '小梅' }, area: { en: 'Jurong West', zh: '裕廊西' }, avatarKey: 'human-01', messages: [
    { mine: false, text: { en: 'Was that Honey in your new album?', zh: '你新相册里的那只是蜜糖吗？' } },
    { mine: true, text: { en: 'Yes, the orange cat with white socks. I linked the cat profile.', zh: '是的，那只穿白袜子的橘猫。我关联了它的档案。' } },
    { mine: false, text: { en: 'Found it! Now I can see Kai’s different photo in the same cat album.', zh: '找到了！现在同一个猫咪相册里也能看到阿凯拍的另一张照片。' } },
  ] },
  { id: 'clementi', name: { en: 'Kai', zh: '阿凯' }, area: { en: 'Tampines', zh: '淡滨尼' }, avatarKey: 'human-02', messages: [
    { mine: false, text: { en: 'Your photo of Patch looking back made my morning 🙂', zh: '看到拼拼回头的照片，今天心情都变好了 🙂' } },
    { mine: true, text: { en: 'That little black tail tip is such a useful clue.', zh: '黑色的小尾尖真是个好认的特征。' } },
    { mine: false, text: { en: 'I’ll compare it with Noor’s photos in Patch’s album.', zh: '我去拼拼的相册里对照看看努尔拍的照片。' } },
  ] },
  { id: 'tampines', name: { en: 'Lin', zh: '小林' }, area: { en: 'MacRitchie', zh: '麦里芝' }, avatarKey: 'human-03', messages: [
    { mine: false, text: { en: 'Was Pebble the grey cat in the rainy-day photos?', zh: '雨天照片里的小灰猫是卵石吗？' } },
    { mine: true, text: { en: 'Yes. The small white throat patch is visible in the first photo.', zh: '是的，第一张照片里能看到喉咙处的小白斑。' } },
    { mine: false, text: { en: 'Thanks, I’ll check the community post too.', zh: '谢谢，我也去社区帖子里看看。' } },
  ] },
];
export const exampleText = (copy: Copy, zh: boolean) => zh ? copy.zh : copy.en;
