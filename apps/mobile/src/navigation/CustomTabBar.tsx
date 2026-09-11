import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { tabBarBottom } from './tab-layout';
import { AppIcon } from '../components/AppIcon';
import { GlassSurface } from '../design/GlassSurface';
import { useNativeColors } from '../design/native-colors';
import { useLocale } from '../i18n/LocaleContext';

const copy={index:{en:'Home',zh:'首页',icon:'home' as const},map:{en:'Map',zh:'地图',icon:'map' as const},discuss:{en:'Messages',zh:'消息',icon:'mail' as const},profile:{en:'Me',zh:'我的',icon:'account' as const}};
type RouteName=keyof typeof copy;
type TabRoute={key:string;name:string};
type CustomTabBarProps={state:{index:number;routes:readonly TabRoute[]};navigation:{navigate(name:string):void}};
const isRouteName=(name:string):name is RouteName=>name in copy;
export function CustomTabBar({state,navigation}:CustomTabBarProps){const router=useRouter(),c=useNativeColors(),{locale}=useLocale(),insets=useSafeAreaInsets(),cn=locale==='zh-CN';const routes=state.routes.filter(route=>isRouteName(route.name));return <GlassSurface accessibilityLabel={cn?'主导航':'Main navigation'} interactive style={[styles.bar,{bottom:tabBarBottom(insets.bottom)}]}><View style={styles.row}>{routes.slice(0,2).map(route=><Tab key={route.key} route={route.name as RouteName} selected={state.index===state.routes.findIndex(item=>item.key===route.key)} onPress={()=>navigation.navigate(route.name)}/>) }<Pressable accessibilityRole="button" accessibilityLabel={cn?'创建':'Create'} onPress={()=>router.push('/create' as never)} style={[styles.create,{backgroundColor:c.actionPrimary}]}><AppIcon name="plus" color={c.onAction} size={23}/></Pressable>{routes.slice(2).map(route=><Tab key={route.key} route={route.name as RouteName} selected={state.index===state.routes.findIndex(item=>item.key===route.key)} onPress={()=>navigation.navigate(route.name)}/>)}</View></GlassSurface>;}
function Tab({route,selected,onPress}:{route:keyof typeof copy;selected:boolean;onPress():void}){const c=useNativeColors(),{locale}=useLocale(),cn=locale==='zh-CN',item=copy[route];return <Pressable accessibilityRole="tab" accessibilityState={{selected}} accessibilityLabel={cn?item.zh:item.en} onPress={onPress} style={[styles.tab,selected&&{backgroundColor:'rgba(128,128,128,0.12)',borderRadius:24}]}><AppIcon name={item.icon} color={selected?c.actionPrimary:c.muted} size={20}/><Text style={{color:selected?c.actionPrimary:c.muted,fontSize:11}}>{cn?item.zh:item.en}</Text></Pressable>}
const styles=StyleSheet.create({bar:{position:'absolute',left:12,right:12,borderRadius:30,padding:6},row:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:4},tab:{flex:1,minWidth:44,minHeight:48,alignItems:'center',justifyContent:'center',gap:2},create:{width:48,height:48,borderRadius:24,alignItems:'center',justifyContent:'center',marginHorizontal:2}});
