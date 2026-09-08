import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { listDiscoveredCats } from '../api/follows';
import { useAccountSession } from '../auth/use-account-session';
import { useLocale } from '../i18n/LocaleContext';
import { careStyles as styles } from '../care/CareEntry';
import { CatList } from './CatList';
import { useCatPage } from './use-cat-page';
const areas=[['896520ca163ffff','Jurong','裕廊'],['89652636d87ffff','MacRitchie','麦里芝'],['896526add03ffff','Tampines','淡滨尼']] as const;
export function DiscoveryList(){
 const {locale}=useLocale();const cn=locale==='zh-CN';const auth=useAccountSession();
 const [cell,setCell]=useState<string|null>(null);const [confirmed,setConfirmed]=useState(false);
 const fetchPage=useCallback((cursor:string|null)=>listDiscoveredCats({cursor,publicCellId:cell,confirmed}),[cell,confirmed]);const list=useCatPage(fetchPage,auth.pin);
 useEffect(()=>{list.clear();if(auth.owner!==undefined)void list.load();return list.clear;},[auth.owner,list.load,list.clear]);
 return <View style={{gap:12}}><Text>{cn?'按延迟公开的活动区域查找，不代表猫的当前位置。':'Find cats by delayed activity areas, not their current location.'}</Text>
 <View style={{flexDirection:'row',flexWrap:'wrap',gap:6}}>{[[null,'All areas','所有区域'],...areas].map(([id,en,zh])=><Pressable key={id??'all'} accessibilityRole="button" accessibilityState={{selected:cell===id}} style={styles.choice} onPress={()=>setCell(id)}><Text>{cn?zh:en}</Text></Pressable>)}</View>
 <View style={{flexDirection:'row',flexWrap:'wrap',gap:6}}>{[false,true].map(value=><Pressable key={String(value)} accessibilityRole="button" accessibilityState={{selected:confirmed===value}} style={styles.choice} onPress={()=>setConfirmed(value)}><Text>{value?(cn?'已确认':'Confirmed'):(cn?'所有身份状态':'All identity states')}</Text></Pressable>)}</View>
 {auth.failed?<Pressable accessibilityRole="button" style={styles.choice} onPress={()=>{void auth.reload();}}><Text>{cn?'重试账户连接':'Retry account connection'}</Text></Pressable>:null}
 <CatList {...list} refresh={()=>{void list.load();}} more={()=>{void list.load(list.page.nextCursor);}} empty={cn?'当前条件下暂无延迟公开活动。':'No delayed public activity matches these filters.'}/></View>;
}
