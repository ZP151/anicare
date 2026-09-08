import { useCallback } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { Pressable, Text } from 'react-native';
import { listFollowedCats } from '../../src/api/follows';
import { useAccountSession } from '../../src/auth/use-account-session';
import { CatList } from '../../src/following/CatList';
import { useCatPage } from '../../src/following/use-cat-page';
import { ScreenScaffold } from '../../src/components/ScreenScaffold';
import { careStyles as styles } from '../../src/care/CareEntry';
import { useLocale } from '../../src/i18n/LocaleContext';
export default function FollowingScreen(){
 const {locale}=useLocale();const cn=locale==='zh-CN';const router=useRouter();const auth=useAccountSession();
 const fetchPage=useCallback((cursor:string|null)=>listFollowedCats({cursor}),[]);const list=useCatPage(fetchPage,auth.pin);
 useFocusEffect(useCallback(()=>{list.clear();if(auth.owner)void list.load();return list.clear;},[auth.owner,list.load,list.clear]));
 return <ScreenScaffold title={cn?'关注':'Following'} subtitle={cn?'重新打开猫档案，查看照护记录。':'Return to cat profiles and read care records.'}>
 {auth.owner===undefined?<><Text>{auth.failed?(cn?'账户不可用':'Account unavailable'):(cn?'正在加载…':'Loading…')}</Text>{auth.failed?<Pressable accessibilityRole="button" style={styles.choice} onPress={()=>{void auth.reload();}}><Text>{cn?'重试':'Retry'}</Text></Pressable>:null}</>:auth.owner===null?<Pressable accessibilityRole="button" style={styles.choice} onPress={()=>router.push('/profile' as never)}><Text>{cn?'登录后关注猫':'Sign in to follow cats.'}</Text></Pressable>:<CatList {...list} refresh={()=>{void list.load();}} more={()=>{void list.load(list.page.nextCursor);}} empty={cn?'当前没有可公开查看的关注猫。':'No followed cats are currently available.'}/>}
 </ScreenScaffold>;
}
