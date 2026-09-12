import {BackButton} from '../../src/components/BackButton';
import {useCallback,useEffect,useRef,useState} from 'react';
import {ActivityIndicator,Alert,AppState,KeyboardAvoidingView,Platform,Pressable,RefreshControl,ScrollView,StyleSheet,Text,TextInput,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useFocusEffect,useLocalSearchParams,useRouter} from 'expo-router';
import {randomUUID} from 'expo-crypto';
import {blockDirectConversation,getDirectConversation,listDirectMessages,markDirectConversationRead,respondToDirectMessageRequest,sendDirectMessage,type DirectConversation,type DirectMessage} from '../../src/api/direct-messages';
import {useAccountSession} from '../../src/auth/use-account-session';
import {useLocale} from '../../src/i18n/LocaleContext';
import {AppIcon} from '../../src/components/AppIcon';
import {ProfileAvatar} from '../../src/profile/ProfileAvatar';
import {GlassSurface} from '../../src/design/GlassSurface';
import {useNativeColors} from '../../src/design/native-colors';
import {listPendingDirectMessages,removePendingDirectMessage,savePendingDirectMessage,type PendingDirectMessage} from '../../src/offline/direct-message-outbox';

const merge=(old:readonly DirectMessage[],next:readonly DirectMessage[])=>[...new Map([...old,...next].map(x=>[x.messageId,x])).values()].sort((a,b)=>Date.parse(a.sentAt)-Date.parse(b.sentAt)||a.messageId.localeCompare(b.messageId));
async function clearPending(owner:string,conversationId:string,valid:()=>Promise<boolean>){
 const rows=await listPendingDirectMessages(owner);
 for(const row of rows.filter(item=>item.conversationId===conversationId)){if(!await valid())return;await removePendingDirectMessage(owner,row.requestId);}
}
export default function MessageThread(){
 const params=useLocalSearchParams<{id:string}>(),id=typeof params.id==='string'?params.id:'',router=useRouter(),auth=useAccountSession(),c=useNativeColors(),{locale}=useLocale(),cn=locale==='zh-CN';
 const scope=`${auth.owner??''}:${id}`,scopeRef=useRef(scope);scopeRef.current=scope;
 const [viewScope,setViewScope]=useState(''),[conversation,setConversation]=useState<DirectConversation|null>(null),[messages,setMessages]=useState<readonly DirectMessage[]>([]),[pending,setPending]=useState<PendingDirectMessage[]>([]),[cursor,setCursor]=useState<string|null>(null);
 const [text,setText]=useState(''),[failed,setFailed]=useState(false),[localFailed,setLocalFailed]=useState(false),[refreshing,setRefreshing]=useState(false),[mutating,setMutating]=useState(false);
 const focused=useRef(false),generation=useRef(0),loading=useRef(false),mutation=useRef(false),atBottom=useRef(true),scroll=useRef<ScrollView>(null),responseId=useRef<{accept:boolean;id:string}|null>(null);
 const same=viewScope===scope&&!!auth.owner,shown=same?messages:[],drafts=same?pending:[],thread=same?conversation:null;
 const load=async(more=false)=>{
  const owner=auth.owner;if(!owner||!id||loading.current||mutation.current||!focused.current||more&&!cursor)return;
  const ticket=generation.current,pin=auth.pin(),captured=scope;loading.current=true;setRefreshing(true);
  const valid=async()=>focused.current&&ticket===generation.current&&scopeRef.current===captured&&await pin();
  try{
   const row=await getDirectConversation(id);
   const [page,outbox]=await Promise.all([listDirectMessages(id,more?cursor:null),listPendingDirectMessages(owner).catch(()=>null)]);
   if(!await valid())return;
   const saved=(outbox??[]).filter(item=>item.conversationId===id),acknowledged=new Set(page.items.flatMap(item=>item.isMine&&item.requestId?[item.requestId]:[]));
   for(const item of saved.filter(item=>acknowledged.has(item.requestId))){if(!await valid())return;await removePendingDirectMessage(owner,item.requestId);}
   if(!await valid())return;
   setConversation(row);setMessages(old=>more?merge(page.items,old):page.items);setPending(saved.filter(item=>!acknowledged.has(item.requestId)));setCursor(page.nextCursor);setViewScope(captured);setFailed(false);setLocalFailed(outbox===null);
  }catch(error){if(await valid()){setFailed(true);if(error instanceof Error&&error.message==='direct_conversation_hidden'){setConversation(null);setMessages([]);setPending([]);await clearPending(owner,id,valid).catch(()=>undefined);}}}
  finally{if(ticket===generation.current){loading.current=false;setRefreshing(false);}}
 };
 const loadRef=useRef(load);loadRef.current=load;
 useEffect(()=>{setText('');setPending([]);setMessages([]);setConversation(null);setViewScope('');setCursor(null);setFailed(false);setLocalFailed(false);mutation.current=false;setMutating(false);responseId.current=null;atBottom.current=true;},[scope]);
 useFocusEffect(useCallback(()=>{
  focused.current=true;generation.current++;loading.current=false;mutation.current=false;setMutating(false);void loadRef.current();
  const refresh=()=>{if(AppState.currentState==='active'&&atBottom.current)void loadRef.current();};
  const timer=setInterval(refresh,15000),listener=AppState.addEventListener('change',state=>{if(state==='active')refresh();});
  return()=>{focused.current=false;generation.current++;loading.current=false;clearInterval(timer);listener.remove();};
 },[scope]));
 const send=async(existing?:PendingDirectMessage)=>{
  const owner=auth.owner;if(!owner||!thread||thread.status!=='accepted'||mutation.current||(!existing&&!text.trim()))return;
  const item=existing??{owner,conversationId:id,body:text.trim(),requestId:randomUUID()},captured=scope,ticket=generation.current,pin=auth.pin();
  const valid=async()=>focused.current&&scopeRef.current===captured&&ticket===generation.current&&await pin();
  mutation.current=true;setMutating(true);
  try{
   if(!await valid())return;await savePendingDirectMessage(item);if(!await valid())return;
   setPending(old=>[...old.filter(value=>value.requestId!==item.requestId),item]);if(!existing)setText('');
   const result=await sendDirectMessage(id,item.body,item.requestId);if(!await valid())return;
   await removePendingDirectMessage(owner,item.requestId);if(!await valid())return;
   setPending(old=>old.filter(value=>value.requestId!==item.requestId));setMessages(old=>merge(old,[{messageId:result.messageId,body:item.body,sentAt:result.sentAt,isMine:true,requestId:item.requestId,cursor:result.messageId}]));setFailed(false);setLocalFailed(false);atBottom.current=true;
  }catch{if(await valid())setFailed(true);}
  finally{if(scopeRef.current===captured&&ticket===generation.current){mutation.current=false;setMutating(false);}}
 };
 const respond=async(accept:boolean)=>{
  if(!thread||!auth.owner||mutation.current)return;const captured=scope,ticket=generation.current,pin=auth.pin();mutation.current=true;setMutating(true);
  const request=responseId.current?.accept===accept?responseId.current:{accept,id:randomUUID()};responseId.current=request;
  try{if(!await pin())return;await respondToDirectMessageRequest(id,accept,request.id);if(focused.current&&ticket===generation.current&&captured===scopeRef.current&&await pin()){mutation.current=false;await loadRef.current();}}
  catch{if(ticket===generation.current&&await pin())setFailed(true);}finally{if(ticket===generation.current){mutation.current=false;setMutating(false);}}
 };
 const block=()=>Alert.alert(cn?'屏蔽此用户？':'Block this person?',cn?'双方将无法继续查看或发送私信。':'You will no longer see or send messages to each other.',[{text:cn?'取消':'Cancel',style:'cancel'},{text:cn?'屏蔽':'Block',style:'destructive',onPress:()=>{const pin=auth.pin(),captured=scope;void(async()=>{try{if(!await pin())return;await blockDirectConversation(id,randomUUID());if(focused.current&&captured===scopeRef.current&&await pin()){setMessages([]);setConversation(null);setPending([]);if(auth.owner)await clearPending(auth.owner,id,async()=>focused.current&&captured===scopeRef.current&&await pin()).catch(()=>undefined);if(focused.current&&captured===scopeRef.current&&await pin())router.back();}}catch{if(captured===scopeRef.current&&await pin())setFailed(true);}})();}}]);
 const onContent=()=>{
  if(!atBottom.current)return;scroll.current?.scrollToEnd({animated:false});const anchor=shown.at(-1),pin=auth.pin(),captured=scope;
  if(anchor&&focused.current&&AppState.currentState!=='background')void(async()=>{if(captured===scopeRef.current&&await pin())await markDirectConversationRead(id,anchor.messageId).catch(()=>undefined);})();
 };
 const time=(date:string)=>new Date(date).toLocaleTimeString(cn?'zh-SG':'en-SG',{hour:'2-digit',minute:'2-digit'});
 return <SafeAreaView edges={['top','left','right','bottom']} style={{flex:1,backgroundColor:c.canvas}}><KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':undefined} style={{flex:1}}>
  <View style={[s.header,{borderBottomColor:c.line}]}><BackButton onPress={()=>router.back()}/>{thread?<ProfileAvatar avatarKey={thread.otherMember.avatarKey} size={34}/>:null}<Text numberOfLines={1} accessibilityRole="header" style={{flex:1,color:c.ink,fontSize:16,fontWeight:'600'}}>{thread?.otherMember.name??(cn?'私信':'Messages')}</Text>{thread?<Pressable accessibilityRole="button" accessibilityLabel={cn?'屏蔽用户':'Block person'} onPress={block} style={s.touch}><AppIcon name="more" size={21} color={c.ink}/></Pressable>:null}</View>
  {!auth.owner?<View style={s.empty}><Text style={{color:c.muted}}>{cn?'登录后查看私信。':'Sign in to view messages.'}</Text><Pressable accessibilityRole="button" onPress={()=>router.push('/profile' as never)} style={s.touch}><Text style={{color:c.actionPrimary}}>{cn?'登录':'Sign in'}</Text></Pressable></View>:<ScrollView ref={scroll} style={{flex:1}} contentContainerStyle={s.list} keyboardDismissMode="interactive" keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>{atBottom.current=true;void loadRef.current();}}/>} onContentSizeChange={onContent} scrollEventThrottle={100} onScroll={event=>{const {contentOffset,contentSize,layoutMeasurement}=event.nativeEvent;atBottom.current=contentOffset.y+layoutMeasurement.height>=contentSize.height-64;}}>
   {!thread&&refreshing?<ActivityIndicator/>:null}{same&&cursor?<Pressable accessibilityRole="button" onPress={()=>{atBottom.current=false;void loadRef.current(true);}} style={s.touch}><Text style={{color:c.actionPrimary}}>{cn?'查看更早消息':'Load earlier'}</Text></Pressable>:null}
   {shown.map((message,index)=><View key={message.messageId}>{index===0||new Date(shown[index-1].sentAt).toDateString()!==new Date(message.sentAt).toDateString()?<Text style={[s.day,{color:c.muted}]}>{new Date(message.sentAt).toLocaleDateString(cn?'zh-SG':'en-SG',{month:'short',day:'numeric'})}</Text>:null}<View style={[s.bubble,{backgroundColor:message.isMine?c.actionPrimary:c.surface,alignSelf:message.isMine?'flex-end':'flex-start'}]}><Text selectable style={{color:message.isMine?c.onAction:c.ink,fontSize:15,lineHeight:21}}>{message.body}</Text></View><Text style={{color:c.muted,fontSize:11,textAlign:message.isMine?'right':'left',marginTop:4}}>{time(message.sentAt)}{message.isMine?(cn?' · 已发送':' · Sent'):''}</Text></View>)}
   {drafts.map(item=><View key={item.requestId} style={{alignSelf:'flex-end',maxWidth:'82%'}}><View style={[s.bubble,{backgroundColor:c.surface}]}><Text style={{color:c.ink,fontSize:15}}>{item.body}</Text></View><Pressable accessibilityRole="button" accessibilityLabel={cn?'重试消息':'Retry message'} disabled={mutating||thread?.status!=='accepted'} onPress={()=>void send(item)} style={[s.touch,{alignSelf:'flex-end'}]}><Text style={{color:c.actionPrimary,fontSize:12}}>{mutating?(cn?'发送中…':'Sending…'):(cn?'未发送 · 重试':'Not sent · Retry')}</Text></Pressable></View>)}
  </ScrollView>}
  {failed||localFailed?<Pressable accessibilityRole="button" onPress={()=>void loadRef.current()} style={{paddingHorizontal:16,minHeight:44,justifyContent:'center'}}><Text style={{color:c.muted,fontSize:12}}>{cn?'暂未同步，未发送文字已保留。点此重试。':'Could not sync. Pending text is retained. Tap to retry.'}</Text></Pressable>:null}
  {thread?.status==='pending'?<View style={[s.notice,{backgroundColor:c.surface}]}><Text style={{color:c.muted,fontSize:13}}>{thread.isIncoming?(cn?'对方想和你开始对话':'Wants to start a conversation'):(cn?'等待对方接受':'Waiting for acceptance')}</Text>{thread.isIncoming?<View style={{flexDirection:'row',gap:24}}>{[false,true].map(accept=><Pressable key={String(accept)} accessibilityRole="button" disabled={mutating} onPress={()=>void respond(accept)} style={s.touch}><Text style={{color:accept?c.actionPrimary:c.muted,fontWeight:'600'}}>{accept?(cn?'接受':'Accept'):(cn?'拒绝':'Decline')}</Text></Pressable>)}</View>:null}</View>:thread?.status==='rejected'?<Text style={[s.notice,{color:c.muted}]}>{cn?'这条消息请求已关闭':'This message request is closed'}</Text>:thread?.status==='accepted'?<GlassSurface style={s.compose}><TextInput accessibilityLabel={cn?'输入消息':'Write a message'} placeholder={cn?'说点什么…':'Message'} placeholderTextColor={c.muted} value={text} onChangeText={setText} maxLength={2000} multiline style={[s.input,{color:c.ink}]}/><Pressable accessibilityRole="button" accessibilityLabel={cn?'发送':'Send message'} disabled={mutating||!text.trim()} onPress={()=>void send()} style={[s.touch,s.send,{backgroundColor:c.actionPrimary,opacity:mutating||!text.trim()?0.5:1}]}><AppIcon name="send" size={19} color={c.onAction}/></Pressable></GlassSurface>:null}
 </KeyboardAvoidingView></SafeAreaView>;
}
const s=StyleSheet.create({header:{minHeight:56,paddingHorizontal:8,flexDirection:'row',alignItems:'center',gap:8,borderBottomWidth:StyleSheet.hairlineWidth},touch:{minHeight:44,minWidth:44,justifyContent:'center',alignItems:'center'},list:{padding:16,gap:12,flexGrow:1},bubble:{maxWidth:'82%',borderRadius:17,paddingHorizontal:13,paddingVertical:10},day:{fontSize:11,textAlign:'center',marginVertical:12},compose:{flexDirection:'row',alignItems:'flex-end',gap:8,padding:6,marginHorizontal:12,marginBottom:6,borderRadius:27},input:{flex:1,minHeight:44,maxHeight:130,fontSize:15,paddingHorizontal:12,paddingVertical:11},send:{width:44,borderRadius:22},empty:{flex:1,alignItems:'center',justifyContent:'center',gap:12},notice:{paddingHorizontal:16,paddingVertical:12,gap:6}});
