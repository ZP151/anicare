/** Synthetic actors and cats for the C1 acceptance repair. No sign-in credentials. */
export const SAMPLE_ACTORS_V2 = [
 {id:'00000000-0000-4000-8000-00000000b201',name:'Demo Mei',avatarKey:'human-01',photo:'woman' as const},
 {id:'00000000-0000-4000-8000-00000000b202',name:'Demo Kai',avatarKey:'human-02',photo:'man' as const},
 {id:'00000000-0000-4000-8000-00000000b203',name:'Demo Lin',avatarKey:'human-03',photo:null},
 {id:'00000000-0000-4000-8000-00000000b204',name:'Demo Noor',avatarKey:'human-04',photo:null},
] as const;
export const SAMPLE_CATS_V2 = [
 ['ios26-s33','00000000-0000-4000-8000-00000000a133','Honey 蜜糖','v2-honey-1.jpg','896520ca163ffff'],
 ['ios26-s34','00000000-0000-4000-8000-00000000a134','Pebble 卵石','v2-pebble-1.jpg','89652636d87ffff'],
 ['ios26-s35','00000000-0000-4000-8000-00000000a135','Patch 拼拼','v2-patch-1.jpg','896526add03ffff'],
 ['ios26-s36','00000000-0000-4000-8000-00000000a136','Orbit 星环','v2-orbit-1.jpg','896520d9073ffff'],
] as const;
const stories = [
 [0,0,'jurong-west',['v2-honey-1.jpg','v2-honey-2.jpg','v2-honey-3.jpg','v2-honey-4.jpg','v2-honey-5.jpg','v2-honey-6.jpg'],'Six quiet moments with Honey','蜜糖的六个悠闲瞬间','A little album from the garden: sitting, strolling and a very long nap.','花园里的小相册：坐一会儿，走几步，再睡个长觉。'],
 [0,1,'jurong-west',['v2-honey-7.jpg'],'Honey on the evening path','傍晚步道上的蜜糖','Recognised those white socks again. A different neighbour, the same Honey.','又认出了那双白袜子。不同邻居遇见的，还是同一只蜜糖。'],
 [1,2,'macritchie',['v2-pebble-1.jpg','v2-pebble-2.jpg'],'Pebble after the rain','雨后的卵石','The tiles were still damp. Pebble found a dry spot under the bench.','地砖还湿着，卵石已经在长椅下找到了干燥的地方。'],
 [1,0,'macritchie',['v2-pebble-3.jpg'],'A pause among the ferns','蕨叶间的小小停顿','Spotted Pebble sitting quietly among the leaves this morning.','今早看见卵石安静地坐在树叶间。'],
 [2,3,'tampines',['v2-patch-1.jpg','v2-patch-2.jpg'],'Patch and the garden bench','拼拼与花园长椅','One calico, two hiding places. The little black tail tip gave Patch away.','一只三花，两个藏身处。黑色的小尾尖还是暴露了拼拼。'],
 [2,1,'tampines',['v2-patch-3.jpg'],'That over-the-shoulder look','回头看一眼','Patch stopped at the curb and looked back just as I passed.','我经过时，拼拼在路沿停下来回头看了一眼。'],
 [3,0,'toa-payoh',['v2-orbit-1.jpg','v2-orbit-2.jpg'],'Orbit, day into night','星环，从白天到夜晚','A stretch in the shade, then a blurry evening stroll.','先在阴凉处伸个懒腰，再来一场有点模糊的夜间漫步。'],
 [3,2,'toa-payoh',['v2-orbit-3.jpg'],'Orbit keeps the wall warm','星环的围墙午休','The white nose stripe makes this little neighbour easy to recognise.','鼻子上的白色条纹，让这位小邻居很好认。'],
] as const;
export const ACTIVE_COMMUNITY_TEST_POSTS = stories.map(([cat,actor,communitySlug,media,titleEn,titleZh,en,zh],index)=>{
 const code=`C${57+index}`, profile=SAMPLE_ACTORS_V2[actor], replyProfile=SAMPLE_ACTORS_V2[(actor+1)%SAMPLE_ACTORS_V2.length]!;
 return {id:`00000000-0000-4000-8000-00000000c${157+index}`,code,communitySlug,catId:SAMPLE_CATS_V2[cat][1],media,
 ageHours:2+index,profile,replyProfile,title:{en:titleEn,zh:titleZh},body:{en:`[Test sample ${code}] ${en}`,zh},
 reply:{id:`00000000-0000-4000-8000-00000000d${157+index}`,code,body:{en:`[Test sample ${code}] I recognise this neighbour too. The linked cat album brings our photos together.`,zh:'我也认得这位小邻居。关联的猫咪相册把大家的照片放在了一起。'}}};
});
