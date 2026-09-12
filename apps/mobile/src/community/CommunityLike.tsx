import { useEffect, useRef, useState } from 'react';
import { Pressable, Text } from 'react-native';
import { AppIcon } from '../components/AppIcon';
import { useNativeColors } from '../design/native-colors';
import { setCommunityLike, type CommunityReaction } from '../api/community-reactions';
export function CommunityLike({reaction, zh, owner, pin, onChange, onSignIn, onError}:{reaction:CommunityReaction;zh:boolean;owner:string|null|undefined;pin():()=>Promise<boolean>;onChange(r:CommunityReaction):void;onSignIn():void;onError():void}) {
 const c=useNativeColors(),pending=useRef(false);const [busy,setBusy]=useState(false);
 const alive=useRef(true),scope=useRef('');scope.current=`${owner}|${reaction.postId}`;
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 const like=async()=>{if(!owner){onSignIn();return;}if(pending.current)return;pending.current=true;setBusy(true);const current=pin(),captured=scope.current;const valid=async()=>alive.current&&captured===scope.current&&await current();try{if(!await valid())return;const result=await setCommunityLike(reaction.postId,!reaction.liked);if(await valid())onChange(result);}catch{if(await valid())onError();}finally{pending.current=false;if(alive.current&&captured===scope.current)setBusy(false);}};
 return <Pressable accessibilityRole="button" accessibilityLabel={reaction.liked?(zh?'取消点赞':'Unlike'):(zh?'点赞':'Like')} accessibilityState={{selected:reaction.liked,disabled:busy}} disabled={busy} onPress={()=>{void like();}} style={{minHeight:44,minWidth:54,flexDirection:'row',alignItems:'center',gap:6}}><AppIcon name={reaction.liked?'heartFilled':'heart'} size={21} color={reaction.liked?c.actionSecondary:c.muted}/>{reaction.likeCount>0?<Text style={{color:c.muted}}>{reaction.likeCount}</Text>:null}</Pressable>;
}
