import {useRef,useState} from 'react';
import {Alert,Pressable,Share} from 'react-native';
import {AppIcon} from './AppIcon';
import {useNativeColors} from '../design/native-colors';
/** Only public opaque identities belong in a share sheet; no body, token or location. */
export function PublicShareButton({kind,id,zh}:{kind:'post'|'cat';id:string;zh:boolean}){
 const c=useNativeColors(),pending=useRef(false),[busy,setBusy]=useState(false);
 const valid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
 async function share(){if(pending.current||!valid)return;pending.current=true;setBusy(true);
  try{await Share.share({message:`Whisker Commons\nanimalhelper://${kind==='cat'?'cat':'community'}/${id.toLowerCase()}`});}
  catch{Alert.alert(zh?'暂时无法分享':'Could not share',zh?'请稍后重试。':'Please try again.');}
  finally{pending.current=false;setBusy(false);}
 }
 return <Pressable accessibilityRole="button" accessibilityLabel={zh?(kind==='cat'?'分享猫主页':'分享帖子'):(kind==='cat'?'Share cat home':'Share post')} disabled={!valid||busy} onPress={()=>void share()} style={{minWidth:44,minHeight:44,alignItems:'center',justifyContent:'center'}}><AppIcon name="share" size={21} color={c.ink}/></Pressable>;
}
