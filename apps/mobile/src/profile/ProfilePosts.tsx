import {useCallback,useRef,useState} from 'react';
import {ActivityIndicator,Pressable,StyleSheet,Text,View,useWindowDimensions} from 'react-native';
import {useFocusEffect,useRouter} from 'expo-router';
import {listMyCommunityPosts,type CommunityPost} from '../api/community';
import {getCommunityPostExtras,type CommunityPostExtra} from '../api/community-extras';
import {useLocale} from '../i18n/LocaleContext';
import {useNativeColors} from '../design/native-colors';
import {CommunityPostImage} from '../community/CommunityPostImage';

type ProfilePostsProps={owner:string;pin:()=>()=>Promise<boolean>};
export function ProfilePosts({owner,pin}:ProfilePostsProps){return <OwnerPosts key={owner} pin={pin}/>;}
function OwnerPosts({pin}:Pick<ProfilePostsProps,'pin'>){
  const router=useRouter(),{locale}=useLocale(),c=useNativeColors();
  const cn=locale==='zh-CN', {fontScale,width}=useWindowDimensions();
  const [posts,setPosts]=useState<readonly CommunityPost[]>([]),[extras,setExtras]=useState(new Map<string,CommunityPostExtra>());
  const [mode,setMode]=useState<'posts'|'photos'>('posts'),[cursor,setCursor]=useState<string|null>(null),[loading,setLoading]=useState(false),[failed,setFailed]=useState(false);
  const active=useRef(false),generation=useRef(0),busy=useRef(false);
  const load=async(more=false)=>{
    if(busy.current||!active.current)return;
    const ticket=generation.current,current=pin();busy.current=true;setLoading(true);
    try{
      const page=await listMyCommunityPosts(more?cursor:null);
      const details=await getCommunityPostExtras(page.items.map(post=>post.postId));
      if(active.current&&ticket===generation.current&&await current()){
        setPosts(old=>more?[...new Map([...old,...page.items].map(post=>[post.postId,post])).values()]:page.items);
        setExtras(old=>more?new Map([...old,...details]):details);
        setCursor(page.items.length===20?page.nextCursor:null);setFailed(false);
      }
    }catch{if(active.current&&ticket===generation.current&&await current())setFailed(true);}
    finally{if(active.current&&ticket===generation.current){busy.current=false;setLoading(false);}}
  };
  const loadRef=useRef(load);loadRef.current=load;
  useFocusEffect(useCallback(()=>{active.current=true;generation.current++;busy.current=false;void loadRef.current();return()=>{active.current=false;generation.current++;};},[]));
  const cards=posts.flatMap(post=>{
    const detail=extras.get(post.postId),title=detail?.title||post.body;
    return mode==='posts'?[{id:post.postId,postId:post.postId,title,mediaId:detail?.media[0]?.mediaId}]:
      (detail?.media??[]).map((media,index)=>({id:media.mediaId,postId:post.postId,title:cn?`打开照片 ${index+1}`:`Open photo ${index+1}`,mediaId:media.mediaId}));
  });
  return <View style={s.section}>
    <View style={[s.tabs,{borderColor:c.line}]}>{(['posts','photos'] as const).map(tab=><Pressable key={tab} accessibilityRole="tab" accessibilityState={{selected:mode===tab}} onPress={()=>setMode(tab)} style={[s.tab,mode===tab&&{borderBottomColor:c.actionPrimary,borderBottomWidth:2}]}><Text style={{fontSize:14,fontWeight:'600',color:mode===tab?c.actionPrimary:c.muted}}>{tab==='posts'?(cn?'帖子':'Posts'):(cn?'照片':'Photos')}</Text></Pressable>)}</View>
    <View style={s.grid}>{cards.map(card=><Pressable key={card.id} accessibilityRole="button" accessibilityLabel={card.title} onPress={()=>router.push(`/community/${card.postId}` as never)} style={{width:fontScale>=1.3||width<350?'100%':'48.5%',gap:6}}>
      {card.mediaId?<CommunityPostImage postId={card.postId} mediaId={card.mediaId} variant="thumb" label={cn?'帖子照片':'Post photo'} style={s.photo}/>:<View style={[s.photo,s.textCover,{backgroundColor:c.surface}]}><Text numberOfLines={6} style={{color:c.ink,fontSize:15,lineHeight:22}}>{card.title}</Text></View>}
      {mode==='posts'?<Text numberOfLines={2} style={{fontSize:13,lineHeight:18,color:c.ink}}>{card.title}</Text>:null}
    </Pressable>)}</View>
    {loading?<ActivityIndicator color={c.actionPrimary}/>:null}
    {failed?<Pressable accessibilityRole="button" onPress={()=>void loadRef.current()} style={s.tab}><Text style={{color:c.actionPrimary}}>{cn?'暂时无法读取，点此重试':'Could not load. Tap to retry'}</Text></Pressable>:!loading&&!cards.length?<View style={{gap:8,alignItems:'center'}}><Text style={{color:c.muted,fontSize:13}}>{mode==='photos'?(cn?'这些帖子还没有照片':'No photos in these posts yet'):(cn?'记录你的第一段社区故事':'Share your first neighbourhood story')}</Text>{mode==='posts'?<Pressable accessibilityRole="button" onPress={()=>router.push('/create' as never)} style={s.tab}><Text style={{color:c.actionPrimary}}>{cn?'发布帖子':'Share a post'}</Text></Pressable>:null}</View>:null}
    {cursor?<Pressable accessibilityRole="button" disabled={loading} onPress={()=>void loadRef.current(true)} style={s.tab}><Text style={{color:c.actionPrimary}}>{cn?'载入更多':'Load more'}</Text></Pressable>:null}
  </View>;
}
const s=StyleSheet.create({section:{gap:12},tabs:{flexDirection:'row',borderBottomWidth:StyleSheet.hairlineWidth},tab:{flex:1,minHeight:44,justifyContent:'center',alignItems:'center'},grid:{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between',rowGap:16},photo:{width:'100%',aspectRatio:1,borderRadius:10},textCover:{padding:12,justifyContent:'center'}});
