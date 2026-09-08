import {useLocalSearchParams,useRouter} from 'expo-router';
import {useEffect,useRef,useState} from 'react';
import {randomUUID} from 'expo-crypto';
import {ActivityIndicator,Pressable,StyleSheet,Text,TextInput,View} from 'react-native';
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
 const [post,setPost]=useState<CommunityPost|null>(null),[replies,setReplies]=useState<readonly CommunityReply[]>([]),[cursor,setCursor]=useState<string|null>(null),[body,setBody]=useState(''),[loading,setLoading]=useState(true),[failed,setFailed]=useState(false),[notice,setNotice]=useState(''),[writing,setWriting]=useState(false);
 const generation=useRef(0),busy=useRef(false),alive=useRef(true),context=useRef('');context.current=`${auth.owner??''}|${id}`;
 const pending=useRef<{key:string;id:string}|null>(null);
 const load=async(more=false)=>{
   if(!alive.current)return;const token=++generation.current,current=auth.pin();setLoading(true);setFailed(false);
   try{const [parent,page]=await Promise.all([getCommunityPost(id),listCommunityReplies(id,more?cursor:null)]);if(alive.current&&token===generation.current&&await current()){setPost(parent);setReplies(old=>more?[...old,...page.items]:page.items);setCursor(page.nextCursor);}}
   catch{if(alive.current&&token===generation.current&&await current()){setFailed(true);setPost(null);setReplies([]);setCursor(null);}}
   finally{if(alive.current&&token===generation.current&&await current())setLoading(false);}
 };
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;generation.current++;};},[]);
 useEffect(()=>{generation.current++;busy.current=false;setWriting(false);setPost(null);setReplies([]);setCursor(null);setBody('');setNotice('');pending.current=null;if(auth.owner!==undefined)void load();},[id,auth.owner]);
 const reply=async()=>{
   if(!post||!auth.owner||!body.trim()||busy.current)return;busy.current=true;setWriting(true);const current=auth.pin(),scope=context.current;
   try{if(!await current())return;const key=JSON.stringify([scope,body.trim()]);if(pending.current?.key!==key)pending.current={key,id:randomUUID()};await createCommunityReply(id,body,undefined,pending.current.id);if(alive.current&&scope===context.current&&await current()){pending.current=null;setBody('');setNotice(zh?'回复已发布':'Reply posted');await load();}}
   catch{if(alive.current&&scope===context.current&&await current())setNotice(zh?'回复未完成，内容已保留。请重试。':'Reply not completed. Your text is kept; please retry.');}
   finally{if(scope===context.current){busy.current=false;if(alive.current)setWriting(false);}}
 };
 const author=(item:CommunityPost|CommunityReply,type:'community_post'|'community_reply')=><View style={s.authorRow}><View style={s.avatar}><AppIcon name={profileAvatarKey(item.author.avatarKey)} color={c.actionPrimary}/></View><View style={{flex:1}}><Text style={s.author}>{item.author.name}</Text><Text style={s.meta}>{new Date(item.createdAt).toLocaleDateString(zh?'zh-SG':'en-SG',{month:'short',day:'numeric'})}</Text></View>{auth.owner?<CommunityContentActions type={type} id={'postId'in item?item.postId:item.replyId} canDelete={item.canDelete} zh={zh} pin={auth.pin} onChanged={()=>load()} onNotice={setNotice}/>:null}</View>;
 return <ScreenScaffold title={zh?'讨论':'Conversation'}>
   {auth.failed?<Pressable accessibilityRole="button" onPress={()=>void auth.reload()} style={s.touch}><Text style={s.link}>{zh?'重试账户连接':'Retry account connection'}</Text></Pressable>:null}
   {loading&&!post?<ActivityIndicator color={c.actionPrimary}/>:null}
   {failed?<Pressable accessibilityRole="button" onPress={()=>void load()} style={s.touch}><Text style={s.link}>{zh?'讨论暂不可用，点此重试':'Conversation unavailable. Tap to retry.'}</Text></Pressable>:null}
   {post?<View style={s.parent}>{author(post,'community_post')}<Text style={s.body}>{post.body}</Text></View>:null}
   {post?<Text style={s.heading}>{zh?'回复':'Replies'}</Text>:null}
   {replies.map(item=><View key={item.replyId} style={s.reply}>{author(item,'community_reply')}<Text style={s.body}>{item.body}</Text></View>)}
   {post&&!replies.length&&!loading?<Text style={s.note}>{zh?'还没有回复。':'No replies yet.'}</Text>:null}
   {cursor?<Pressable accessibilityRole="button" disabled={loading} onPress={()=>void load(true)} style={s.touch}><Text style={s.link}>{zh?'载入更多回复':'Load more replies'}</Text></Pressable>:null}
   {notice?<Text accessibilityLiveRegion="polite" style={s.note}>{notice}</Text>:null}
   {auth.owner&&post?<GlassSurface style={s.composer}><TextInput accessibilityLabel={zh?'写回复':'Write a reply'} value={body} onChangeText={setBody} multiline maxLength={2000} editable={!writing} placeholder={zh?'写一条回复…':'Write a reply…'} placeholderTextColor={c.muted} style={s.input}/><Pressable accessibilityRole="button" accessibilityLabel={zh?'发送回复':'Send reply'} disabled={writing||!body.trim()} onPress={()=>void reply()} style={s.send}><AppIcon name="send" color={c.onAction} size={19}/></Pressable></GlassSurface>:auth.owner===null?<Pressable accessibilityRole="button" onPress={()=>router.push('/profile' as never)} style={s.touch}><Text style={s.link}>{zh?'登录后参与讨论':'Sign in to join the conversation'}</Text></Pressable>:null}
 </ScreenScaffold>;
}
const styles=(c:ReturnType<typeof useNativeColors>)=>StyleSheet.create({parent:{gap:16,padding:18,backgroundColor:c.surface,borderRadius:24},reply:{gap:12,paddingVertical:16,borderBottomWidth:StyleSheet.hairlineWidth,borderColor:c.line},authorRow:{flexDirection:'row',alignItems:'center',gap:10},avatar:{width:40,height:40,borderRadius:14,backgroundColor:c.leafSoft,alignItems:'center',justifyContent:'center'},author:{fontSize:16,fontWeight:'600',color:c.ink},meta:{fontSize:12,lineHeight:18,color:c.muted},heading:{fontSize:21,fontWeight:'700',color:c.ink},body:{fontSize:17,lineHeight:27,color:c.ink},composer:{borderRadius:24,padding:16,flexDirection:'row',alignItems:'flex-end',gap:10},input:{flex:1,minHeight:54,color:c.ink,fontSize:17,lineHeight:25},send:{width:44,height:44,borderRadius:22,backgroundColor:c.actionPrimary,alignItems:'center',justifyContent:'center'},link:{fontSize:15,fontWeight:'600',color:c.actionPrimary},touch:{minHeight:44,justifyContent:'center'},note:{fontSize:15,lineHeight:23,color:c.muted}});
