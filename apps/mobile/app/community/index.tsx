import {singaporeCommunities} from '@animalhelper/domain';
import {randomUUID} from 'expo-crypto';
import {useLocalSearchParams,useRouter} from 'expo-router';
import {useCallback,useEffect,useRef,useState} from 'react';
import {ActivityIndicator,Modal,Pressable,StyleSheet,Text,TextInput,View} from 'react-native';
import {createCommunityPost,listCommunityPosts,type CommunityPost} from '../../src/api/community';
import {useAccountSession} from '../../src/auth/use-account-session';
import {CommunityContentActions} from '../../src/community/CommunityContentActions';
import {AppIcon} from '../../src/components/AppIcon';
import {ScreenScaffold} from '../../src/components/ScreenScaffold';
import {GlassSurface} from '../../src/design/GlassSurface';
import {useNativeColors} from '../../src/design/native-colors';
import {useLocale} from '../../src/i18n/LocaleContext';
import {profileAvatarKey} from '../../src/profile/profile-avatar';

export default function CommunityScreen(){
 const c=useNativeColors(),s=styles(c),router=useRouter(),auth=useAccountSession();const {locale}=useLocale();const zh=locale==='zh-CN';
 const params=useLocalSearchParams<{communitySlug?:string;catId?:string}>();const communitySlug=typeof params.communitySlug==='string'?params.communitySlug:null,catId=typeof params.catId==='string'?params.catId:null;
 const [items,setItems]=useState<readonly CommunityPost[]>([]),[cursor,setCursor]=useState<string|null>(null),[loading,setLoading]=useState(true),[failed,setFailed]=useState(false),[notice,setNotice]=useState(''),[body,setBody]=useState(''),[writing,setWriting]=useState(false),[scope,setScope]=useState(communitySlug??''),[picker,setPicker]=useState(false),[search,setSearch]=useState('');
 const generation=useRef(0),busy=useRef(false),alive=useRef(true),context=useRef('');context.current=JSON.stringify([auth.owner,communitySlug,catId]);const pending=useRef<{key:string;id:string}|null>(null);
 const load=useCallback(async(more=false)=>{
   const token=++generation.current,current=auth.pin();setLoading(true);setFailed(false);
   try{const page=await listCommunityPosts({communitySlug,catId,cursor:more?cursor:null});if(alive.current&&token===generation.current&&await current()){setItems(old=>more?[...old,...page.items]:page.items);setCursor(page.items.length===20?page.nextCursor:null);}}
   catch{if(alive.current&&token===generation.current&&await current())setFailed(true);}
   finally{if(alive.current&&token===generation.current&&await current())setLoading(false);}
 },[auth.pin,communitySlug,catId,cursor]);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;generation.current++;};},[]);
 useEffect(()=>{generation.current++;busy.current=false;setWriting(false);setItems([]);setCursor(null);setBody('');setNotice('');setScope(communitySlug??'');pending.current=null;if(auth.owner!==undefined)void load();},[auth.owner,communitySlug,catId]);
 const submit=async()=>{
   if(!auth.owner||busy.current||!body.trim()||(!catId&&!scope))return;busy.current=true;setWriting(true);const current=auth.pin(),screenContext=context.current;
   try{if(!await current())return;const selected=communitySlug??(scope||null);const key=JSON.stringify([auth.owner,body.trim(),catId,selected]);if(pending.current?.key!==key)pending.current={key,id:randomUUID()};await createCommunityPost(body,catId,selected,undefined,pending.current.id);if(alive.current&&screenContext===context.current&&await current()){pending.current=null;setBody('');setNotice(zh?'已发布':'Posted');await load();}}
   catch{if(alive.current&&screenContext===context.current&&await current())setNotice(zh?'发布未完成，内容已保留。请确认贡献资格后重试。':'Post not completed. Your text is kept. Check contributor eligibility and retry.');}
   finally{if(screenContext===context.current){busy.current=false;if(alive.current)setWriting(false);}}
 };
 const communityName=singaporeCommunities.find(area=>area.id===communitySlug)?.name;
 return <ScreenScaffold trailing={<Pressable accessibilityRole="button" accessibilityLabel={zh?'返回':'Back'} onPress={()=>router.canGoBack()?router.back():router.replace('/' as never)} style={{minWidth:44,minHeight:44,alignItems:'center',justifyContent:'center'}}><AppIcon name="close" color={c.actionPrimary}/></Pressable>} title={zh?'邻里讨论':'Community'} subtitle={communityName??(catId?(zh?'围绕这只猫的讨论':'Conversations about this cat'):(zh?'分享发现，一起照顾社区猫。':'Share discoveries and care for community cats.'))}>
   {auth.failed?<Pressable accessibilityRole="button" onPress={()=>void auth.reload()} style={s.touch}><Text style={s.link}>{zh?'重试账户连接':'Retry account connection'}</Text></Pressable>:null}
   {auth.owner?<GlassSurface style={s.composer}>
     {!catId&&!communitySlug?<Pressable accessibilityRole="button" disabled={writing} onPress={()=>setPicker(true)} style={s.scope}><AppIcon name="location" size={18} color={c.actionPrimary}/><Text style={s.link}>{singaporeCommunities.find(area=>area.id===scope)?.name??(zh?'选择社区':'Choose community')}</Text><AppIcon name="chevron" size={16} color={c.muted}/></Pressable>:null}
     <TextInput accessibilityLabel={zh?'发起讨论':'Start a discussion'} value={body} onChangeText={setBody} multiline maxLength={2000} editable={!writing} placeholder={zh?'分享一个发现，或问个问题…':'Share a discovery or ask a question…'} placeholderTextColor={c.muted} style={s.input}/>
     <View style={s.composerFooter}><Text style={s.meta}>{body.length}/2000</Text><Pressable accessibilityRole="button" accessibilityLabel={zh?'发布':'Post'} disabled={writing||!body.trim()||(!catId&&!scope)} onPress={()=>void submit()} style={s.send}><Text style={s.sendText}>{zh?'发布':'Post'}</Text><AppIcon name="send" size={18} color={c.onAction}/></Pressable></View>
   </GlassSurface>:auth.owner===null?<Pressable accessibilityRole="button" onPress={()=>router.push('/profile' as never)} style={s.signin}><Text style={s.link}>{zh?'登录并完善资料，参与讨论':'Sign in and complete your profile to join'}</Text></Pressable>:null}
   {notice?<Text accessibilityLiveRegion="polite" style={s.note}>{notice}</Text>:null}
   {loading&&!items.length?<ActivityIndicator color={c.actionPrimary}/>:null}
   {failed?<Pressable accessibilityRole="button" onPress={()=>void load()} style={s.touch}><Text style={s.link}>{zh?'讨论暂未载入，点此重试':'Conversations did not load. Tap to retry.'}</Text></Pressable>:null}
   {!loading&&!failed&&!items.length?<View style={s.empty}><AppIcon name="community" size={36} color={c.actionPrimary}/><Text style={s.note}>{zh?'还没有讨论，来分享第一条有用的发现吧。':'No discussions yet. Share the first useful discovery.'}</Text></View>:null}
   {items.map(post=><View key={post.postId} style={s.post}>
     <View style={s.metaRow}><View style={s.avatar}><AppIcon name={profileAvatarKey(post.author.avatarKey)} color={c.actionPrimary}/></View><View style={{flex:1}}><Text style={s.author}>{post.author.name}</Text><Text style={s.meta}>{singaporeCommunities.find(a=>a.id===post.communitySlug)?.name??(zh?'猫咪讨论':'Cat discussion')} · {new Date(post.createdAt).toLocaleDateString(zh?'zh-SG':'en-SG',{month:'short',day:'numeric'})}</Text></View>{auth.owner?<CommunityContentActions type="community_post" id={post.postId} canDelete={post.canDelete} zh={zh} pin={auth.pin} onChanged={()=>load()} onNotice={setNotice}/>:null}</View>
     <Pressable accessibilityRole="button" accessibilityLabel={zh?'打开讨论':'Open discussion'} onPress={()=>router.push(`/community/${post.postId}` as never)} style={s.postOpen}><Text style={s.body}>{post.body}</Text><View style={s.replyRow}><AppIcon name="reply" size={18} color={c.muted}/><Text style={s.meta}>{post.replyCount} {zh?'条回复':'replies'}</Text></View></Pressable>
   </View>)}
   {cursor?<Pressable accessibilityRole="button" disabled={loading} onPress={()=>void load(true)} style={s.touch}><Text style={s.link}>{zh?'载入更多':'Load more'}</Text></Pressable>:null}
   <Modal visible={picker} animationType="slide" presentationStyle="pageSheet" onRequestClose={()=>setPicker(false)}><ScreenScaffold title={zh?'选择社区':'Choose community'} trailing={<Pressable accessibilityRole="button" onPress={()=>setPicker(false)} style={s.touch}><Text style={s.link}>{zh?'完成':'Done'}</Text></Pressable>}><TextInput accessibilityLabel={zh?'搜索社区':'Search communities'} placeholder={zh?'社区名称':'Community name'} placeholderTextColor={c.muted} value={search} onChangeText={setSearch} style={s.search}/>{singaporeCommunities.filter(area=>area.name.toLowerCase().includes(search.trim().toLowerCase())).map(area=><Pressable accessibilityRole="button" accessibilityState={{selected:scope===area.id}} key={area.id} onPress={()=>{setScope(area.id);setPicker(false);}} style={s.areaRow}><Text style={s.author}>{area.name}</Text>{scope===area.id?<AppIcon name="check" color={c.actionPrimary}/>:null}</Pressable>)}</ScreenScaffold></Modal>
 </ScreenScaffold>;
}
const styles=(c:ReturnType<typeof useNativeColors>)=>StyleSheet.create({composer:{borderRadius:24,padding:16,gap:10},scope:{minHeight:44,flexDirection:'row',alignItems:'center',gap:8},input:{minHeight:80,fontSize:17,lineHeight:24,color:c.ink},composerFooter:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},send:{minHeight:44,paddingHorizontal:18,gap:8,borderRadius:22,flexDirection:'row',alignItems:'center',backgroundColor:c.actionPrimary},sendText:{color:c.onAction,fontWeight:'600'},post:{backgroundColor:c.surface,borderRadius:24,padding:18,gap:12},metaRow:{flexDirection:'row',alignItems:'center',gap:10},avatar:{width:42,height:42,borderRadius:15,backgroundColor:c.leafSoft,alignItems:'center',justifyContent:'center'},author:{fontSize:16,fontWeight:'600',color:c.ink},meta:{fontSize:12,lineHeight:18,color:c.muted},body:{fontSize:17,lineHeight:27,color:c.ink},postOpen:{gap:18},replyRow:{flexDirection:'row',alignItems:'center',gap:6},link:{fontSize:15,fontWeight:'600',color:c.actionPrimary},note:{fontSize:15,lineHeight:23,color:c.muted},touch:{minHeight:44,justifyContent:'center'},empty:{paddingVertical:26,alignItems:'center',gap:14},signin:{padding:18,borderRadius:20,backgroundColor:c.leafSoft},search:{minHeight:46,color:c.ink,backgroundColor:c.surface,borderRadius:16,paddingHorizontal:14},areaRow:{minHeight:52,flexDirection:'row',alignItems:'center',justifyContent:'space-between',borderBottomWidth:StyleSheet.hairlineWidth,borderColor:c.line}});
