import * as Crypto from 'expo-crypto';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { changeFollow, getFollowState } from '../api/follows';
import { useAccountSession } from '../auth/use-account-session';
import { useLocale } from '../i18n/LocaleContext';
import { useCareStyles } from '../care/CareEntry';
import { GlassSurface } from '../design/GlassSurface';
import { useNativeColors } from '../design/native-colors';
import { AppIcon } from '../components/AppIcon';
export function FollowControl({animalId,compact=false}:{animalId:string;compact?:boolean}) {
 const {locale}=useLocale();const cn=locale==='zh-CN';const router=useRouter();const auth=useAccountSession();
 const styles=useCareStyles();const colors=useNativeColors();
 const [following,setFollowing]=useState<boolean|null>(null);const [failed,setFailed]=useState(false);const [busy,setBusy]=useState(false);
 const pending=useRef<{following:boolean;requestId:string}|null>(null);const active=useRef(false);
 useEffect(()=>{setFollowing(null);setFailed(false);setBusy(false);pending.current=null;active.current=false;if(!auth.owner)return;
  const current=auth.pin();let mounted=true;
  void getFollowState(animalId).then(async value=>{if(mounted&&await current())setFollowing(value);}).catch(async()=>{if(mounted&&await current())setFailed(true);});
  return()=>{mounted=false;};
 },[animalId,auth.owner,auth.pin]);
 async function change(){
  if(active.current||!auth.owner||following===null)return;const current=auth.pin();const token=auth.epoch.current;
  active.current=true;setBusy(true);setFailed(false);
  try{if(!await current())return;pending.current??={following:!following,requestId:Crypto.randomUUID()};await changeFollow(animalId,pending.current.following,pending.current.requestId);
   if(!await current())return;const state=await getFollowState(animalId);if(!await current())return;pending.current=null;setFollowing(state);
  }catch{if(await current())setFailed(true);}finally{if(token===auth.epoch.current){active.current=false;setBusy(false);}}
 }
 if(compact){
  const label=auth.owner===null?(cn?'登录后关注猫':'Sign in to follow cats.'):auth.owner===undefined?(cn?'正在读取关注状态…':'Loading follow state…'):failed&&following===null?(cn?'重试':'Retry'):pending.current?(cn?'重试关注操作':'Retry follow change'):following?(cn?'取消关注':'Unfollow cat'):(cn?'关注这只猫':'Follow cat');
  return <GlassSurface interactive style={{borderRadius:24,overflow:'hidden'}}><Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{selected:following===true,busy}} disabled={busy||auth.owner===undefined||(!failed&&following===null&&auth.owner!==null)} onPress={()=>{if(auth.owner===null)router.push('/profile' as never);else if(following===null)void auth.reload();else void change();}} style={{minWidth:48,minHeight:48,alignItems:'center',justifyContent:'center',paddingHorizontal:12}}><AppIcon name={failed?'activity':'heart'} size={24} color={following?colors.actionPrimary:colors.ink}/>{following?<Text style={{color:colors.actionPrimary,fontSize:10}}>{cn?'已关注':'Following'}</Text>:null}{failed?<Text accessibilityRole="alert" style={{color:colors.danger,fontSize:11}}>{cn?'重试':'Retry'}</Text>:null}</Pressable></GlassSurface>;
 }
 if(auth.owner===undefined)return <Text style={{color:colors.ink}}>{auth.failed?(cn?'账户不可用':'Account unavailable'):(cn?'正在读取关注状态…':'Loading follow state…')}</Text>;
 if(auth.owner===null)return <Pressable accessibilityRole="button" style={styles.choice} onPress={()=>router.push('/profile' as never)}><Text>{cn?'登录后关注猫':'Sign in to follow cats.'}</Text></Pressable>;
 return <View><Pressable accessibilityRole="button" disabled={busy||following===null} style={styles.choice} onPress={()=>{void change();}}><Text>{pending.current?(cn?'重试关注操作':'Retry follow change'):following?(cn?'取消关注':'Unfollow cat'):(cn?'关注这只猫':'Follow cat')}</Text></Pressable>
 {failed||following===null?<><Text>{cn?'暂时无法确认关注状态。':'Could not confirm follow state.'}</Text>{!pending.current?<Pressable accessibilityRole="button" style={styles.choice} onPress={()=>{void auth.reload();}}><Text>{cn?'重试':'Retry'}</Text></Pressable>:null}</>:null}</View>;
}
