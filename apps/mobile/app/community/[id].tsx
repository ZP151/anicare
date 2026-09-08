import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { randomUUID } from 'expo-crypto';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { createCommunityReply, deleteCommunityContent, getCommunityPost, listCommunityReplies, reportCommunityContent, type CommunityPost, type CommunityReply } from '../../src/api/community';
import { useAccountSession } from '../../src/auth/use-account-session';
import { AppIcon } from '../../src/components/AppIcon';
import { ScreenScaffold } from '../../src/components/ScreenScaffold';
import { useNativeColors } from '../../src/design/native-colors';
import { useLocale } from '../../src/i18n/LocaleContext';

export default function CommunityDetailScreen() {
 const { id }=useLocalSearchParams<{id:string}>(); const auth=useAccountSession(); const {locale}=useLocale(); const zh=locale==='zh-CN'; const c=useNativeColors();const s=styles(c);const [post,setPost]=useState<CommunityPost|null>(null);const [replies,setReplies]=useState<readonly CommunityReply[]>([]);const [cursor,setCursor]=useState<string|null>(null);const [body,setBody]=useState('');const [loading,setLoading]=useState(true);const [failed,setFailed]=useState(false);const replyRequest=useRef<string|null>(null);
 const load=async(more=false)=>{setLoading(true);setFailed(false);try{const [parent,page]=await Promise.all([more?Promise.resolve(post):getCommunityPost(id),listCommunityReplies(id,more?cursor:null)]);setPost(parent);setReplies(old=>more?[...old,...page.items]:page.items);setCursor(page.nextCursor);}catch{setFailed(true);}finally{setLoading(false);}};useEffect(()=>{void load();},[id]);
 const reply=async()=>{if(!body.trim())return;replyRequest.current??=randomUUID();try{await createCommunityReply(id,body,undefined,replyRequest.current);replyRequest.current=null;setBody('');await load();}catch{setFailed(true);}};
 const report=(replyId:string)=>Alert.alert(zh?'举报回复':'Report reply',zh?'请选择原因':'Choose a reason',[{text:zh?'垃圾信息':'Spam',onPress:()=>void reportCommunityContent('community_reply',replyId,'spam').catch(()=>setFailed(true))},{text:zh?'骚扰':'Harassment',onPress:()=>void reportCommunityContent('community_reply',replyId,'harassment').catch(()=>setFailed(true))},{text:zh?'暴露精确地点':'Unsafe location',onPress:()=>void reportCommunityContent('community_reply',replyId,'precise_location_exposure').catch(()=>setFailed(true))},{text:zh?'取消':'Cancel',style:'cancel'}]);
 return <ScreenScaffold title={zh?'回复':'Replies'} subtitle={zh?'请避免分享猫的精确位置。':'Keep it useful and avoid sharing precise cat locations.'} nativeAppearance>
 {loading&&!post?<ActivityIndicator color={c.actionPrimary}/>:null}{failed?<Pressable onPress={()=>void load()}><Text style={s.link}>{zh?'重试':'Try again'}</Text></Pressable>:null}
 {post?<View style={s.parent}><Text style={s.author}>{post.author.name}</Text><Text style={s.body}>{post.body}</Text></View>:null}
 {replies.map(r=><View key={r.replyId} style={s.reply}><Text style={s.author}>{r.author.name}</Text><Text style={s.body}>{r.body}</Text>{auth.owner?<View style={s.actions}>{r.canDelete?<Pressable onPress={()=>void deleteCommunityContent('community_reply',r.replyId).then(()=>load()).catch(()=>setFailed(true))}><Text style={s.link}>{zh?'删除':'Delete'}</Text></Pressable>:null}<Pressable onPress={()=>report(r.replyId)}><Text style={s.link}>{zh?'举报':'Report'}</Text></Pressable></View>:null}</View>)}
 {cursor?<Pressable disabled={loading} onPress={()=>void load(true)}><Text style={s.link}>{loading?(zh?'加载中…':'Loading…'):(zh?'加载更多':'Load more')}</Text></Pressable>:null}
 {auth.owner?<View style={s.composer}><TextInput value={body} onChangeText={setBody} multiline placeholder={zh?'写回复':'Write a reply'} placeholderTextColor={c.muted} style={s.input}/><Pressable accessibilityRole="button" accessibilityLabel={zh?'回复':'Reply'} onPress={()=>void reply()}><AppIcon name="send" color={c.actionPrimary} size={19}/></Pressable></View>:<Text style={s.note}>{zh?'登录并确认年满 18 岁后即可回复。':'Sign in and confirm you are 18+ to reply.'}</Text>}
 </ScreenScaffold>;
}
const styles=(c:ReturnType<typeof useNativeColors>)=>StyleSheet.create({parent:{gap:7,padding:14,backgroundColor:c.surface,borderRadius:16},reply:{gap:7,paddingVertical:14,borderBottomWidth:StyleSheet.hairlineWidth,borderColor:c.line},actions:{flexDirection:'row',gap:16},author:{fontSize:17,fontWeight:'600',color:c.ink},body:{fontSize:17,lineHeight:24,color:c.ink},composer:{backgroundColor:c.surface,borderRadius:16,padding:12,flexDirection:'row',alignItems:'flex-end',gap:10},input:{flex:1,minHeight:44,color:c.ink,fontSize:17},link:{fontSize:17,fontWeight:'600',color:c.actionPrimary},note:{fontSize:16,lineHeight:23,color:c.muted}});
