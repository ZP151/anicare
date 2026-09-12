import {useCallback,useEffect,useRef,useState} from 'react';
import {ActivityIndicator,Pressable,StyleSheet,Text,View} from 'react-native';
import {useFocusEffect,useLocalSearchParams,useRouter} from 'expo-router';
import type {CommunityPost} from '../api/community';
import {getCommunityPostExtras,type CommunityPostExtra} from '../api/community-extras';
import {useAccountSession} from '../auth/use-account-session';
import {ScreenScaffold} from '../components/ScreenScaffold';
import {BackButton} from '../components/BackButton';
import {useNativeColors} from '../design/native-colors';
import {useLocale} from '../i18n/LocaleContext';
import {SG_COMMUNITIES,communityLabel} from '../maps/singapore-communities';
import {CommunityAuthorAvatar} from './CommunityAuthorAvatar';
import {CommunityPostImage} from './CommunityPostImage';
import {COMMUNITY_TEST_POSTS,communitySampleText} from './test-samples';
import {personText,samplePerson} from './sample-people';
import {loadSampleProfilePosts} from './sample-profile-data';

export function SampleProfile(){
 const {id}=useLocalSearchParams<{id:string}>(),auth=useAccountSession();
 return <ProfileContent key={`${id}|${auth.owner??''}`} id={id}/>;
}
function ProfileContent({id}:{id:string}){
 const person=samplePerson(id),auth=useAccountSession(),router=useRouter(),c=useNativeColors(),{locale}=useLocale(),zh=locale==='zh-CN';
 const [posts,setPosts]=useState<readonly CommunityPost[]>([]),[extras,setExtras]=useState(new Map<string,CommunityPostExtra>()),[loading,setLoading]=useState(false),[failed,setFailed]=useState(false);
 const sequence=useRef(0),pin=useRef(auth.pin);pin.current=auth.pin;
 const load=useCallback(async()=>{
  if(!person)return;const token=++sequence.current,pinned=pin.current();setLoading(true);setFailed(false);
  try{const rows=await loadSampleProfilePosts(id),details=await getCommunityPostExtras(rows.map(post=>post.postId));
   if(rows.some(post=>!details.has(post.postId)))throw new Error('sample_profile_media_unavailable');
   if(token===sequence.current&&await pinned()){setPosts(rows);setExtras(details);}
  }catch{if(token===sequence.current&&await pinned()){setPosts([]);setExtras(new Map());setFailed(true);}}
  finally{if(token===sequence.current)setLoading(false);}
 },[id,person]);
 useFocusEffect(useCallback(()=>{if(auth.owner!==undefined)void load();return()=>{sequence.current++;};},[load,auth.owner]));
 useEffect(()=>()=>{sequence.current++;},[]);
 const sample=person?COMMUNITY_TEST_POSTS.find(post=>post.profile.name===person.fixtureName):null;
 const area=SG_COMMUNITIES.find(item=>item.id===person?.communitySlug);
 return <ScreenScaffold compact title={zh?'邻居资料':'Neighbour profile'} leading={<BackButton onPress={()=>router.canGoBack()?router.back():router.replace('/' as never)}/>} refreshing={loading} onRefresh={person?()=>void load():undefined}>
  {!person?<Text style={{color:c.muted}}>{zh?'这份资料不可用。':'This profile is unavailable.'}</Text>:<>
   <View style={s.heading}>{sample?<CommunityAuthorAvatar id={sample.id} avatarKey={sample.profile.avatarKey} size={72} linkToProfile={false}/>:null}<View style={{flex:1,gap:4}}><Text style={[s.name,{color:c.ink}]}>{personText(person.name,locale)}</Text><Text style={[s.meta,{color:c.muted}]}>{area?communityLabel(area,locale):''}</Text><Text style={[s.meta,{color:c.muted}]}>{zh?'虚构测试用户':'Fictional test user'}</Text></View></View>
   <Text style={[s.bio,{color:c.ink}]}>{personText(person.bio,locale)}</Text>
   <Text style={[s.meta,{color:c.muted}]}>{zh?'资料与照片为演示素材，不代表真实居民或目击。可进入帖子试用评论与点赞。':'Demo profile and imagery, not a real resident or sighting. Open a post to try comments and likes.'}</Text>
   <Text accessibilityRole="header" style={[s.section,{color:c.ink}]}>{zh?'帖子':'Posts'}</Text>
   {failed?<Pressable accessibilityRole="button" onPress={()=>void load()} style={s.touch}><Text style={{color:c.actionPrimary}}>{zh?'暂时无法读取，点此重试':'Could not load. Tap to retry'}</Text></Pressable>:null}
   <View style={s.grid}>{posts.map(post=>{const extra=extras.get(post.postId),cover=extra?.media[0],copy=communitySampleText(post.postId,post.body,locale);return <Pressable key={post.postId} accessibilityRole="button" accessibilityLabel={copy.body} onPress={()=>router.push(`/community/${post.postId}` as never)} style={[s.card,{backgroundColor:c.surface}]}>
    {cover?<CommunityPostImage postId={post.postId} mediaId={cover.mediaId} label={zh?'帖子照片':'Post photo'} style={s.cover}/>:null}
    <Text numberOfLines={3} style={[s.copy,{color:c.ink}]}>{copy.body}</Text>
    <Text style={[s.caption,{color:c.muted}]}>{copy.label}{extra?.media.length?` · ${extra.media.length}${zh?' 张照片':' photos'}`:''}</Text>
   </Pressable>;})}</View>
   {loading?<ActivityIndicator/>:!failed&&!posts.length?<Text style={{color:c.muted}}>{zh?'暂无公开帖子。':'No public posts yet.'}</Text>:null}
  </>}
 </ScreenScaffold>;
}
const s=StyleSheet.create({heading:{flexDirection:'row',alignItems:'center',gap:14},name:{fontSize:22,fontWeight:'700'},meta:{fontSize:12,lineHeight:18},bio:{fontSize:14,lineHeight:21},section:{fontSize:16,fontWeight:'600'},grid:{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between',gap:10},card:{width:'48%',borderRadius:12,overflow:'hidden',paddingBottom:8},cover:{width:'100%',aspectRatio:1},copy:{fontSize:13,lineHeight:18,padding:8},caption:{fontSize:10,paddingHorizontal:8},touch:{minHeight:44,justifyContent:'center'}});
