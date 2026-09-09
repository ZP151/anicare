import { PlaceSearch, MyLocationButton } from '../../src/maps/PlaceSearch';
import type { NearbyMapProps } from '../../src/maps/NearbyMap.types';
import type { SingaporeRegion } from '@animalhelper/domain';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { listPublicSightings, type PublicSighting, type NarrowRpcClient } from '../../src/api/feed';
import { getSightingPlaces, type SightingPlace } from '../../src/api/sighting-places';
import { getSupabaseClient } from '../../src/api/supabase';
import { readSessionSubjectStrict, subscribeSessionSubject } from '../../src/auth/session-subject';
import { AppIcon } from '../../src/components/AppIcon';
import { GlassSurface } from '../../src/design/GlassSurface';
import { useNativeColors } from '../../src/design/native-colors';
import { useLocale } from '../../src/i18n/LocaleContext';
import { NearbyMap } from '../../src/maps/NearbyMap';
import { buildSingaporeAreas, filterSingaporeAreas, communityLabel, SG_COMMUNITIES, SG_REGIONS, type SingaporeArea } from '../../src/maps/singapore-communities';

export default function MapScreen(){
 const {locale}=useLocale(); const cn=locale==='zh-CN'; const router=useRouter(); const colors=useNativeColors(); const styles=makeStyles(colors);
 const params=useLocalSearchParams<{communityId?:string}>();
 const desiredCommunity=SG_COMMUNITIES.some(area=>area.id===params.communityId)?params.communityId!:null;
 const client=getSupabaseClient() as unknown as NarrowRpcClient|null;
 const [areas,setAreas]=useState<readonly SingaporeArea[]>(()=>buildSingaporeAreas([],new Map(),locale));
 const [searchMode,setSearchMode]=useState<'cats'|'places'>('places');
 const [focusPoint,setFocusPoint]=useState<NearbyMapProps['focusPoint']>(null);
 const [region,setRegion]=useState<SingaporeRegion|'all'>('all'); const [query,setQuery]=useState('');
 const [selectedId,setSelectedId]=useState<string|null>(null); const [listOnly,setListOnly]=useState(false);
 const [loading,setLoading]=useState(false); const [error,setError]=useState(false); const [hasMore,setHasMore]=useState(false); const [mapKey,setMapKey]=useState(0);
 const rows=useRef<PublicSighting[]>([]); const places=useRef(new Map<string,SightingPlace>()); const cursor=useRef<string|null>(null); const generation=useRef(0); const busy=useRef(false);
 const load=useCallback(async(reset=true)=>{
   if(busy.current&&!reset)return;
   const ticket=++generation.current; busy.current=true;setLoading(true);setError(false);
   if(reset){rows.current=[];places.current=new Map();cursor.current=null;setHasMore(false);setSelectedId(desiredCommunity);setAreas(buildSingaporeAreas([],new Map(),locale));}
   try{
     if(!client)throw new Error('unconfigured');
     const owner=await readSessionSubjectStrict();
     const page=await listPublicSightings({limit:50,cursor:reset?null:cursor.current},client);
     const metadata=await getSightingPlaces(page.items.map(item=>item.sightingId),client);
     if(ticket!==generation.current || owner!==await readSessionSubjectStrict())return;
     rows.current=[...rows.current,...page.items]; for(const [id,place] of metadata)places.current.set(id,place);
     cursor.current=page.nextCursor;setHasMore(page.items.length===50);setAreas(buildSingaporeAreas(rows.current,places.current,locale));
   }catch{if(ticket===generation.current)setError(true);}
   finally{if(ticket===generation.current){busy.current=false;setLoading(false);}}
 },[client,locale,desiredCommunity]);
 useEffect(()=>{void load();const unsubscribe=subscribeSessionSubject(()=>{void load();});return()=>{generation.current++;unsubscribe();};},[load]);
 const filtered=filterSingaporeAreas(areas,region,query); const selected=areas.find(area=>area.id===selectedId);
 const children=selected?areas.filter(area=>area.parentId===selected.id):[];
 const mapAreas=selected?[selected,...children]:filtered;
 const catCount=new Set(filtered.flatMap(area=>area.cats.map(cat=>cat.animalId))).size;
 const openCommunity=(area?:SingaporeArea)=>router.push((area?`/community?communitySlug=${area.id}`:'/community') as never);
 return <View style={styles.screen}>
   {!listOnly&&<View style={StyleSheet.absoluteFill}><NearbyMap focusPoint={focusPoint} key={mapKey} areas={mapAreas} selectedAreaId={selectedId} onSelectArea={setSelectedId} fallbackLabel={cn?'地图暂不可用，下方仍可浏览社区。':'Map unavailable. Browse communities below.'}/></View>}
   <SafeAreaView edges={['top']} style={styles.overlay} pointerEvents="box-none">
     <GlassSurface style={styles.header}>
       <View style={styles.heading}><View style={{flex:1}}><Text style={styles.title}>{cn?'社区猫地图':'Community cats'}</Text></View><Pressable accessibilityRole="button" accessibilityLabel={cn?'社区讨论':'Community discussions'} onPress={()=>openCommunity()} style={styles.icon}><AppIcon name="mail" color={colors.actionPrimary}/></Pressable></View>
       <View style={{flexDirection:'row',gap:8}}>{(['places','cats'] as const).map(mode=><Pressable key={mode} accessibilityRole="button" accessibilityState={{selected:searchMode===mode}} onPress={()=>setSearchMode(mode)} style={[styles.chip,searchMode===mode&&styles.activeChip]}><Text style={[styles.chipText,searchMode===mode&&styles.activeText]}>{mode==='places'?(cn?'地点':'Places'):(cn?'社区与猫':'Communities & cats')}</Text></Pressable>)}</View>
       {searchMode==='places'?<PlaceSearch cn={cn} onSelect={place=>{setSelectedId(null);setFocusPoint({...place,title:place.name});}}/>:<View style={styles.search}><AppIcon name="location" size={19} color={colors.muted}/><TextInput accessibilityLabel={cn?'搜索社区、猫或楼栋':'Search community, cat or building'} placeholder={cn?'社区、猫名、HDB / Condo':'Community, cat, HDB / Condo'} placeholderTextColor={colors.muted} value={query} onChangeText={value=>{setQuery(value);setSelectedId(null);setFocusPoint(null);}} style={styles.input}/></View>}
       <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>{[{id:'all' as const,en:'All',zh:'全岛'},...SG_REGIONS].map(item=><Pressable key={item.id} accessibilityRole="button" accessibilityState={{selected:region===item.id}} onPress={()=>{setRegion(item.id);setSelectedId(null);}} style={[styles.chip,region===item.id&&styles.activeChip]}><Text style={[styles.chipText,region===item.id&&styles.activeText]}>{cn?item.zh:item.en}</Text></Pressable>)}</ScrollView>
     </GlassSurface>
     <View style={styles.space} pointerEvents="box-none"><View style={styles.controls}><GlassSurface style={styles.round}><MyLocationButton cn={cn} onLocation={setFocusPoint}/></GlassSurface><GlassSurface style={styles.round}><Pressable accessibilityRole="button" accessibilityLabel={cn?'显示全岛':'Show all Singapore'} onPress={()=>{setSelectedId(null);setRegion('all');setQuery('');setMapKey(k=>k+1);setFocusPoint(null);}} style={styles.icon}><AppIcon name="location" color={colors.actionPrimary}/></Pressable></GlassSurface><GlassSurface style={styles.round}><Pressable accessibilityRole="button" accessibilityLabel={cn?'切换地图与列表':'Toggle map and list'} onPress={()=>setListOnly(value=>!value)} style={styles.icon}><AppIcon name="reports" color={colors.actionPrimary}/></Pressable></GlassSurface></View></View>
     <View style={[styles.panel,listOnly&&styles.expanded]}>
       {focusPoint?<View style={styles.heading}><AppIcon name="location" color={colors.actionPrimary}/><Text style={[styles.name,{flex:1}]}>{focusPoint.title}</Text><Pressable accessibilityRole="button" onPress={()=>setFocusPoint(null)} style={styles.icon}><Text style={styles.chipText}>{cn?'关闭':'Close'}</Text></Pressable></View>:null}
       <View style={styles.heading}>{selected?<Pressable accessibilityRole="button" accessibilityLabel={cn?'返回社区列表':'Back to communities'} onPress={()=>setSelectedId(selected.parentId??null)} style={styles.icon}><AppIcon name="back" color={colors.actionPrimary}/></Pressable>:null}<View style={{flex:1}}><Text style={styles.panelTitle}>{selected?communityLabel(selected,locale):(cn?'探索社区':'Explore communities')}</Text><Text style={styles.meta}>{error?(cn?'活动暂未载入':'Activity not loaded'):selected?(cn?`${selected.cats.length} 只猫 · 延迟公开活动`:`${selected.cats.length} cats · delayed activity`):(cn?`${catCount} 只猫 · ${filtered.length} 个${query.trim()?'区域 / 邻里':'规划区'}`:`${catCount} cats · ${filtered.length} ${query.trim()?'areas / neighbourhoods':'planning areas'}`)}</Text></View><Pressable accessibilityRole="button" accessibilityLabel={cn?'刷新':'Refresh'} onPress={()=>void load()} style={styles.icon}><AppIcon name="activity" color={colors.actionPrimary}/></Pressable></View>
       {loading?<ActivityIndicator accessibilityLabel={cn?'加载社区活动':'Loading community activity'} color={colors.actionPrimary}/>:null}
       {error?<Pressable accessibilityRole="button" onPress={()=>void load()}><Text style={styles.error}>{cn?'活动暂未载入，点此重试':'Activity could not load. Tap to retry.'}</Text></Pressable>:null}
       <ScrollView contentContainerStyle={styles.rows} showsVerticalScrollIndicator={false}>
         {selected?<>
           <Text style={styles.meta}>{selected.parentId?`${communityLabel(SG_COMMUNITIES.find(a=>a.id===selected.parentId)!,locale)} › ${communityLabel(selected,locale)}`:(cn?`${children.length} 个邻里`:`${children.length} neighbourhoods`)}</Text>
           {children.map(child=><Pressable key={child.id} accessibilityRole="button" onPress={()=>setSelectedId(child.id)} style={styles.row}><AppIcon name="location" color={colors.actionPrimary}/><View style={{flex:1}}><Text style={styles.name}>{communityLabel(child,locale)}</Text></View><Text style={styles.count}>{error?'—':child.cats.length}</Text><AppIcon name="chevron" size={16} color={colors.muted}/></Pressable>)}


           {selected.cats.map(cat=><Pressable accessibilityRole="button" key={cat.animalId} onPress={()=>router.push(`/cat/${cat.animalId}` as never)} style={styles.row}><View style={styles.avatar}><AppIcon name="cat" color={colors.actionPrimary}/></View><View style={{flex:1,gap:4}}><Text style={styles.name}>{cat.alias}</Text><Text style={styles.meta}>{cat.residenceType?`${cat.residenceType==='hdb'?'HDB':cat.residenceType==='condo'?'Condo':cn?'其他':'Other'} · ${cat.residenceName}`:cn?'楼栋信息未提供':'Building not provided'}</Text><Text style={styles.meta}>{cat.timeLabel}</Text></View><AppIcon name="chevron" color={colors.muted} size={16}/></Pressable>)}
           {!selected.cats.length&&!loading&&!error?<Text style={styles.meta}>{cn?'这里尚无已公开的猫记录。可报告目击，或发起社区讨论。':'No public cat records here yet. Report a sighting or start a discussion.'}</Text>:null}
           <View style={styles.actions}><Pressable accessibilityRole="button" onPress={()=>router.push('/report' as never)} style={styles.primary}><Text style={styles.primaryText}>{cn?'报告目击':'Report sighting'}</Text></Pressable><Pressable accessibilityRole="button" onPress={()=>openCommunity(selected)} style={styles.secondary}><Text style={styles.chipText}>{cn?'社区讨论':'Discuss'}</Text></Pressable></View>
         </>:filtered.map(area=><Pressable accessibilityRole="button" accessibilityLabel={`${communityLabel(area,locale)}, ${area.cats.length} ${cn?'只猫':'cats'}`} key={area.id} onPress={()=>setSelectedId(area.id)} style={styles.row}><View style={styles.avatar}><AppIcon name="location" color={colors.actionPrimary}/></View><View style={{flex:1,gap:4}}><Text style={styles.name}>{communityLabel(area,locale)}</Text><Text style={styles.meta}>{area.parentId?`${SG_COMMUNITIES.find(p=>p.id===area.parentId)?.name} · ${cn?'邻里':'Neighbourhood'}`:SG_REGIONS.find(item=>item.id===area.region)?.[cn?'zh':'en']}</Text></View><Text style={styles.count}>{error?'—':area.cats.length}</Text><AppIcon name="chevron" size={16} color={colors.muted}/></Pressable>)}
         {!filtered.length?<Text style={styles.meta}>{cn?'没有匹配的社区、猫或楼栋。':'No matching community, cat or building.'}</Text>:null}
         {hasMore?<Pressable accessibilityRole="button" disabled={loading} onPress={()=>void load(false)} style={styles.secondary}><Text style={styles.chipText}>{cn?'载入更多活动':'Load more activity'}</Text></Pressable>:null}
         <Pressable accessibilityRole="link" onPress={()=>router.push('/community/geography' as never)}><Text style={styles.credit}>{cn?'社区与官方划分说明':'About communities and official boundaries'}</Text></Pressable>
         <Pressable accessibilityRole="link" onPress={()=>void Linking.openURL(selected?.parentId?'https://data.gov.sg/datasets/d_8594ae9ff96d0c708bc2af633048edfb/view':'https://data.gov.sg/datasets/d_2cc750190544007400b2cfd5d7f53209/view')}><Text style={styles.credit}>{selected?.parentId?'URA MP2019 · Subzones':'URA MP2025 · Planning areas'} · Singapore Open Data Licence</Text></Pressable>
       </ScrollView>
     </View>
   </SafeAreaView>
 </View>;
}
const makeStyles=(c:ReturnType<typeof useNativeColors>)=>StyleSheet.create({screen:{flex:1,backgroundColor:c.canvas},overlay:{flex:1,paddingHorizontal:16,paddingBottom:10,gap:12},header:{borderRadius:28,padding:16,gap:12},heading:{flexDirection:'row',alignItems:'center',gap:8},kicker:{color:c.actionPrimary,fontWeight:'700',fontSize:10,letterSpacing:2},title:{color:c.ink,fontSize:27,fontWeight:'700',letterSpacing:-.7},search:{flexDirection:'row',alignItems:'center',gap:8,borderRadius:16,paddingHorizontal:12,backgroundColor:c.surface,minHeight:44},input:{flex:1,color:c.ink,fontSize:15,paddingVertical:10},chips:{gap:6},chip:{minHeight:44,paddingHorizontal:14,borderRadius:22,justifyContent:'center',backgroundColor:c.surface},chipText:{fontSize:14,fontWeight:'600',color:c.actionPrimary},activeChip:{backgroundColor:c.actionPrimary},activeText:{color:c.onAction},space:{flex:1,minHeight:40},controls:{alignSelf:'flex-end',gap:8},round:{borderRadius:24},icon:{width:44,minHeight:44,alignItems:'center',justifyContent:'center'},panel:{maxHeight:'48%',padding:18,gap:12,backgroundColor:c.surface,borderRadius:28,shadowColor:'#173A32',shadowOpacity:.10,shadowRadius:18,shadowOffset:{width:0,height:4}},expanded:{maxHeight:'76%',flex:1},panelTitle:{fontSize:22,fontWeight:'700',color:c.ink},meta:{fontSize:13,lineHeight:19,color:c.muted},rows:{gap:2,paddingBottom:8},row:{flexDirection:'row',alignItems:'center',gap:12,paddingVertical:14,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:c.line},avatar:{width:44,height:44,borderRadius:16,backgroundColor:c.leafSoft,alignItems:'center',justifyContent:'center'},name:{fontSize:16,fontWeight:'600',color:c.ink},count:{fontSize:20,fontWeight:'700',color:c.actionPrimary},actions:{flexDirection:'row',gap:8,marginVertical:16},primary:{flex:1,minHeight:46,borderRadius:23,alignItems:'center',justifyContent:'center',backgroundColor:c.actionPrimary},primaryText:{fontSize:15,fontWeight:'600',color:c.onAction},secondary:{minHeight:46,paddingHorizontal:20,alignItems:'center',justifyContent:'center',borderRadius:23,backgroundColor:c.leafSoft},credit:{fontSize:10,lineHeight:16,color:c.muted,marginTop:14},error:{fontSize:13,lineHeight:19,color:c.actionPrimary}});
