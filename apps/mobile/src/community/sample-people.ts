import type {Locale} from '../i18n/catalog';

const people = [
 ['mei','Mei','小梅','sg-clsz05','Evening walks, small gardens, and a camera full of cats.','喜欢晚间散步、小花园，还有装满猫咪的相册。'],
 ['kai','Kai','阿凯','sg-clsz05','Weekend cyclist. Always happy to exchange neighbourhood stories.','周末骑车，平时喜欢听邻里间的小故事。'],
 ['lin','Lin','小林','clementi','Learning photography one quiet afternoon at a time.','慢慢学拍照，收集安静的午后。'],
 ['noor','Noor','努尔','woodlands','Books, long walks, and cats that refuse to pose.','喜欢读书、长距离散步，还有不肯摆姿势的猫。'],
 ['aria','Aria','艾莉','queenstown','Keeping an album of the little things I notice.','用相册留下生活里注意到的小事。'],
 ['ben','Ben','阿本','bedok','Early riser with a soft spot for sleepy cats.','习惯早起，偏偏最喜欢困困的猫。'],
 ['siti','Siti','茜蒂','punggol','Waterfront walks and cosy weekends.','喜欢水边散步和舒服的周末。'],
 ['owen','Owen','欧文','jurong-west','A little coffee, a little photography.','喝点咖啡，拍拍照片。'],
 ['jia','Jia','小佳','macritchie','I usually notice the ears before I spot the cat.','总是先发现耳朵，才看到猫。'],
 ['ray','Ray','阿雷','sg-clsz05','Finding a slower pace around the neighbourhood.','在邻里间寻找慢一点的节奏。'],
 ['hana','Hana','小花','sg-clsz05','Collecting expressions, not perfect portraits.','喜欢收集表情，不追求完美肖像。'],
 ['dev','Dev','德夫','sg-clsz05','Trying to leave every place a little tidier.','希望离开时，每个地方都能整洁一点。'],
 ['yue','Yue','小月','sg-clsz08','The walking-away photos are my favourites.','最喜欢拍走远的背影。'],
 ['iman','Iman','伊曼','tampines','Still learning to catch a moving subject.','还在学习怎样拍下移动中的主角。'],
 ['sol','Sol','小晴','queenstown','Shade, leaves, and a very patient camera.','树荫、叶子，和一台很有耐心的相机。'],
 ['ren','Ren','阿仁','pasir-ris','Here for the stories behind each photo.','喜欢听每张照片背后的故事。'],
 ['asha','Asha','阿莎','punggol','A small album to brighten the end of the day.','用一本小相册点亮一天的尾声。'],
 ['bo','Bo','阿波','sengkang','Blurry photos count as memories too.','模糊照片也算珍贵的回忆。'],
 ['qi','Qi','小琪','clementi','New to cat photography. Happy to learn from neighbours.','刚开始学拍猫，想向邻居们多学习。'],
] as const;

export const SAMPLE_PEOPLE = people.map(([id,en,zh,communitySlug,bioEn,bioZh])=>({id,fixtureName:`Demo ${en}`,name:{en,zh},communitySlug,bio:{en:bioEn,zh:bioZh}}));
export function samplePerson(id:string){return SAMPLE_PEOPLE.find(person=>person.id===id)??null;}
export function samplePersonForName(name:string){return SAMPLE_PEOPLE.find(person=>person.fixtureName===name)??null;}
export function personText(text:{en:string;zh:string},locale:Locale){return locale==='zh-CN'?text.zh:text.en;}
