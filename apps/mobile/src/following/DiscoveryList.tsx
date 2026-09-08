import { useCallback, useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { listDiscoveredCats } from '../api/follows';
import { useAccountSession } from '../auth/use-account-session';
import { useLocale } from '../i18n/LocaleContext';
import { useNativeColors } from '../design/native-colors';
import { AppIcon } from '../components/AppIcon';
import { ScreenScaffold } from '../components/ScreenScaffold';
import { CatList } from './CatList';
import { useCatPage } from './use-cat-page';
const areas=[['896520ca163ffff','Jurong','裕廊'],['89652636d87ffff','MacRitchie','麦里芝'],['896526add03ffff','Tampines','淡滨尼']] as const;
export function DiscoveryList(){
 const {locale}=useLocale();const cn=locale==='zh-CN';const auth=useAccountSession();
 const colors=useNativeColors(); const styles=makeStyles(colors);
 const [filtersOpen,setFiltersOpen]=useState(false);
 const [cell,setCell]=useState<string|null>(null);const [confirmed,setConfirmed]=useState(false);
 const fetchPage=useCallback((cursor:string|null)=>listDiscoveredCats({cursor,publicCellId:cell,confirmed}),[cell,confirmed]);const list=useCatPage(fetchPage,auth.pin);
 useEffect(()=>{list.clear();if(auth.owner!==undefined)void list.load();return list.clear;},[auth.owner,list.load,list.clear]);
 return <View style={styles.container}>
 <Pressable accessibilityRole="button" accessibilityLabel={cn?'筛选猫咪':'Filter cats'} onPress={()=>setFiltersOpen(true)} style={[styles.choice,styles.filterButton]}><Text style={styles.choiceText}>{cell?(areas.find(area=>area[0]===cell)?.[cn?2:1]):(cn?'所有区域':'All areas')}{confirmed?(cn?' · 已确认':' · Confirmed'):''}</Text><AppIcon name="filters" color={colors.actionPrimary} size={19}/></Pressable>
 <Modal visible={filtersOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={()=>setFiltersOpen(false)}><ScreenScaffold title={cn?'筛选':'Filters'} trailing={<Pressable accessibilityRole="button" onPress={()=>setFiltersOpen(false)} style={styles.choice}><Text style={styles.choiceText}>{cn?'完成':'Done'}</Text></Pressable>}>
 <Text style={styles.note}>{cn?'按延迟公开的活动区域查找，不代表猫的当前位置。':'Find cats by delayed activity areas, not their current location.'}</Text>
 <View style={styles.filters}>{[[null,'All areas','所有区域'],...areas].map(([id,en,zh])=><Pressable key={id??'all'} accessibilityRole="button" accessibilityState={{selected:cell===id}} style={[styles.choice,cell===id&&styles.selected]} onPress={()=>setCell(id)}><Text style={[styles.choiceText,cell===id&&styles.selectedText]}>{cn?zh:en}</Text></Pressable>)}</View>
 <View style={styles.filters}>{[false,true].map(value=><Pressable key={String(value)} accessibilityRole="button" accessibilityState={{selected:confirmed===value}} style={[styles.choice,confirmed===value&&styles.selected]} onPress={()=>setConfirmed(value)}><Text style={[styles.choiceText,confirmed===value&&styles.selectedText]}>{value?(cn?'已确认':'Confirmed'):(cn?'所有身份状态':'All identity states')}</Text></Pressable>)}</View>
 </ScreenScaffold></Modal>
 {auth.failed?<Pressable accessibilityRole="button" style={styles.choice} onPress={()=>{void auth.reload();}}><Text style={styles.choiceText}>{cn?'重试账户连接':'Retry account connection'}</Text></Pressable>:null}
 <CatList {...list} refresh={()=>{void list.load();}} more={()=>{void list.load(list.page.nextCursor);}} empty={cn?'当前条件下暂无延迟公开活动。':'No delayed public activity matches these filters.'}/></View>;
}
const makeStyles=(colors: ReturnType<typeof useNativeColors>)=>StyleSheet.create({
 container:{gap:8}, filterButton:{alignSelf:'flex-start',flexDirection:'row',alignItems:'center',gap:12}, note:{color:colors.muted,fontSize:15,lineHeight:21}, filters:{flexDirection:'row',flexWrap:'wrap',gap:8},
 choice:{minHeight:44,paddingHorizontal:14,borderRadius:22,justifyContent:'center',backgroundColor:colors.surface}, selected:{backgroundColor:colors.leafSoft},
 choiceText:{color:colors.ink,fontSize:15,fontWeight:'600'}, selectedText:{color:colors.actionPrimary},
});
