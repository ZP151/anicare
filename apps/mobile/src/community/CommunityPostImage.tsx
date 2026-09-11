import {useEffect,useState} from 'react';
import {Image,Text,View,type ImageStyle,type StyleProp,type ImageResizeMode} from 'react-native';
import {getSupabaseClient} from '../api/supabase';
import {communityMediaUrl} from '../api/community-extras';
import {useAccountSession} from '../auth/use-account-session';
import {useNativeColors} from '../design/native-colors';
import {AppIcon} from '../components/AppIcon';

/** Keep signed-in reads signed in; a blocked author must not become a guest image request. */
export function CommunityPostImage({postId,mediaId,variant='thumb',style,label,resizeMode='cover'}:{postId:string;mediaId:string;variant?:'thumb'|'display';style:StyleProp<ImageStyle>;label:string;resizeMode?:ImageResizeMode}){
 const auth=useAccountSession(),c=useNativeColors();const [identity,setIdentity]=useState<{owner:string;token:string}|null>(null),[failed,setFailed]=useState(false);
 useEffect(()=>{
  let active=true;setIdentity(null);setFailed(false);
  if(auth.owner){const owner=auth.owner;void getSupabaseClient()?.auth.getSession().then(({data,error})=>{if(active&&!error&&data.session?.user.id===owner)setIdentity({owner,token:data.session.access_token});}).catch(()=>{});}
  return()=>{active=false;};
 },[auth.owner,postId,mediaId]);
 const uri=communityMediaUrl(postId,mediaId,variant);
 const ready=auth.owner===null||!!auth.owner&&identity?.owner===auth.owner;
 if(!uri||!ready||failed)return <View accessibilityLabel={label} style={[style,{backgroundColor:c.leafSoft,alignItems:'center',justifyContent:'center'}]}><AppIcon name="photo" size={24} color={c.muted}/><Text style={{fontSize:11,color:c.muted}}>Photo unavailable</Text></View>;
 return <Image accessibilityLabel={label} source={{uri,cache:'reload',headers:auth.owner&&identity?{Authorization:`Bearer ${identity.token}`}:{}}} onError={()=>setFailed(true)} resizeMode={resizeMode} style={style}/>;
}
