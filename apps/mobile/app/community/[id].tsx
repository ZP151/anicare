import {BackButton} from '../../src/components/BackButton';
import { PostGallery } from '../../src/community/PostGallery';
import { communitySampleText, communitySampleAuthor } from '../../src/community/test-samples';
import { CommunityAuthorAvatar } from '../../src/community/CommunityAuthorAvatar';
import { getCommunityAvatars } from '../../src/api/community-avatar';
import { getCommunityAuthor } from '../../src/api/direct-messages';
import { getCatPresentations } from '../../src/api/cat-presentation';
import { getCommunityPostExtras,type CommunityPostExtra } from '../../src/api/community-extras';
import {useLocalSearchParams,useRouter} from 'expo-router';
import {useEffect,useRef,useState} from 'react';
import {randomUUID} from 'expo-crypto';
import {ActivityIndicator,Image,Pressable,ScrollView,StyleSheet,Text,TextInput,View} from 'react-native';
import {createCommunityReply,getCommunityPost,listCommunityReplies,type CommunityPost,type CommunityReply} from '../../src/api/community';
import {useAccountSession} from '../../src/auth/use-account-session';
import {CommunityContentActions} from '../../src/community/CommunityContentActions';
import {AppIcon} from '../../src/components/AppIcon';
import {ScreenScaffold} from '../../src/components/ScreenScaffold';
import {GlassSurface} from '../../src/design/GlassSurface';
import {useNativeColors} from '../../src/design/native-colors';
import {useLocale} from '../../src/i18n/LocaleContext';
import {profileAvatarKey} from '../../src/profile/profile-avatar';

export default function CommunityDetailScreen(){
 const {id}=useLocalSearchParams<{id:string}>(),router=useRouter(),auth=useAccountSession();const {locale}=useLocale();const zh=locale==='zh-CN',c=useNativeColors(),s=styles(c);
 const [post,setPost]=useState<CommunityPost|null>(null),[replies,setReplies]=useState<readonly CommunityReply[]>([]),[cursor,setCursor]=useState<string|null>(null),[body,setBody]=useState(''),[loading,setLoading]=useState(true),[refreshing,setRefreshing]=useState(false),[failed,setFailed]=useState(false),[notice,setNotice]=useState(''),[writing,setWriting]=useState(false);
 const [avatars,setAvatars]=useState(new Map<string,string>());const [portrait,setPortrait]=useState<string>();const [extra,setExtra]=useState<CommunityPostExtra|null>(null);
 const generation=useRef(0),busy=useRef(false),loadingRequest=useRef(false),alive=useRef(true),context=useRef('');context.current=`${auth.owner??''}|${id}`;
 const pending=useRef<{key:string;id:string}|null>(null);
 const [canMessage,setCanMessage]=useState(false);
 const load=async(more=false,refresh=false)=>{
   if(!alive.current||loadingRequest.current)return;loadingRequest.current=true;const token=++generation.current,current=auth.pin();if(refresh)setRefreshing(true);else setLoading(true);setFailed(false);
   try{const [parent,page,extras,publicAuthor]=await Promise.all([getCommunityPost(id),listCommunityReplies(id,more?cursor:null),getCommunityPostExtras([id]),Promise.resolve(getCommunityAuthor('community_post',id)).catch(()=>null)]);const [postAvatars,replyAvatars,pictures]=await Promise.all([getCommunityAvatars('community_post',[id]).catch(()=>new Map<string,string>()),getCommunityAvatars('community_reply',page.items.map(r=>r.replyId)).catch(()=>new Map<string,string>()),getCatPresentations(parent.catId?[parent.catId]:[])]);if(alive.current&&token===generation.current&&await current()){setCanMessage(!!(publicAuthor?.canMessage||publicAuthor?.conversationId));setPost(parent);setExtra(extras.get(id)??null);setAvatars(old=>new Map([...(more?old:[]),...postAvatars,...replyAvatars]));setPortrait(parent.catId?pictures.get(parent.catId)?.portraitUri:undefined);setReplies(old=>more?[...old,...page.items]:page.items);setCursor(page.nextCursor);}}
   catch(error){if(alive.current&&token===generation.current&&await current()){setFailed(true);if(!refresh||(error instanceof Error&&error.message==='community_post_hidden')){setCanMessage(false);setPost(null);setExtra(null);setAvatars(new Map());setPortrait(undefined);setReplies([]);setCursor(null);}}}
   finally{loadingRequest.current=false;if(alive.current&&token===generation.current&&await current()){if(refresh)setRefreshing(false);else setLoading(false);}}
 };
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;generation.current++;};},[]);
 useEffect(()=>{generation.current++;busy.current=false;loadingRequest.current=false;setWriting(false);setCanMessage(false);setPost(null);setExtra(null);setAvatars(new Map());setPortrait(undefined);setReplies([]);setCursor(null);setBody('');setNotice('');pending.current=null;if(auth.owner!==undefined)void load();},[id,auth.owner]);
 const reply=async()=>{
   if(!post||!auth.owner||!body.trim()||busy.current)return;busy.current=true;setWriting(true);const current=auth.pin(),scope=context.current;
   try{if(!await current())return;const key=JSON.stringify([scope,body.trim()]);if(pending.current?.key!==key)pending.current={key,id:randomUUID()};await createCommunityReply(id,body,undefined,pending.current.id);if(alive.current&&scope===context.current&&await current()){pending.current=null;setBody('');setNotice(zh?'回复已发布':'Reply posted');await load();}}
   catch{if(alive.current&&scope===context.current&&await current())setNotice(zh?'回复未完成，内容已保留。请重试。':'Reply not completed. Your text is kept; please retry.');}
   finally{if(scope===context.current){busy.current=false;if(alive.current)setWriting(false);}}
 };
 const sample=(item:CommunityPost|CommunityReply)=>communitySampleText('postId' in item?item.postId:item.replyId,item.body,locale);
 const author=(item:CommunityPost|CommunityReply,type:'community_post'|'community_reply')=><View style={s.authorRow}><CommunityAuthorAvatar id={'postId' in item?item.postId:item.replyId} avatarKey={sample(item).label?'person':item.author.avatarKey} photoUri={avatars.get('postId' in item?item.postId:item.replyId)} size={36}/><View style={{flex:1}}><Text style={s.author}>{communitySampleAuthor('postId' in item?item.postId:item.replyId,locale)?.name??item.author.name}</Text>{sample(item).label?<Text style={s.meta}>{sample(item).label}</Text>:null}<Text style={s.meta}>{new Date(item.createdAt).toLocaleDateString(zh?'zh-SG':'en-SG',{month:'short',day:'numeric'})}</Text></View>{auth.owner?<CommunityContentActions type={type} id={'postId'in item?item.postId:item.replyId} canDelete={item.canDelete} zh={zh} pin={auth.pin} onChanged={()=>load()} onNotice={setNotice}/>:null}</View>;
 return <ScreenScaffold compact footer={auth.owner&&post?<GlassSurface style={s.composer}><TextInput accessibilityLabel={zh?'写回复':'Write a reply'} value={body} onChangeText={setBody} multiline maxLength={2000} editable={!writing} placeholder={zh?'写一条回复…':'Write a reply…'} placeholderTextColor={c.muted} style={s.input}/><Pressable accessibilityRole="button" accessibilityLabel={zh?'发送回复':'Send reply'} disabled={writing||!body.trim()} onPress={()=>void reply()} style={s.send}><AppIcon name="send" color={c.onAction} size={19}/></Pressable></GlassSurface>:auth.owner===null?<Pressable accessibilityRole="button" onPress={()=>router.push('/profile' as never)} style={s.touch}><Text style={s.link}>{zh?'登录后参与讨论':'Sign in to join the conversation'}</Text></Pressable>:null} refreshing={refreshing} refreshLabel={zh?'刷新':'Refresh'} onRefresh={()=>void load(false,true)} leading={<BackButton onPress={()=>router.canGoBack()?router.back():router.replace('/' as never)}/>} title={zh?'讨论':'Conversation'}>
   {auth.failed?<Pressable accessibilityRole="button" onPress={()=>void auth.reload()} style={s.touch}><Text style={s.link}>{zh?'重试账户连接':'Retry account connection'}</Text></Pressable>:null}
   {loading&&!post?<ActivityIndicator color={c.actionPrimary}/>:null}
   {failed?<Pressable accessibilityRole="button" onPress={()=>void load()} style={s.touch}><Text style={s.link}>{zh?'讨论暂不可用，点此重试':'Conversation unavailable. Tap to retry.'}</Text></Pressable>:null}
   {post?<View style={s.parent}>{author(post,'community_post')}{extra?.media.length?<PostGallery postId={post.postId} media={extra.media}/>:portrait?<Image source={{uri:portrait}} style={{width:'100%',aspectRatio:1,borderRadius:12}}/>:null}{extra?.title?<Text style={s.title}>{extra.title}</Text>:null}<Text style={s.body}>{sample(post).body}</Text>{post.catId?<Pressable accessibilityRole="button" onPress={()=>router.push(`/cat/${post.catId}` as never)} style={s.touch}><Text style={s.link}>{zh?'查看猫咪档案':'View cat profile'}</Text></Pressable>:null}</View>:null}
   {post&&auth.owner&&canMessage?<Pressable accessibilityRole="button" accessibilityLabel={zh?'发送私信':'Message author'} onPress={()=>router.push(`/messages/new?type=community_post&contentId=${post.postId}` as never)} style={s.touch}><Text style={s.link}>{zh?'发送私信':'Message author'}</Text></Pressable>:null}
   {post?<Text style={s.heading}>{zh?'回复':'Replies'}</Text>:null}
   {replies.map(item=><View key={item.replyId} style={s.reply}>{author(item,'community_reply')}<Text style={s.body}>{sample(item).body}</Text><Pressable accessibilityRole="button" accessibilityLabel={zh?'回复或查看回复':'Reply or view replies'} onPress={()=>router.push(`/community/comments/${item.replyId}` as never)} style={s.touch}><Text style={s.link}>{zh?'回复 / 查看回复':'Reply / View replies'}</Text></Pressable></View>)}
   {post&&!replies.length&&!loading?<Text style={s.note}>{zh?'还没有回复。':'No replies yet.'}</Text>:null}
   {cursor?<Pressable accessibilityRole="button" disabled={loading} onPress={()=>void load(true)} style={s.touch}><Text style={s.link}>{zh?'载入更多回复':'Load more replies'}</Text></Pressable>:null}
   {notice?<Text accessibilityLiveRegion="polite" style={s.note}>{notice}</Text>:null}

 </ScreenScaffold>;
}
const styles=(c:ReturnType<typeof useNativeColors>)=>StyleSheet.create({parent:{gap:12,padding:0},reply:{gap:12,paddingVertical:16,borderBottomWidth:StyleSheet.hairlineWidth,borderColor:c.line},authorRow:{flexDirection:'row',alignItems:'center',gap:10},avatar:{width:40,height:40,borderRadius:14,backgroundColor:c.leafSoft,alignItems:'center',justifyContent:'center'},author:{fontSize:14,fontWeight:'600',color:c.ink},meta:{fontSize:12,lineHeight:18,color:c.muted},heading:{fontSize:18,fontWeight:'700',color:c.ink},title:{fontSize:18,lineHeight:25,fontWeight:'700',color:c.ink},body:{fontSize:15,lineHeight:23,color:c.ink},composer:{borderRadius:24,padding:8,flexDirection:'row',alignItems:'flex-end',gap:8},input:{flex:1,minHeight:44,maxHeight:120,paddingHorizontal:10,paddingVertical:10,color:c.ink,fontSize:15,lineHeight:22},send:{width:44,height:44,borderRadius:22,backgroundColor:c.actionPrimary,alignItems:'center',justifyContent:'center'},link:{fontSize:15,fontWeight:'600',color:c.actionPrimary},touch:{minHeight:44,justifyContent:'center'},note:{fontSize:15,lineHeight:23,color:c.muted}});
