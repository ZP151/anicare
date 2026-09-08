import {useRef} from 'react';
import {Alert,Pressable} from 'react-native';
import {randomUUID} from 'expo-crypto';
import {blockCommunityAuthor,deleteCommunityContent,reportCommunityContent} from '../api/community';
import {AppIcon} from '../components/AppIcon';
import {useNativeColors} from '../design/native-colors';

export function CommunityContentActions({type,id,canDelete,zh,pin,onChanged,onNotice}:{type:'community_post'|'community_reply';id:string;canDelete:boolean;zh:boolean;pin:()=>()=>Promise<boolean>;onChanged:()=>void|Promise<void>;onNotice:(message:string)=>void}){
 const c=useNativeColors();const busy=useRef(false);const pending=useRef(new Map<string,string>());
 const open=()=>{
   const current=pin();
   const run=async(action:'delete'|'block'|'report',reason='spam')=>{
     if(busy.current)return;busy.current=true;
     try{if(!await current())return;const key=`${action}:${reason}`;const request=pending.current.get(key)??randomUUID();pending.current.set(key,request);
       if(action==='delete')await deleteCommunityContent(type,id,undefined,request);
       else if(action==='block')await blockCommunityAuthor(type,id,undefined,request);
       else await reportCommunityContent(type,id,reason,undefined,request);
       if(await current()){pending.current.delete(key);onNotice(zh?(action==='report'?'举报已提交':action==='delete'?'内容已删除':'已屏蔽该作者'):(action==='report'?'Report submitted':action==='delete'?'Content deleted':'Author blocked'));await onChanged();}
     }catch{if(await current())onNotice(zh?'操作未完成，请重试。':'Could not complete the action. Please retry.');}finally{busy.current=false;}
   };
   const reasons=()=>Alert.alert(zh?'举报原因':'Report reason',undefined,[{text:zh?'垃圾信息':'Spam',onPress:()=>void run('report','spam')},{text:zh?'骚扰':'Harassment',onPress:()=>void run('report','harassment')},{text:zh?'暴露精确地点':'Precise location exposure',onPress:()=>void run('report','precise_location_exposure')},{text:zh?'取消':'Cancel',style:'cancel'}]);
   Alert.alert(zh?'内容选项':'Content options',undefined,canDelete?[{text:zh?'删除':'Delete',style:'destructive',onPress:()=>void run('delete')},{text:zh?'取消':'Cancel',style:'cancel'}]:[{text:zh?'举报':'Report',onPress:reasons},{text:zh?'屏蔽作者':'Block author',style:'destructive',onPress:()=>void run('block')},{text:zh?'取消':'Cancel',style:'cancel'}]);
 };
 return <Pressable accessibilityRole="button" accessibilityLabel={zh?'内容选项':'Content options'} onPress={open} style={{width:44,minHeight:44,alignItems:'center',justifyContent:'center'}}><AppIcon name="more" size={20} color={c.muted}/></Pressable>;
}
