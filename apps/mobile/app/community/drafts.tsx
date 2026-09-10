import {useFocusEffect,useRouter} from 'expo-router';
import {useCallback,useState} from 'react';
import {Alert,Pressable,Text,View} from 'react-native';
import {useAccountSession} from '../../src/auth/use-account-session';
import {ScreenScaffold} from '../../src/components/ScreenScaffold';
import {AppIcon} from '../../src/components/AppIcon';
import {useNativeColors} from '../../src/design/native-colors';
import {useLocale} from '../../src/i18n/LocaleContext';
import type {SocialDraft} from '../../src/community/post-draft';
import {socialDraftStore} from '../../src/community/post-draft-store';
export default function SocialDrafts(){
 const auth=useAccountSession(),router=useRouter(),c=useNativeColors(),{locale}=useLocale(),zh=locale==='zh-CN';
 const [drafts,setDrafts]=useState<SocialDraft[]>([]),[failed,setFailed]=useState(false);
 const load=useCallback(async()=>{setFailed(false);if(!auth.owner){setDrafts([]);return;}const current=auth.pin();try{const items=await socialDraftStore.list(auth.owner);if(await current())setDrafts(items);}catch{if(await current())setFailed(true);}},[auth.owner,auth.pin]);
 useFocusEffect(useCallback(()=>{setDrafts([]);void load();},[load]));
 const remove=(draft:SocialDraft)=>Alert.alert(zh?'删除草稿？':'Delete draft?',undefined,[{text:zh?'取消':'Cancel',style:'cancel'},{text:zh?'删除':'Delete',style:'destructive',onPress:()=>{void socialDraftStore.remove(draft.ownerId,draft.id).then(load).catch(()=>setFailed(true));}}]);
 return <ScreenScaffold title={zh?'帖子草稿':'Post drafts'} trailing={<Pressable accessibilityRole="button" accessibilityLabel={zh?'关闭':'Close'} style={{minWidth:44,minHeight:44,justifyContent:'center'}} onPress={()=>router.canGoBack()?router.back():router.replace('/' as never)}><AppIcon name="close" color={c.ink}/></Pressable>}>
 {failed?<Pressable onPress={()=>void load()} style={{minHeight:44}}><Text style={{color:c.actionPrimary}}>{zh?'未能载入，请重试':'Could not load. Retry'}</Text></Pressable>:null}
 {!failed&&!drafts.length?<Text style={{color:c.muted}}>{zh?'还没有保存的帖子草稿。':'No saved post drafts yet.'}</Text>:null}
 {drafts.map(draft=><View key={draft.id} style={{flexDirection:'row',alignItems:'center',gap:8,borderBottomWidth:0.5,borderColor:c.line}}><Pressable accessibilityRole="button" onPress={()=>router.push(`/community/new?draftId=${draft.id}` as never)} style={{flex:1,minHeight:72,justifyContent:'center',gap:5}}><Text numberOfLines={2} style={{color:c.ink,fontSize:15,fontWeight:'600'}}>{draft.title||draft.body||(zh?'未命名草稿':'Untitled draft')}</Text><Text style={{color:c.muted,fontSize:12}}>{draft.images.length} {zh?'张照片':'photos'} · {new Date(draft.updatedAt).toLocaleDateString(zh?'zh-SG':'en-SG')}{draft.phase==='publishing'?(zh?' · 待确认发布':' · Pending publication'):''}</Text></Pressable>{draft.phase==='editing'?<Pressable accessibilityRole="button" accessibilityLabel={zh?'删除草稿':'Delete draft'} onPress={()=>remove(draft)} style={{minWidth:44,minHeight:44,justifyContent:'center',alignItems:'center'}}><AppIcon name="close" size={18} color={c.muted}/></Pressable>:null}</View>)}
 </ScreenScaffold>;
}
