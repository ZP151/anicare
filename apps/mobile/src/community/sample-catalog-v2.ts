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
 ['ios26-s37','00000000-0000-4000-8000-00000000a137','Snowdrop 雪团','v3-snowdrop-1.jpg','896526ad843ffff'],
 ['ios26-s38','00000000-0000-4000-8000-00000000a138','Sesame 芝麻','v3-sesame-1.jpg','896526ac9d3ffff'],
 ['ios26-s39','00000000-0000-4000-8000-00000000a139','Cocoa 可豆','v3-cocoa-1.jpg','896520ca65bffff'],
 ['ios26-s40','00000000-0000-4000-8000-00000000a140','Fern 蕨蕨','v3-fern-1.jpg','89652634b87ffff'],
 ['ios26-s41','00000000-0000-4000-8000-00000000a141','Ash 炭炭','v3-ash-1.jpg','89652636a4bffff'],
 ['ios26-s42','00000000-0000-4000-8000-00000000a142','Mango 芒果','v3-mango-1.jpg','89652636427ffff'],
 ['ios26-s43','00000000-0000-4000-8000-00000000a143','Mist 雾雾','v3-mist-1.jpg','8965263753bffff'],
 ['ios26-s44','00000000-0000-4000-8000-00000000a144','Dot 点点','v3-dot-1.jpg','896520d832fffff'],
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
 [4, 0, "pasir-ris", ["v3-snowdrop-1.jpg"], "A breeze through Snowdrop’s fur", "海风吹过雪团", "The long white coat caught the sea breeze. I stayed on the path and let Snowdrop rest.", "白色长毛随海风轻轻摆动。我留在步道上，让雪团安静休息。"],
 [5, 1, "geylang", ["v3-sesame-1.jpg"], "Sesame by the terracotta steps", "陶砖台阶旁的芝麻", "A tiny cream eyebrow and a mottled coat: Sesame blends into the warm tiles.", "奶油色小眉毛、斑驳的毛色，芝麻融进了暖色地砖里。"],
 [6, 2, "bukit-batok", ["v3-cocoa-1.jpg"], "Cocoa beside the granite trail", "花岗岩步道旁的可豆", "Blue eyes, dark paws, and a quiet patch of shade beside the rocks.", "蓝眼睛、深色爪子，还有岩石旁一小块安静的树荫。"],
 [7, 3, "woodlands", ["v3-fern-1.jpg"], "Fern in the community garden", "社区花园里的蕨蕨", "This small striped neighbour found a seat beside the fern planter.", "这位小小的条纹邻居，在蕨类花盆旁找到了座位。"],
 [8, 0, "yishun", ["v3-ash-1.jpg"], "Ash watches the blue benches", "炭炭望着蓝色长椅", "Yellow eyes followed a falling leaf across the quiet void deck.", "黄色眼睛追着一片落叶，看它飘过安静的楼下空间。"],
 [9, 1, "hougang", ["v3-mango-1.jpg"], "Mango and that enormous tail", "芒果和蓬松的大尾巴", "The brick planter was just wide enough for a ginger afternoon nap.", "砖砌花坛的宽度，刚好够这位橘色朋友睡个午觉。"],
 [10, 2, "punggol", ["v3-mist-1.jpg"], "Mist by the water", "水边的雾雾", "Silver swirls and tall grasses on a slow waterfront walk.", "慢慢走过水岸，看见银色卷纹和高高的草丛。"],
 [11, 3, "queenstown", ["v3-dot-1.jpg"], "Two spots and a black tail", "两块斑点，一条黑尾巴", "Dot paused on the cream wall before heading back toward the garden.", "点点在奶油色矮墙上停了一会儿，又朝花园走去。"],
] as const;
export const ACTIVE_COMMUNITY_TEST_POSTS = stories.map(([cat,actor,communitySlug,media,titleEn,titleZh,en,zh],index)=>{
 const code=`C${57+index}`, profile=SAMPLE_ACTORS_V2[actor], replyProfile=SAMPLE_ACTORS_V2[(actor+1)%SAMPLE_ACTORS_V2.length]!;
 return {id:`00000000-0000-4000-8000-00000000c${157+index}`,code,communitySlug,catId:SAMPLE_CATS_V2[cat][1],media,
 ageHours:2+index,profile,replyProfile,title:{en:titleEn,zh:titleZh},body:{en:`[Test sample ${code}] ${en}`,zh},
 reply:{id:`00000000-0000-4000-8000-00000000d${157+index}`,code,body:{en:`[Test sample ${code}] I recognise this neighbour too. The linked cat album brings our photos together.`,zh:'我也认得这位小邻居。关联的猫咪相册把大家的照片放在了一起。'}}};
});
