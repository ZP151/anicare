import { useRouter } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import type { CatPage } from '../api/follows';
import { careStyles as styles } from '../care/CareEntry';
import { getCommunityMapCopy } from '../i18n/catalog';
import { useLocale } from '../i18n/LocaleContext';
export function CatList({page,loading,failed,refresh,more,empty}:{page:CatPage;loading:boolean;failed:boolean;refresh:()=>void;more:()=>void;empty:string}){
 const {locale}=useLocale();const cn=locale==='zh-CN';const router=useRouter();const copy=getCommunityMapCopy(locale);
 return <View style={{gap:12}}><Pressable accessibilityRole="button" style={styles.choice} disabled={loading} onPress={refresh}><Text>{cn?'刷新猫列表':'Refresh cats'}</Text></Pressable>
 {loading?<Text accessibilityLiveRegion="polite">{cn?'正在加载…':'Loading…'}</Text>:null}
 {failed?<Text accessibilityRole="alert">{cn?'加载失败，请刷新重试。':'Could not load cats. Refresh to retry.'}</Text>:null}
 {!loading&&!failed&&page.items.length===0?<Text>{empty}</Text>:null}
 {page.items.map(cat=><View key={cat.animalId} style={styles.box}><Text>{cat.primaryAlias}</Text><Text>{copy.verificationLabel(cat.verification)}</Text><Text>{cat.timeBucket?copy.timeLabel(cat.timeBucket):(cn?'暂无公开活动':'No public activity yet')}</Text><Pressable accessibilityRole="button" accessibilityLabel={cn?`查看 ${cat.primaryAlias}`:`View ${cat.primaryAlias}`} style={styles.choice} onPress={()=>router.push(`/cat/${cat.animalId}` as never)}><Text>{cn?'打开猫档案':'Open cat profile'}</Text></Pressable></View>)}
 {page.nextCursor?<Pressable accessibilityRole="button" style={styles.choice} disabled={loading} onPress={more}><Text>{cn?'加载更多猫':'Load more cats'}</Text></Pressable>:null}</View>;
}
