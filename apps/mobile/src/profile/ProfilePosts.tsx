import {useCallback,useRef,useState} from 'react';
import {ActivityIndicator,Pressable,StyleSheet,Text,View,useWindowDimensions} from 'react-native';
import {useFocusEffect,useRouter} from 'expo-router';
import {listMyCommunityPosts} from '../api/community';
import {getCommunityPostExtras} from '../api/community-extras';
import {listMyProfilePhotos,type PhotoCursor} from '../api/profile-photos';
import {useLocale} from '../i18n/LocaleContext';
import {useNativeColors} from '../design/native-colors';
import {CommunityPostImage} from '../community/CommunityPostImage';

type Mode='posts'|'photos';
type Props={owner:string;pin:()=>()=>Promise<boolean>;refreshToken?:number;onLoadingChange?:(loading:boolean)=>void};
type Card={id:string;postId:string;title:string;mediaId?:string;position?:number};
export function ProfilePosts(props:Props){return <OwnerPosts key={props.owner} {...props}/>;}
function OwnerPosts(props:Props){
 const {locale}=useLocale(),c=useNativeColors(),cn=locale==='zh-CN';
 const [mode,setMode]=useState<Mode>('posts');
 return <View style={s.section}>
  <View style={[s.tabs,{borderColor:c.line}]}>{(['posts','photos'] as const).map(tab=><Pressable key={tab} accessibilityRole="tab" accessibilityState={{selected:mode===tab}} onPress={()=>setMode(tab)} style={[s.tab,mode===tab&&{borderBottomColor:c.actionPrimary,borderBottomWidth:2}]}><Text style={{fontSize:14,fontWeight:'600',color:mode===tab?c.actionPrimary:c.muted}}>{tab==='posts'?(cn?'帖子':'Posts'):(cn?'照片':'Photos')}</Text></Pressable>)}</View>
  <Collection key={mode} {...props} mode={mode}/>
 </View>;
}
function Collection({pin,mode,refreshToken=0,onLoadingChange}:Props&{mode:Mode}){
 const router=useRouter(),{locale}=useLocale(),c=useNativeColors(),cn=locale==='zh-CN';
 const {fontScale,width}=useWindowDimensions();
 const [cards,setCards]=useState<readonly Card[]>([]),[cursor,setCursor]=useState<string|PhotoCursor|null>(null);
 const [loading,setLoading]=useState(true),[failed,setFailed]=useState(false);
 const active=useRef(false),generation=useRef(0),busy=useRef(false),retryMore=useRef(false);
 const load=async(more=false)=>{
  if(busy.current||!active.current)return;
  const ticket=generation.current,current=pin();busy.current=true;setLoading(true);onLoadingChange?.(true);
  const valid=async()=>await current()&&active.current&&ticket===generation.current;
  try{
   let next:readonly Card[],after:string|PhotoCursor|null;
   if(mode==='photos'){
    const page=await listMyProfilePhotos(more&&typeof cursor==='object'?cursor:null);
    next=page.items.map(item=>({id:item.mediaId,postId:item.postId,mediaId:item.mediaId,position:item.position,title:''}));after=page.nextCursor;
   }else{
    const page=await listMyCommunityPosts(more&&typeof cursor==='string'?cursor:null);
    const extras=await getCommunityPostExtras(page.items.map(post=>post.postId));
    next=page.items.map(post=>({id:post.postId,postId:post.postId,title:extras.get(post.postId)?.title||post.body,mediaId:extras.get(post.postId)?.media[0]?.mediaId}));
    after=page.items.length===20?page.nextCursor:null;
   }
   if(await valid()){
    setCards(old=>more?[...new Map([...old,...next].map(card=>[card.id,card])).values()]:next);
    setCursor(after);setFailed(false);
   }
  }catch{if(await valid()){retryMore.current=more;setFailed(true);}}
  finally{if(active.current&&ticket===generation.current){busy.current=false;setLoading(false);onLoadingChange?.(false);}}
 };
 const loadRef=useRef(load);loadRef.current=load;
 useFocusEffect(useCallback(()=>{
  active.current=true;generation.current++;busy.current=false;void loadRef.current();
  return()=>{active.current=false;generation.current++;};
 },[refreshToken]));
 return <View style={s.section}>
  <View style={s.grid}>{cards.map(card=><Pressable key={card.id} accessibilityRole="button" accessibilityLabel={mode==='photos'?(cn?`打开照片 ${(card.position??0)+1}`:`Open photo ${(card.position??0)+1}`):card.title} onPress={()=>router.push((mode==='photos'?`/community/${card.postId}?mediaId=${card.mediaId}`:`/community/${card.postId}`) as never)} style={{width:fontScale>=1.3||width<350?'100%':'48.5%',gap:6}}>
   {card.mediaId?<CommunityPostImage postId={card.postId} mediaId={card.mediaId} variant="thumb" label={cn?'帖子照片':'Post photo'} style={s.photo}/>:<View style={[s.photo,s.textCover,{backgroundColor:c.surface}]}><Text numberOfLines={6} style={{color:c.ink,fontSize:15,lineHeight:22}}>{card.title}</Text></View>}
   {mode==='posts'?<Text numberOfLines={2} style={{fontSize:13,lineHeight:18,color:c.ink}}>{card.title}</Text>:null}
  </Pressable>)}</View>
  {loading?<ActivityIndicator color={c.actionPrimary}/>:null}
  {failed?<Pressable accessibilityRole="button" disabled={loading} onPress={()=>void loadRef.current(retryMore.current)} style={s.tab}><Text style={{color:c.actionPrimary}}>{cn?'暂时无法读取，点此重试':'Could not load. Tap to retry'}</Text></Pressable>:!loading&&!cards.length?<View style={{gap:8,alignItems:'center'}}><Text style={{color:c.muted,fontSize:13}}>{mode==='photos'?(cn?'发布的照片会显示在这里':'Your published photos will appear here'):(cn?'记录你的第一段社区故事':'Share your first neighbourhood story')}</Text><Pressable accessibilityRole="button" onPress={()=>router.push('/create' as never)} style={s.tab}><Text style={{color:c.actionPrimary}}>{cn?'发布帖子':'Share a post'}</Text></Pressable></View>:null}
  {cursor&&!failed?<Pressable accessibilityRole="button" disabled={loading} onPress={()=>void loadRef.current(true)} style={s.tab}><Text style={{color:c.actionPrimary}}>{cn?'载入更多':'Load more'}</Text></Pressable>:null}
 </View>;
}
const s=StyleSheet.create({section:{gap:12},tabs:{flexDirection:'row',borderBottomWidth:StyleSheet.hairlineWidth},tab:{minHeight:44,flexGrow:1,justifyContent:'center',alignItems:'center'},grid:{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between',rowGap:16},photo:{width:'100%',aspectRatio:1,borderRadius:10},textCover:{padding:12,justifyContent:'center'}});
