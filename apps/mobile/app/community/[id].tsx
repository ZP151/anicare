import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { createCommunityReply, listCommunityReplies, type CommunityReply } from '../../src/api/community';
import { useAccountSession } from '../../src/auth/use-account-session';
import { AppIcon } from '../../src/components/AppIcon';
import { ScreenScaffold } from '../../src/components/ScreenScaffold';
import { useNativeColors } from '../../src/design/native-colors';

export default function CommunityDetailScreen() {
 const { id } = useLocalSearchParams<{ id: string }>(); const auth = useAccountSession(); const c = useNativeColors(); const s = styles(c); const [replies,setReplies]=useState<readonly CommunityReply[]>([]); const [body,setBody]=useState(''); const [loading,setLoading]=useState(true); const [failed,setFailed]=useState(false);
 const load=async()=>{setLoading(true);setFailed(false);try{setReplies(await listCommunityReplies(id));}catch{setFailed(true);}finally{setLoading(false);}}; useEffect(()=>{void load();},[id]);
 const reply=async()=>{try{await createCommunityReply(id,body);setBody('');await load();}catch{setFailed(true);}};
 return <ScreenScaffold title="Replies" subtitle="Keep it useful and avoid sharing precise cat locations." nativeAppearance>
  {loading?<ActivityIndicator color={c.actionPrimary}/>:null}{failed?<Pressable onPress={()=>void load()}><Text style={s.link}>Try again</Text></Pressable>:null}
  {replies.map(r=><View key={r.replyId} style={s.reply}><Text style={s.author}>{r.author.name}</Text><Text style={s.body}>{r.body}</Text></View>)}
  {auth.owner?<View style={s.composer}><TextInput value={body} onChangeText={setBody} multiline placeholder="Write a reply" placeholderTextColor={c.muted} style={s.input}/><Pressable accessibilityRole="button" accessibilityLabel="Reply" onPress={()=>void reply()}><AppIcon name="send" color={c.actionPrimary} size={19}/></Pressable></View>:<Text style={s.note}>Sign in and confirm you are 18+ to reply.</Text>}
 </ScreenScaffold>;
}
const styles=(c:ReturnType<typeof useNativeColors>)=>StyleSheet.create({reply:{gap:7,paddingVertical:14,borderBottomWidth:StyleSheet.hairlineWidth,borderColor:c.line},author:{fontSize:17,fontWeight:'600',color:c.ink},body:{fontSize:17,lineHeight:24,color:c.ink},composer:{backgroundColor:c.surface,borderRadius:16,padding:12,flexDirection:'row',alignItems:'flex-end',gap:10},input:{flex:1,minHeight:44,color:c.ink,fontSize:17},link:{fontSize:17,fontWeight:'600',color:c.actionPrimary},note:{fontSize:16,lineHeight:23,color:c.muted}});
