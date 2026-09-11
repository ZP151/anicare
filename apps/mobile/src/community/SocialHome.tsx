import {useCallback,useEffect,useRef,useState} from 'react';
import {useRouter} from 'expo-router';
import {ActivityIndicator,FlatList,Image,Modal,Pressable,RefreshControl,ScrollView,Text,TextInput,View,useWindowDimensions} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {listCommunityPosts,type CommunityPost} from '../api/community';
import {getCommunityPostExtras,type CommunityPostExtra} from '../api/community-extras';
import {getCommunityReactions,type CommunityReaction} from '../api/community-reactions';
import {getCommunityAvatars} from '../api/community-avatar';
import {getCatPresentations,type CatPresentation} from '../api/cat-presentation';
import {useAccountSession} from '../auth/use-account-session';
import {useLocale} from '../i18n/LocaleContext';
import {AppIcon} from '../components/AppIcon';
import {ScreenScaffold} from '../components/ScreenScaffold';
import {useNativeColors} from '../design/native-colors';
import {CommunityAuthorAvatar} from './CommunityAuthorAvatar';
import {browseSingaporeCommunities,communityLabel,neighbourhoodForCoordinate,SG_COMMUNITIES} from '../maps/singapore-communities';
import {requestDeviceLocation} from '../maps/device-location';
import {CommunityLike} from './CommunityLike';
import {communitySampleText,communitySampleAuthor} from './test-samples';
import {CommunityPostImage} from './CommunityPostImage';

type Mode='explore'|'nearby';
export function SocialHome(){
 const auth=useAccountSession(),router=useRouter(),{locale}=useLocale(),c=useNativeColors(),zh=locale==='zh-CN';
 const {width,fontScale}=useWindowDimensions(),columns=fontScale>=1.3||width<350?1:2;
 const pager=useRef<ScrollView>(null),nearbyRequested=useRef(false),locationToken=useRef(0);
 const [mode,setMode]=useState<Mode>('explore'),[area,setArea]=useState<string|null>(null),[picker,setPicker]=useState(false),[search,setSearch]=useState(''),[parent,setParent]=useState<string|null>(null),[locating,setLocating]=useState(false),[manualFallback,setManualFallback]=useState(false);
 const [pagePosts,setPagePosts]=useState<Record<Mode,readonly CommunityPost[]>>({explore:[],nearby:[]}),[extras,setExtras]=useState(new Map<string,CommunityPostExtra>()),[portraits,setPortraits]=useState(new Map<string,CatPresentation>()),[avatars,setAvatars]=useState(new Map<string,string>()),[reactions,setReactions]=useState(new Map<string,CommunityReaction>());
 const [pageScopes,setPageScopes]=useState<Partial<Record<Mode,string>>>({}),[pageCursors,setPageCursors]=useState<Partial<Record<Mode,string|null>>>({});
 const setPosts=(next:readonly CommunityPost[]|((old:readonly CommunityPost[])=>readonly CommunityPost[]))=>setPagePosts(old=>({...old,[mode]:typeof next==='function'?(next as (items:readonly CommunityPost[])=>readonly CommunityPost[])(old[mode]):next}));
 const [loading,setLoading]=useState(false),[refreshing,setRefreshing]=useState(false),[failed,setFailed]=useState(false),[notice,setNotice]=useState('');
 const epoch=useRef(0),busy=useRef<number|null>(null),alive=useRef(true);
 const scopeFor=(page:Mode)=>JSON.stringify([auth.owner===undefined?'loading':auth.owner,page,page==='nearby'?area:null]);
 const currentScope=useRef(''),scope=scopeFor(mode);currentScope.current=scope;
 const cursor=pageScopes[mode]===scope?pageCursors[mode]??null:null;
 const load=useCallback(async(more=false,refresh=false)=>{
  if(auth.owner===undefined||mode==='nearby'&&!area||busy.current===epoch.current)return;
  const token=epoch.current,pinned=auth.pin(),captured=scope;busy.current=token;setFailed(false);if(refresh)setRefreshing(true);else setLoading(true);
  try{
   const page=await listCommunityPosts({cursor:more?cursor:null,communitySlug:mode==='nearby'?area:null});
   const [details,likes,people,pictures]=await Promise.all([getCommunityPostExtras(page.items.map(p=>p.postId)),getCommunityReactions(page.items.map(p=>p.postId)).catch(()=>new Map<string,CommunityReaction>()),getCommunityAvatars('community_post',page.items.map(p=>p.postId)).catch(()=>new Map<string,string>()),getCatPresentations(page.items.flatMap(p=>p.catId?[p.catId]:[]))]);
   if(alive.current&&token===epoch.current&&captured===currentScope.current&&await pinned()){
    setPageScopes(old=>({...old,[mode]:captured}));
    setPosts(old=>more?[...new Map([...old,...page.items].map(p=>[p.postId,p])).values()]:page.items);setExtras(old=>new Map([...old,...details]));setReactions(old=>new Map([...old,...likes]));setAvatars(old=>new Map([...old,...people]));setPortraits(old=>new Map([...old,...pictures]));setPageCursors(old=>({...old,[mode]:page.items.length===20?page.nextCursor:null}));
   }
  }catch{if(alive.current&&token===epoch.current&&captured===currentScope.current&&await pinned())setFailed(true);}
  finally{if(busy.current===token)busy.current=null;if(alive.current&&token===epoch.current){setLoading(false);setRefreshing(false);}}
 },[auth.owner,auth.pin,mode,area,cursor,scope]);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;epoch.current++;locationToken.current++;};},[]);
 useEffect(()=>{locationToken.current++;nearbyRequested.current=false;setLocating(false);setPagePosts({explore:[],nearby:[]});setPageScopes({});setPageCursors({});setExtras(new Map());setPortraits(new Map());setAvatars(new Map());setReactions(new Map());},[auth.owner]);
 useEffect(()=>{epoch.current++;busy.current=null;setNotice('');setFailed(false);setLoading(false);setRefreshing(false);if(pageScopes[mode]!==scope)void load();},[scope]);
 const chosen=SG_COMMUNITIES.find(item=>item.id===area);
 const choose=(id:string)=>{locationToken.current++;nearbyRequested.current=false;setLocating(false);setArea(id);setManualFallback(false);setMode('nearby');pager.current?.scrollTo({x:width,animated:true});setPicker(false);};
 const findNearby=useCallback(async(force=false)=>{
  if(nearbyRequested.current&&!force)return;nearbyRequested.current=true;const ticket=++locationToken.current;setLocating(true);setManualFallback(false);
  try{const result=await requestDeviceLocation();const matched=result.kind==='granted'?neighbourhoodForCoordinate(result.latitude,result.longitude):null;if(alive.current&&ticket===locationToken.current){if(matched)setArea(matched.id);else setManualFallback(true);}}catch{if(alive.current&&ticket===locationToken.current)setManualFallback(true);}finally{if(alive.current&&ticket===locationToken.current)setLocating(false);}
 },[]);
 const activateMode=useCallback((next:Mode)=>{if(next==='explore'){locationToken.current++;nearbyRequested.current=false;setLocating(false);}setMode(next);pager.current?.scrollTo({x:next==='nearby'?width:0,animated:true});if(next==='nearby'&&!area)void findNearby();},[area,findNearby,width]);
 const cardWidth=(width-24-(columns-1)*10)/columns;
 const renderCard=({item}:{item:CommunityPost})=>{
  const detail=extras.get(item.postId),first=detail?.media[0],sample=communitySampleText(item.postId,item.body,locale),portrait=item.catId?portraits.get(item.catId)?.portraitUri:undefined;
  return <View style={{width:cardWidth,backgroundColor:c.surface,borderRadius:14,overflow:'hidden',marginBottom:12}}><Pressable accessibilityRole="button" accessibilityLabel={`${zh?'打开帖子':'Open post'}: ${detail?.title||sample.body}`} onPress={()=>router.push(`/community/${item.postId}` as never)}>
   {first?<CommunityPostImage postId={item.postId} mediaId={first.mediaId} label={zh?'帖子照片':'Post photo'} style={{width:cardWidth,height:cardWidth*Math.max(.8,Math.min(1.35,first.height/first.width))}}/>:portrait?<PortraitImage uri={portrait} width={cardWidth} label={zh?'关联猫照片':'Linked cat photo'} unavailableLabel={zh?'照片不可用':'Photo unavailable'}/>:null}
   <Text numberOfLines={first||portrait?2:5} style={{color:c.ink,fontSize:14,lineHeight:20,fontWeight:'600',paddingHorizontal:10,paddingTop:10,paddingBottom:6}}>{detail?.title||sample.body}</Text>
   {sample.label?<Text style={{fontSize:10,color:c.muted,paddingHorizontal:10}}>{sample.label}</Text>:null}
  </Pressable><View style={{paddingLeft:10,paddingRight:6,flexDirection:'row',alignItems:'center',gap:5}}><CommunityAuthorAvatar id={item.postId} size={22} avatarKey={sample.label?'person':item.author.avatarKey} photoUri={avatars.get(item.postId)}/><Text numberOfLines={1} style={{fontSize:11,color:c.muted,flex:1}}>{communitySampleAuthor(item.postId,locale)?.name??item.author.name}</Text>{reactions.get(item.postId)?<CommunityLike reaction={reactions.get(item.postId)!} zh={zh} owner={auth.owner} pin={auth.pin} onChange={next=>setReactions(old=>new Map(old).set(item.postId,next))} onSignIn={()=>router.push('/profile' as never)} onError={()=>setNotice(zh?'点赞未保存，请重试。':'Like was not saved. Retry.')}/>:null}</View></View>;
 };
 const feed=(page:Mode)=><FlatList<CommunityPost> testID={`social-home-grid-${page}`} style={{width}} data={pageScopes[page]===scopeFor(page)?pagePosts[page]:[]} numColumns={columns} key={`columns-${page}-${columns}`} keyExtractor={item=>item.postId} renderItem={renderCard} columnWrapperStyle={columns>1?{gap:10}:undefined} contentContainerStyle={{padding:12,paddingBottom:120,flexGrow:1}} initialNumToRender={8} windowSize={5} onEndReached={()=>{if(mode===page&&cursor&&!loading)void load(true);}} onEndReachedThreshold={.4} scrollEnabled={mode===page} refreshControl={mode===page?<RefreshControl refreshing={refreshing} onRefresh={()=>void load(false,true)}/>:undefined} ListHeaderComponent={failed&&mode===page?<Pressable accessibilityRole="button" onPress={()=>void load(false,true)} style={{minHeight:44}}><Text style={{color:c.actionPrimary}}>{zh?'暂未刷新，点此重试':'Could not refresh. Tap to retry'}</Text></Pressable>:null} ListEmptyComponent={loading&&mode===page?<ActivityIndicator/>:page==='nearby'&&mode==='nearby'&&!area?<View style={{paddingTop:20}}>{locating?<Text style={{color:c.muted}}>{zh?'正在查找附近邻里…':'Finding your neighbourhood…'}</Text>:manualFallback?<><Pressable accessibilityRole="button" onPress={()=>void findNearby(true)} style={{minHeight:44,justifyContent:'center'}}><Text style={{color:c.actionPrimary}}>{zh?'重试定位':'Retry location'}</Text></Pressable><Pressable accessibilityRole="button" onPress={()=>setPicker(true)} style={{minHeight:44,justifyContent:'center'}}><Text style={{color:c.actionPrimary}}>{zh?'选择邻里，查看附近的帖子':'Choose a neighbourhood to see nearby posts'}</Text></Pressable></>:null}</View>:mode===page?<Text style={{color:c.muted,paddingTop:20}}>{zh?'这里还没有帖子。':'No posts here yet.'}</Text>:null} ListFooterComponent={loading&&pagePosts[page].length?<ActivityIndicator/>:null}/>; return <SafeAreaView edges={['top','left','right']} style={{flex:1,backgroundColor:c.canvas}}><View style={{paddingHorizontal:16,flexDirection:'row',alignItems:'center',gap:18}}>{(['explore','nearby'] as const).map(value=><Pressable key={value} accessibilityRole="tab" accessibilityState={{selected:mode===value}} onPress={()=>activateMode(value)} style={{minHeight:48,justifyContent:'center',borderBottomWidth:mode===value?2:0,borderBottomColor:c.actionPrimary}}><Text style={{color:mode===value?c.ink:c.muted,fontWeight:mode===value?'700':'500',fontSize:16}}>{value==='explore'?(zh?'发现':'Explore'):(zh?'附近':'Nearby')}</Text></Pressable>)}<View style={{flex:1}}/><Pressable accessibilityRole="button" accessibilityLabel={zh?'选择邻里':'Choose neighbourhood'} onPress={()=>setPicker(true)} style={{minWidth:44,minHeight:44,alignItems:'center',justifyContent:'center'}}><AppIcon name="filters" color={c.ink}/></Pressable></View>
  {mode==='nearby'&&chosen?<Pressable onPress={()=>setPicker(true)} style={{minHeight:44,paddingHorizontal:16,justifyContent:'center'}}><Text style={{color:c.actionPrimary,fontSize:13}}>{communityLabel(chosen,locale)}⌄</Text></Pressable>:null}
  {notice?<Text style={{padding:12,color:c.muted}}>{notice}</Text>:null}
  <ScrollView ref={pager} testID="social-home-pager" horizontal pagingEnabled showsHorizontalScrollIndicator={false} onMomentumScrollEnd={event=>{const next=event.nativeEvent.contentOffset.x>=width/2?'nearby':'explore';if(next!==mode)activateMode(next);}}>{feed('explore')}{feed('nearby')}</ScrollView>
  <Modal visible={picker} animationType="slide" presentationStyle="pageSheet" onRequestClose={()=>setPicker(false)}><ScreenScaffold compact title={zh?'选择邻里':'Choose neighbourhood'} trailing={<Pressable accessibilityRole="button" accessibilityLabel={zh?'关闭':'Close'} onPress={()=>setPicker(false)} style={{minWidth:44,minHeight:44,justifyContent:'center'}}><AppIcon name="close" color={c.ink}/></Pressable>}><TextInput accessibilityLabel={zh?'搜索邻里':'Search neighbourhood'} value={search} onChangeText={setSearch} placeholder={zh?'西海岸、金文泰…':'West Coast, Clementi…'} placeholderTextColor={c.muted} style={{minHeight:44,fontSize:16,color:c.ink}}/>{parent&&!search.trim()?<><Pressable onPress={()=>setParent(null)} style={{minHeight:44}}><Text style={{color:c.actionPrimary}}>{zh?'所有规划区':'All planning areas'}</Text></Pressable><Pressable onPress={()=>choose(parent)} style={{minHeight:44}}><Text style={{color:c.actionPrimary}}>{zh?'选择整个规划区':'Choose this planning area'}</Text></Pressable></>:null}{browseSingaporeCommunities(search,parent).map(item=><Pressable key={item.id} accessibilityRole="button" accessibilityLabel={communityLabel(item,locale)} onPress={()=>{if(!item.parentId&&!search.trim())setParent(item.id);else choose(item.id);}} style={{minHeight:48,justifyContent:'center'}}><Text style={{color:c.ink}}>{communityLabel(item,locale)}</Text></Pressable>)}</ScreenScaffold></Modal>
 </SafeAreaView>;
}
function PortraitImage({uri,width,label,unavailableLabel}:{uri:string;width:number;label:string;unavailableLabel:string}){const c=useNativeColors(),[failed,setFailed]=useState(false);useEffect(()=>setFailed(false),[uri]);return failed?<View accessibilityLabel={`${label} ${unavailableLabel}`} style={{width,height:width*1.12,backgroundColor:c.leafSoft,alignItems:'center',justifyContent:'center'}}><AppIcon name="cat" color={c.muted} size={28}/><Text style={{fontSize:11,color:c.muted}}>{unavailableLabel}</Text></View>:<Image accessibilityLabel={label} source={{uri}} onError={()=>setFailed(true)} style={{width,height:width*1.12}}/>;}
