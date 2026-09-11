import {useCallback,useRef,useState} from 'react';
import {ActivityIndicator,KeyboardAvoidingView,Platform,Pressable,ScrollView,StyleSheet,Text,TextInput,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useFocusEffect,useLocalSearchParams,useRouter} from 'expo-router';
import {randomUUID} from 'expo-crypto';
import {createDirectMessageRequest,getCommunityAuthor} from '../../src/api/direct-messages';
import {getCommunityAvatars} from '../../src/api/community-avatar';
import {AppIcon} from '../../src/components/AppIcon';
import {ProfileAvatar} from '../../src/profile/ProfileAvatar';
import {useNativeColors} from '../../src/design/native-colors';
import {useAccountSession} from '../../src/auth/use-account-session';
import {useLocale} from '../../src/i18n/LocaleContext';
import {listPendingDirectMessages,removePendingDirectMessage,savePendingDirectMessage,type PendingDirectMessage} from '../../src/offline/direct-message-outbox';

export default function NewMessage(){
 const params=useLocalSearchParams<{type:string;contentId:string}>(),router=useRouter(),c=useNativeColors(),auth=useAccountSession(),{locale}=useLocale(),cn=locale==='zh-CN';
 const type=params.type==='community_reply'?'community_reply':'community_post',contentId=typeof params.contentId==='string'?params.contentId:'',outboxScope=`${type}:${contentId}`,scope=`${auth.owner??''}:${outboxScope}`;
 const scopeRef=useRef(scope);scopeRef.current=scope;
 const focused=useRef(false),generation=useRef(0),mutation=useRef(false);
 const [viewScope,setViewScope]=useState(''),[author,setAuthor]=useState<Awaited<ReturnType<typeof getCommunityAuthor>>|null>(null),[photo,setPhoto]=useState<string|null>(null);
 const [body,setBody]=useState(''),[pending,setPending]=useState<PendingDirectMessage|null>(null),[error,setError]=useState<'load'|'send'|'storage'|null>(null),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true);
 const same=scope===viewScope,shown=same?author:null;
 const load=async()=>{
  const ticket=++generation.current,captured=scope,pin=auth.pin(),owner=auth.owner;
  const valid=async()=>focused.current&&ticket===generation.current&&scopeRef.current===captured&&await pin();
  setLoading(true);setError(null);setBody('');setPending(null);setViewScope('');setBusy(false);mutation.current=false;
  try{
   const result=await getCommunityAuthor(type,contentId);if(!await valid())return;
   const [saved,avatars]=await Promise.all([owner?listPendingDirectMessages(owner):Promise.resolve([]),getCommunityAvatars(type,[contentId]).catch(()=>new Map<string,string>())]);
   if(!await valid())return;
   const draft=saved.find(item=>item.conversationId===outboxScope)??null;
   setAuthor(result);setPhoto(avatars.get(contentId)??null);setPending(draft);setBody(draft?.body??'');setViewScope(captured);
   if(result.conversationId){
    if(draft&&owner){
     try{await createDirectMessageRequest(type,contentId,draft.body,draft.requestId);if(!await valid())return;await removePendingDirectMessage(owner,draft.requestId);}
     catch{if(await valid())setError('send');return;}
    }
    if(await valid())router.replace(`/messages/${result.conversationId}` as never);
   }
  }catch{if(await valid())setError('load');}finally{if(ticket===generation.current)setLoading(false);}
 };
 const loadRef=useRef(load);loadRef.current=load;
 useFocusEffect(useCallback(()=>{focused.current=true;if(auth.owner!==undefined)void loadRef.current();return()=>{focused.current=false;generation.current++;};},[scope,auth.owner]));
 const send=async()=>{
  const owner=auth.owner;if(!owner||!shown||!(shown.canMessage||pending&&shown.conversationId)||mutation.current||!body.trim())return;
  const item=pending??{owner,conversationId:outboxScope,body:body.trim(),requestId:randomUUID()},captured=scope,ticket=generation.current,pin=auth.pin();
  const valid=async()=>focused.current&&ticket===generation.current&&scopeRef.current===captured&&await pin();
  mutation.current=true;setBusy(true);setError(null);let saved=false;
  try{
   if(!await valid())return;await savePendingDirectMessage(item);saved=true;if(!await valid())return;setPending(item);
   const result=await createDirectMessageRequest(type,contentId,item.body,item.requestId);if(!await valid())return;
   await removePendingDirectMessage(owner,item.requestId);if(!await valid())return;
   router.replace(`/messages/${result.conversationId}` as never);
  }catch{if(await valid())setError(saved?'send':'storage');}finally{if(ticket===generation.current&&scopeRef.current===captured){mutation.current=false;setBusy(false);}}
 };
 return <SafeAreaView style={{flex:1,backgroundColor:c.canvas}}><KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':undefined}>
  <View style={s.header}><Pressable accessibilityRole="button" accessibilityLabel={cn?'返回':'Back'} onPress={()=>router.back()} style={s.touch}><AppIcon name="back" size={21} color={c.ink}/></Pressable><Text accessibilityRole="header" style={{fontSize:16,fontWeight:'600',color:c.ink}}>{cn?'发起私信':'New message'}</Text><View style={s.touch}/></View>
  <ScrollView keyboardDismissMode="interactive" keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
   {loading?<ActivityIndicator/>:null}
   {shown?<><View style={s.person}><ProfileAvatar avatarKey={shown.author.avatarKey} photoUri={photo} size={64}/><Text style={{fontSize:18,fontWeight:'600',color:c.ink}}>{shown.author.name}</Text></View>
    {!auth.owner?<Pressable accessibilityRole="button" onPress={()=>router.push('/profile' as never)} style={s.touch}><Text style={{color:c.actionPrimary}}>{cn?'登录后发起私信':'Sign in to message'}</Text></Pressable>:(shown.canMessage||pending&&shown.conversationId)?<>
     <Text style={{color:c.muted,fontSize:13,lineHeight:19,textAlign:'center'}}>{cn?'先打个招呼，对方接受后即可继续聊天。':'Say hello. You can keep chatting once they accept.'}</Text>
     <TextInput accessibilityLabel={cn?'消息':'Message'} placeholder={cn?'说点什么…':'Write a message…'} placeholderTextColor={c.muted} value={same?body:''} onChangeText={setBody} editable={!pending&&!busy} maxLength={2000} multiline style={[s.input,{backgroundColor:c.surface,color:c.ink}]}/>
     <Pressable accessibilityRole="button" disabled={busy||!body.trim()} onPress={()=>void send()} style={[s.button,{backgroundColor:c.actionPrimary,opacity:busy||!body.trim()?0.5:1}]}><Text style={{color:c.onAction,fontSize:14,fontWeight:'600'}}>{busy?(cn?'发送中…':'Sending…'):pending?(cn?'重试请求':'Retry request'):(cn?'发送请求':'Send request')}</Text></Pressable>
    </>:<Text style={{color:c.muted,fontSize:13,textAlign:'center'}}>{cn?'暂时无法向这位用户发送私信。':'Messaging is unavailable for this person.'}</Text>}
   </>:null}
   {error?<View><Text style={{color:c.muted,fontSize:13,lineHeight:19}}>{error==='send'?(cn?'请求未发送。文字已保存，可在下方重试。':'Request not sent. Your text is saved; retry below.'):error==='storage'?(cn?'无法保存消息，请稍后重试。':'Could not save your message. Please try again.'):(cn?'暂时无法加载。':'Could not load this person.')}</Text>{error==='load'?<Pressable accessibilityRole="button" onPress={()=>void loadRef.current()} style={s.touch}><Text style={{color:c.actionPrimary}}>{cn?'重试':'Retry'}</Text></Pressable>:null}</View>:null}
  </ScrollView>
 </KeyboardAvoidingView></SafeAreaView>;
}
const s=StyleSheet.create({header:{height:56,flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:8},touch:{minWidth:44,minHeight:44,alignItems:'center',justifyContent:'center'},content:{padding:20,gap:20},person:{alignItems:'center',gap:12,paddingTop:20},input:{borderRadius:18,padding:16,minHeight:140,fontSize:15,lineHeight:22,textAlignVertical:'top'},button:{minHeight:46,borderRadius:23,alignItems:'center',justifyContent:'center'}});
