import {useCallback,useEffect,useRef,useState} from 'react';
import {useRouter} from 'expo-router';
import {ActivityIndicator,FlatList,Image,Modal,Pressable,RefreshControl,Text,TextInput,View,useWindowDimensions} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {listCommunityPosts,type CommunityPost} from '../api/community';
import {getCommunityPostExtras,type CommunityPostExtra} from '../api/community-extras';
import {getCommunityReactions,type CommunityReaction} from '../api/community-reactions';
import {getCommunityAvatars} from '../api/community-avatar';
import {getCatPresentations,type CatPresentation} from '../api/cat-presentation';
import {listPublicSightings,type PublicSighting} from '../api/feed';
import {useAccountSession} from '../auth/use-account-session';
import {useLocale} from '../i18n/LocaleContext';
import {localizedCatName} from '../i18n/cat-name';
import {AppIcon} from '../components/AppIcon';
import {ScreenScaffold} from '../components/ScreenScaffold';
import {useNativeColors} from '../design/native-colors';
import {ProfileAvatar} from '../profile/ProfileAvatar';
import {browseSingaporeCommunities,communityLabel,SG_COMMUNITIES} from '../maps/singapore-communities';
import {CommunityLike} from './CommunityLike';
import {communitySampleText} from './test-samples';
import {CommunityPostImage} from './CommunityPostImage';

type Mode='explore'|'nearby'|'cats';
export function SocialHome(){
 const auth=useAccountSession(),router=useRouter(),{locale}=useLocale(),c=useNativeColors(),zh=locale==='zh-CN';
 const {width,fontScale}=useWindowDimensions(),columns=fontScale>=1.3||width<350?1:2;
 const [mode,setMode]=useState<Mode>('explore'),[area,setArea]=useState<string|null>(null),[picker,setPicker]=useState(false),[search,setSearch]=useState(''),[parent,setParent]=useState<string|null>(null);
 const [posts,setPosts]=useState<readonly CommunityPost[]>([]),[cats,setCats]=useState<readonly PublicSighting[]>([]),[extras,setExtras]=useState(new Map<string,CommunityPostExtra>()),[portraits,setPortraits]=useState(new Map<string,CatPresentation>()),[avatars,setAvatars]=useState(new Map<string,string>()),[reactions,setReactions]=useState(new Map<string,CommunityReaction>());
 const [loading,setLoading]=useState(false),[refreshing,setRefreshing]=useState(false),[failed,setFailed]=useState(false),[cursor,setCursor]=useState<string|null>(null),[notice,setNotice]=useState('');
 const epoch=useRef(0),busy=useRef<number|null>(null),alive=useRef(true);const currentScope=useRef(''),scope=JSON.stringify([auth.owner===undefined?'loading':auth.owner,mode,area]);currentScope.current=scope;
 const load=useCallback(async(more=false,refresh=false)=>{
  if(auth.owner===undefined||mode==='nearby'&&!area||busy.current===epoch.current)return;
  const token=epoch.current,pinned=auth.pin(),captured=scope;busy.current=token;setFailed(false);if(refresh)setRefreshing(true);else setLoading(true);
  try{
   if(mode==='cats'){
    const page=await listPublicSightings({limit:50});const unique=[...new Map(page.items.map(cat=>[cat.animalId,cat])).values()];const pictures=await getCatPresentations(unique.map(cat=>cat.animalId));
    if(alive.current&&token===epoch.current&&captured===currentScope.current&&await pinned()){setCats(unique);setPortraits(pictures);setCursor(null);}
   }else{
    const page=await listCommunityPosts({cursor:more?cursor:null,communitySlug:mode==='nearby'?area:null});
    const [details,likes,people,pictures]=await Promise.all([getCommunityPostExtras(page.items.map(p=>p.postId)),getCommunityReactions(page.items.map(p=>p.postId)).catch(()=>new Map<string,CommunityReaction>()),getCommunityAvatars('community_post',page.items.map(p=>p.postId)).catch(()=>new Map<string,string>()),getCatPresentations(page.items.flatMap(p=>p.catId?[p.catId]:[]))]);
    if(alive.current&&token===epoch.current&&captured===currentScope.current&&await pinned()){
     setPosts(old=>more?[...new Map([...old,...page.items].map(p=>[p.postId,p])).values()]:page.items);setExtras(old=>new Map([...(more?old:[]),...details]));setReactions(old=>new Map([...(more?old:[]),...likes]));setAvatars(old=>new Map([...(more?old:[]),...people]));setPortraits(old=>new Map([...(more?old:[]),...pictures]));setCursor(page.items.length===20?page.nextCursor:null);
    }
   }
  }catch{if(alive.current&&token===epoch.current&&captured===currentScope.current&&await pinned())setFailed(true);}
  finally{if(busy.current===token)busy.current=null;if(alive.current&&token===epoch.current){setLoading(false);setRefreshing(false);}}
 },[auth.owner,auth.pin,mode,area,cursor,scope]);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;epoch.current++;};},[]);
 useEffect(()=>{epoch.current++;busy.current=null;setPosts([]);setCats([]);setExtras(new Map());setPortraits(new Map());setAvatars(new Map());setReactions(new Map());setCursor(null);setNotice('');setFailed(false);setLoading(false);setRefreshing(false);void load();},[scope]);
 const chosen=SG_COMMUNITIES.find(item=>item.id===area);
 const choose=(id:string)=>{setArea(id);setMode('nearby');setPicker(false);};
 const items=mode==='cats'?cats:posts;
 const cardWidth=(width-24-(columns-1)*10)/columns;
 const renderCard=({item}:{item:CommunityPost|PublicSighting})=>{
  if('animalId'in item){const uri=portraits.get(item.animalId)?.portraitUri;return <Pressable accessibilityRole="button" accessibilityLabel={localizedCatName(item.animalId,item.primaryAlias,locale)} onPress={()=>router.push(`/cat/${item.animalId}` as never)} style={{width:cardWidth,backgroundColor:c.surface,borderRadius:14,overflow:'hidden',marginBottom:12}}>{uri?<Image source={{uri}} style={{width:cardWidth,height:cardWidth*1.15}}/>:<View style={{height:150,alignItems:'center',justifyContent:'center'}}><AppIcon name="cat" color={c.muted} size={36}/></View>}<Text style={{color:c.ink,fontSize:14,fontWeight:'600',padding:10}}>{localizedCatName(item.animalId,item.primaryAlias,locale)}</Text>{portraits.get(item.animalId)?.sampleLabel?<Text style={{fontSize:11,color:c.muted,paddingHorizontal:10,paddingBottom:10}}>{zh?'测试样本':'Test sample'}</Text>:null}</Pressable>;}
  const detail=extras.get(item.postId),first=detail?.media[0],sample=communitySampleText(item.postId,item.body,locale),portrait=item.catId?portraits.get(item.catId)?.portraitUri:undefined;
  return <View style={{width:cardWidth,backgroundColor:c.surface,borderRadius:14,overflow:'hidden',marginBottom:12}}><Pressable accessibilityRole="button" accessibilityLabel={`${zh?'打开帖子':'Open post'}: ${detail?.title||sample.body}`} onPress={()=>router.push(`/community/${item.postId}` as never)}>
   {first?<CommunityPostImage postId={item.postId} mediaId={first.mediaId} label={zh?'帖子照片':'Post photo'} style={{width:cardWidth,height:cardWidth*Math.max(0.8,Math.min(1.35,first.height/first.width))}}/>:portrait?<Image source={{uri:portrait}} style={{width:cardWidth,height:cardWidth*1.12}}/>:null}
   <Text numberOfLines={first||portrait?2:5} style={{color:c.ink,fontSize:14,lineHeight:20,fontWeight:'600',paddingHorizontal:10,paddingTop:10,paddingBottom:6}}>{detail?.title||sample.body}</Text>
   {sample.label?<Text style={{fontSize:10,color:c.muted,paddingHorizontal:10}}>{sample.label}</Text>:null}
  </Pressable><View style={{paddingLeft:10,paddingRight:6,flexDirection:'row',alignItems:'center',gap:5}}><ProfileAvatar size={22} avatarKey={sample.label?'person':item.author.avatarKey} photoUri={avatars.get(item.postId)}/><Text numberOfLines={1} style={{fontSize:11,color:c.muted,flex:1}}>{sample.label?(zh?'示例邻居':'Demo neighbour'):item.author.name}</Text>{reactions.get(item.postId)?<CommunityLike reaction={reactions.get(item.postId)!} zh={zh} owner={auth.owner} pin={auth.pin} onChange={next=>setReactions(old=>new Map(old).set(item.postId,next))} onSignIn={()=>router.push('/profile' as never)} onError={()=>setNotice(zh?'点赞未保存，请重试。':'Like was not saved. Retry.')}/>:null}</View></View>;
 };
 return <SafeAreaView edges={['top','left','right']} style={{flex:1,backgroundColor:c.canvas}}><View style={{paddingHorizontal:16,flexDirection:'row',alignItems:'center',gap:18}}>{(['explore','nearby','cats'] as const).map(value=><Pressable key={value} accessibilityRole="tab" accessibilityState={{selected:mode===value}} onPress={()=>{setMode(value);if(value==='nearby'&&!area)setPicker(true);}} style={{minHeight:48,justifyContent:'center',borderBottomWidth:mode===value?2:0,borderBottomColor:c.actionPrimary}}><Text style={{color:mode===value?c.ink:c.muted,fontWeight:mode===value?'700':'500',fontSize:16}}>{value==='explore'?(zh?'发现':'Explore'):value==='nearby'?(zh?'附近':'Nearby'):(zh?'猫咪':'Cats')}</Text></Pressable>)}<View style={{flex:1}}/><Pressable accessibilityRole="button" accessibilityLabel={zh?'选择邻里':'Choose neighbourhood'} onPress={()=>setPicker(true)} style={{minWidth:44,minHeight:44,alignItems:'center',justifyContent:'center'}}><AppIcon name="filters" color={c.ink}/></Pressable></View>
  {mode==='nearby'&&chosen?<Pressable onPress={()=>setPicker(true)} style={{minHeight:44,paddingHorizontal:16,justifyContent:'center'}}><Text style={{color:c.actionPrimary,fontSize:13}}>{communityLabel(chosen,locale)}⌄</Text></Pressable>:null}
  {notice?<Text style={{padding:12,color:c.muted}}>{notice}</Text>:null}
  <FlatList<CommunityPost|PublicSighting> key={`columns-${columns}`} testID="social-home-grid" data={items} numColumns={columns} keyExtractor={item=>'postId'in item?item.postId:item.animalId} renderItem={renderCard} columnWrapperStyle={columns>1?{gap:10}:undefined} contentContainerStyle={{padding:12,paddingBottom:120,flexGrow:1}} initialNumToRender={8} windowSize={5} onEndReached={()=>{if(cursor&&!loading)void load(true);}} onEndReachedThreshold={0.4} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>void load(false,true)}/>} ListHeaderComponent={failed?<Pressable accessibilityRole="button" onPress={()=>void load(false,true)} style={{minHeight:44}}><Text style={{color:c.actionPrimary}}>{zh?'暂未刷新，点此重试':'Could not refresh. Tap to retry'}</Text></Pressable>:null} ListEmptyComponent={loading?<ActivityIndicator/>:mode==='nearby'&&!area?<Pressable accessibilityRole="button" onPress={()=>setPicker(true)} style={{minHeight:60,justifyContent:'center'}}><Text style={{color:c.actionPrimary}}>{zh?'选择邻里，查看附近的帖子':'Choose a neighbourhood to see nearby posts'}</Text></Pressable>:<Text style={{color:c.muted,paddingTop:20}}>{zh?'这里还没有帖子。':'No posts here yet.'}</Text>} ListFooterComponent={loading&&items.length?<ActivityIndicator/>:null}/>
  <Modal visible={picker} animationType="slide" presentationStyle="pageSheet" onRequestClose={()=>setPicker(false)}><ScreenScaffold compact title={zh?'选择邻里':'Choose neighbourhood'} trailing={<Pressable accessibilityRole="button" accessibilityLabel={zh?'关闭':'Close'} onPress={()=>setPicker(false)} style={{minWidth:44,minHeight:44,justifyContent:'center'}}><AppIcon name="close" color={c.ink}/></Pressable>}><TextInput accessibilityLabel={zh?'搜索邻里':'Search neighbourhood'} value={search} onChangeText={setSearch} placeholder={zh?'西海岸、金文泰…':'West Coast, Clementi…'} placeholderTextColor={c.muted} style={{minHeight:44,fontSize:16,color:c.ink}}/>{parent&&!search.trim()?<><Pressable onPress={()=>setParent(null)} style={{minHeight:44}}><Text style={{color:c.actionPrimary}}>{zh?'所有规划区':'All planning areas'}</Text></Pressable><Pressable onPress={()=>choose(parent)} style={{minHeight:44}}><Text style={{color:c.actionPrimary}}>{zh?'选择整个规划区':'Choose this planning area'}</Text></Pressable></>:null}{browseSingaporeCommunities(search,parent).map(item=><Pressable key={item.id} accessibilityRole="button" accessibilityLabel={communityLabel(item,locale)} onPress={()=>{if(!item.parentId&&!search.trim())setParent(item.id);else choose(item.id);}} style={{minHeight:48,justifyContent:'center'}}><Text style={{color:c.ink}}>{communityLabel(item,locale)}</Text></Pressable>)}</ScreenScaffold></Modal>
 </SafeAreaView>;
}
