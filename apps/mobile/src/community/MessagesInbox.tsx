import {useCallback,useEffect,useRef,useState} from 'react';
import {ActivityIndicator,AppState,Pressable,StyleSheet,Text,TextInput,View} from 'react-native';
import {useFocusEffect,useRouter} from 'expo-router';
import {listDirectConversations,type DirectConversation} from '../api/direct-messages';
import {useAccountSession} from '../auth/use-account-session';
import {ProfileAvatar} from '../profile/ProfileAvatar';
import {AppIcon} from '../components/AppIcon';
import {ScreenScaffold} from '../components/ScreenScaffold';
import {useNativeColors} from '../design/native-colors';
import {useLocale} from '../i18n/LocaleContext';
const merge=(old:readonly DirectConversation[],next:readonly DirectConversation[])=>[...new Map([...old,...next].map(x=>[x.conversationId,x])).values()].sort((a,b)=>Date.parse(b.lastMessageAt??b.createdAt)-Date.parse(a.lastMessageAt??a.createdAt)||b.conversationId.localeCompare(a.conversationId));
export function MessagesInbox({requestsOnly=false}:{requestsOnly?:boolean}){
 const {locale}=useLocale(),cn=locale==='zh-CN',auth=useAccountSession(),router=useRouter(),c=useNativeColors();
 const [items,setItems]=useState<readonly DirectConversation[]>([]),[loadedOwner,setLoadedOwner]=useState<string|null>(null),[cursor,setCursor]=useState<string|null>(null),[loading,setLoading]=useState(false),[failed,setFailed]=useState(false),[search,setSearch]=useState(''),[searching,setSearching]=useState(false);
 const generation=useRef(0),focused=useRef(false),busy=useRef(false),ownerRef=useRef(auth.owner);ownerRef.current=auth.owner;
 const load=async(more=false)=>{
  const owner=auth.owner;if(!owner||busy.current||!focused.current||(more&&!cursor))return;
  const token=generation.current,pin=auth.pin();busy.current=true;setLoading(true);
  const valid=async()=>focused.current&&token===generation.current&&ownerRef.current===owner&&await pin();
  try{const page=await listDirectConversations(more?cursor:null);if(await valid()){setItems(old=>more?merge(old,page.items):page.items);setLoadedOwner(owner);setCursor(page.nextCursor);setFailed(false);}}
  catch{if(await valid())setFailed(true);}finally{if(token===generation.current){busy.current=false;setLoading(false);}}
 };
 const loadRef=useRef(load);loadRef.current=load;
 useEffect(()=>{setItems([]);setCursor(null);setLoadedOwner(null);setFailed(false);setSearch('');},[auth.owner]);
 useFocusEffect(useCallback(()=>{
  focused.current=true;generation.current++;busy.current=false;void loadRef.current();
  const listener=AppState.addEventListener('change',state=>{if(state==='active')void loadRef.current();});
  return()=>{focused.current=false;generation.current++;busy.current=false;listener.remove();};
 },[auth.owner]));
 const ready=!!auth.owner&&loadedOwner===auth.owner;
 const visible=ready?items.filter(row=>(!requestsOnly||row.status==='pending')&&(!search||`${row.otherMember.name} ${row.lastMessagePreview??''}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()))):[];
 const title=requestsOnly?(cn?'消息请求':'Message requests'):(cn?'消息':'Messages');
 const label=(row:DirectConversation)=>`${row.otherMember.name}${row.unreadCount?(cn?'，未读':', unread'):''}`;
 const rowDate=(row:DirectConversation)=>new Date(row.lastMessageAt??row.createdAt).toLocaleDateString(cn?'zh-SG':'en-SG',{month:'short',day:'numeric'});
 return <ScreenScaffold compact title={title} refreshing={loading&&ready} onRefresh={()=>void loadRef.current()} trailing={<Pressable accessibilityRole="button" accessibilityLabel={requestsOnly?(cn?'返回':'Back'):(cn?'搜索会话':'Search conversations')} style={s.touch} onPress={()=>requestsOnly?router.back():setSearching(value=>!value)}><AppIcon name={requestsOnly?'back':'search'} size={21} color={c.ink}/></Pressable>}>
  {!auth.owner?<View style={s.empty}><Text style={{color:c.muted}}>{cn?'登录后查看私信和互动。':'Sign in to see messages and activity.'}</Text><Pressable accessibilityRole="button" onPress={()=>router.push('/profile' as never)} style={s.touch}><Text style={{color:c.actionPrimary}}>{cn?'登录':'Sign in'}</Text></Pressable></View>:<>
   {!requestsOnly?<View style={s.shortcuts}>{([{path:'/activity',label:cn?'互动':'Activity',hint:cn?'评论与点赞':'Comments and likes',icon:'heart'},{path:'/requests',label:cn?'消息请求':'Requests',hint:cn?'新的对话':'New conversations',icon:'mail'}] as const).map(item=><Pressable key={item.path} accessibilityRole="button" accessibilityLabel={item.label} onPress={()=>router.push(item.path as never)} style={[s.shortcut,{backgroundColor:c.surface,borderColor:c.line}]}><AppIcon name={item.icon} color={c.actionPrimary} size={23}/><Text style={{color:c.ink,fontSize:14,fontWeight:'600'}}>{item.label}</Text><Text style={{color:c.muted,fontSize:12}}>{item.hint}</Text></Pressable>)}</View>:null}
   {searching?<TextInput accessibilityLabel={cn?'搜索会话':'Search conversations'} placeholder={cn?'搜索会话':'Search conversations'} placeholderTextColor={c.muted} value={search} onChangeText={setSearch} style={{minHeight:44,fontSize:15,color:c.ink,paddingHorizontal:12,backgroundColor:c.surface,borderRadius:12}}/>:null}
   {loading&&!ready?<ActivityIndicator color={c.actionPrimary}/>:null}
   {failed?<Pressable accessibilityRole="button" onPress={()=>void loadRef.current()} style={s.touch}><Text style={{color:c.actionPrimary,fontSize:13}}>{cn?'消息暂不可用，点此重试':'Messages unavailable. Tap to retry'}</Text></Pressable>:null}
   <View>{visible.map(row=><Pressable key={row.conversationId} accessibilityRole="button" accessibilityLabel={label(row)} onPress={()=>router.push(`/messages/${row.conversationId}` as never)} style={[s.row,{borderBottomColor:c.line}]}><View style={{width:48}}><ProfileAvatar avatarKey={row.otherMember.avatarKey} size={42}/>{row.unreadCount?<View style={[s.dot,{backgroundColor:c.actionPrimary}]}/>:null}</View><View style={{flex:1,gap:4}}><View style={{flexDirection:'row',gap:8,alignItems:'center'}}><Text numberOfLines={1} style={{flex:1,color:c.ink,fontWeight:row.unreadCount?'700':'500',fontSize:14}}>{row.otherMember.name}</Text><Text style={{color:c.muted,fontSize:11}}>{rowDate(row)}</Text></View><Text numberOfLines={1} style={{color:c.muted,fontSize:13}}>{row.lastMessagePreview}</Text>{row.status==='pending'?<Text style={{color:c.actionPrimary,fontSize:11}}>{row.isIncoming?(cn?'消息请求':'Message request'):(cn?'等待接受':'Awaiting acceptance')}</Text>:null}</View><AppIcon name="chevron" color={c.muted} size={13}/></Pressable>)}</View>
   {!loading&&!failed&&!visible.length&&!cursor?<View style={s.empty}><Text style={{color:c.muted,fontSize:14}}>{requestsOnly?(cn?'没有待处理的消息请求':'No pending message requests'):(cn?'还没有会话。可以从帖子作者开始交流。':'No conversations yet. Start from a post author.')}</Text></View>:null}
   {ready&&cursor?<Pressable accessibilityRole="button" disabled={loading} onPress={()=>void loadRef.current(true)} style={s.touch}><Text style={{color:c.actionPrimary,fontSize:13}}>{cn?'载入更多':'Load more'}</Text></Pressable>:null}
  </>}
 </ScreenScaffold>;
}
const s=StyleSheet.create({shortcuts:{flexDirection:'row',gap:10,marginBottom:8},shortcut:{minHeight:110,borderRadius:16,padding:14,flex:1,gap:6,borderWidth:StyleSheet.hairlineWidth},row:{minHeight:76,paddingVertical:12,flexDirection:'row',gap:8,alignItems:'center',borderBottomWidth:StyleSheet.hairlineWidth},dot:{position:'absolute',left:-5,top:18,width:7,height:7,borderRadius:4},touch:{minHeight:44,minWidth:44,justifyContent:'center',alignItems:'center'},empty:{paddingVertical:32,alignItems:'center',gap:10}});
